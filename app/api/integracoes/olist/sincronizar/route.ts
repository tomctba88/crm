import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

type TinyResource = {
  nome: string
  tabela: 'olist_clientes_raw' | 'olist_pedidos_raw' | 'olist_contas_receber_raw' | 'olist_contas_pagar_raw' | 'olist_notas_raw'
  endpoint: string
  collectionKey: string
  itemKey?: string
}

type TinyCollectionItem = Record<string, unknown>

const TINY_RESOURCES: TinyResource[] = [
  { nome: 'clientes', tabela: 'olist_clientes_raw', endpoint: 'https://api.tiny.com.br/api2/contatos.pesquisa.php', collectionKey: 'contatos', itemKey: 'contato' },
  { nome: 'pedidos', tabela: 'olist_pedidos_raw', endpoint: 'https://api.tiny.com.br/api2/pedidos.pesquisa.php', collectionKey: 'pedidos', itemKey: 'pedido' },
  { nome: 'contas_receber', tabela: 'olist_contas_receber_raw', endpoint: 'https://api.tiny.com.br/api2/contas.receber.pesquisa.php', collectionKey: 'contas_receber', itemKey: 'conta' },
  { nome: 'contas_pagar', tabela: 'olist_contas_pagar_raw', endpoint: 'https://api.tiny.com.br/api2/contas.pagar.pesquisa.php', collectionKey: 'contas_pagar', itemKey: 'conta' },
  { nome: 'notas_fiscais', tabela: 'olist_notas_raw', endpoint: 'https://api.tiny.com.br/api2/notas.fiscais.pesquisa.php', collectionKey: 'notas_fiscais', itemKey: 'nota_fiscal' },
]

function extrairItem(rawItem: unknown, itemKey?: string): Record<string, unknown> | null {
  if (!rawItem || typeof rawItem !== 'object') return null
  const base = rawItem as Record<string, unknown>
  if (itemKey) {
    const nested = base[itemKey]
    if (nested && typeof nested === 'object') return nested as Record<string, unknown>
  }
  return base
}

function extrairIdExterno(item: Record<string, unknown>, fallback: string): string {
  const value = item.id ?? item.id_tiny ?? item.numero ?? item.codigo ?? item.idContato ?? item.idPedido
  return value ? String(value) : fallback
}

async function buscarColecaoTiny(endpoint: string, token: string, collectionKey: string): Promise<TinyCollectionItem[]> {
  const body = new URLSearchParams({ token, formato: 'json', pagina: '1' })
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error('Falha HTTP ao consultar a API do Tiny.')
  const retorno = result?.retorno
  if (Number(retorno?.status_processamento) !== 3) {
    throw new Error(retorno?.erros?.[0]?.erro || retorno?.erros?.[0]?.mensagem || `Erro ao consultar ${collectionKey} na API do Tiny.`)
  }
  const collection = retorno?.[collectionKey]
  return Array.isArray(collection) ? (collection as TinyCollectionItem[]) : []
}

export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { data: integracao, error: integracaoError } = await supabase
      .from('integracoes_olist')
      .select('*')
      .eq('nome', 'olist_tiny')
      .single()

    if (integracaoError || !integracao?.token) {
      return NextResponse.json({ error: 'Token da integração não configurado.' }, { status: 400 })
    }

    if (!integracao.ativo) {
      return NextResponse.json({ error: 'Ative a integração antes de sincronizar.' }, { status: 400 })
    }

    const syncedAt = new Date().toISOString()
    const resumo: { recurso: string; status: string; total: number; mensagem: string }[] = []

    for (const recurso of TINY_RESOURCES) {
      try {
        const items = await buscarColecaoTiny(recurso.endpoint, integracao.token, recurso.collectionKey)

        const rows = items
          .map((rawItem, index) => {
            const item = extrairItem(rawItem, recurso.itemKey)
            if (!item) return null
            return {
              external_id: extrairIdExterno(item, `${recurso.nome}-${index + 1}`),
              payload: item,
              updated_at: syncedAt,
            }
          })
          .filter((row): row is NonNullable<typeof row> => row !== null)

        if (rows.length > 0) {
          const { error: upsertError } = await supabase
            .from(recurso.tabela)
            .upsert(rows, { onConflict: 'external_id' })
          if (upsertError) throw upsertError
        }

        await supabase.from('logs_integracao').insert({
          integracao: 'tiny',
          recurso: recurso.nome,
          status: 'sucesso',
          mensagem: `${rows.length} registros sincronizados com sucesso.`,
          detalhes: { total: rows.length },
        })

        resumo.push({ recurso: recurso.nome, status: 'sucesso', total: rows.length, mensagem: `${rows.length} registros sincronizados.` })
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : `Erro inesperado ao sincronizar ${recurso.nome}.`
        await supabase.from('logs_integracao').insert({
          integracao: 'tiny',
          recurso: recurso.nome,
          status: 'erro',
          mensagem,
          detalhes: null,
        })
        resumo.push({ recurso: recurso.nome, status: 'erro', total: 0, mensagem })
      }
    }

    const houveErro = resumo.some((item) => item.status === 'erro')
    const totalGeral = resumo.reduce((acc, item) => acc + item.total, 0)

    await supabase
      .from('integracoes_olist')
      .update({
        status: houveErro ? 'erro' : 'conectado',
        ultimo_sync_em: syncedAt,
        observacoes: houveErro ? 'Sincronização executada com erros parciais.' : 'Sincronização executada com sucesso.',
        updated_at: syncedAt,
      })
      .eq('id', integracao.id)

    return NextResponse.json({
      success: !houveErro,
      status: houveErro ? 'erro' : 'conectado',
      message: `Sincronização concluída. Total de registros processados: ${totalGeral}.`,
      resumo,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado ao sincronizar dados.' },
      { status: 500 }
    )
  }
}
