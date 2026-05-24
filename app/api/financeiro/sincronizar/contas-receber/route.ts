import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { getTinyToken, tinyFetchTodas, dataTinyParaISO } from '@/lib/tiny/client'

export const maxDuration = 300

function str(v: unknown): string {
  return v ? String(v) : ''
}

function fmtBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function mapStatus(s: string): string {
  const lower = s?.toLowerCase() ?? ''
  if (lower.includes('aberto') || lower === 'a receber') return 'aberto'
  if (lower.includes('vencido')) return 'vencido'
  if (lower.includes('recebido') || lower.includes('pago')) return 'recebido'
  if (lower.includes('cancelado')) return 'cancelado'
  return 'aberto'
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const token = await getTinyToken(supabase)

    // Usar intervalo de datas (abordagem que funciona no Tiny v2)
    const ini = new Date(); ini.setFullYear(ini.getFullYear() - 3)
    const fim = new Date(); fim.setFullYear(fim.getFullYear() + 2)

    const itens = await tinyFetchTodas(
      token,
      'contas.receber.pesquisa',
      { data_ini_vencimento: fmtBR(ini), data_fim_vencimento: fmtBR(fim) },
      'conta'
    )

    // Guardar apenas os títulos em aberto/vencido (não recebidos/cancelados)
    const abertos = itens.filter(i => {
      if (!str(i.id)) return false
      const st = mapStatus(str(i.situacao))
      return st === 'aberto' || st === 'vencido'
    })

    const tinyIds = abertos.map(i => str(i.id))

    const records = abertos.map(i => {
      const catObj = i.categoria as any
      return {
        tiny_id: str(i.id),
        numero_documento: str(i.numero_doc ?? i.numero ?? i.numeroDocumento),
        cliente: str(i.nome_contato ?? i.nome_cliente ?? i.nome_conta ?? (i.cliente as any)?.nome ?? i.cliente),
        historico: str(i.historico ?? i.descricao),
        valor: Math.abs(Number(i.valor ?? 0)),
        data_vencimento: dataTinyParaISO(str(i.data_vencimento ?? i.dataVencimento)),
        data_emissao: dataTinyParaISO(str(i.data_emissao ?? i.dataEmissao)),
        status: mapStatus(str(i.situacao)),
        categoria: str(catObj?.nome ?? i.categoria),
        categoria_id: str(catObj?.id ?? i.categoria_id),
        conta_bancaria: str(i.conta_bancaria ?? i.contaBancaria),
        numero_parcela: i.numero_parcela ? Number(i.numero_parcela) : null,
        numero_parcelas: i.numero_parcelas ? Number(i.numero_parcelas) : null,
        origem: 'tiny',
        sincronizado_em: new Date().toISOString(),
      }
    })

    let sincronizados = 0
    let erros = 0
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500)
      const { error } = await supabase
        .from('fin_contas_receber')
        .upsert(chunk, { onConflict: 'tiny_id' })
      if (error) { console.error('upsert CR error:', error); erros += chunk.length }
      else sincronizados += chunk.length
    }

    // Remover títulos que foram pagos/cancelados no Tiny
    if (tinyIds.length > 0) {
      await supabase
        .from('fin_contas_receber')
        .delete()
        .eq('origem', 'tiny')
        .not('tiny_id', 'in', `(${tinyIds.map(id => `"${id}"`).join(',')})`)
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'contas_receber',
      status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
      mensagem: `${sincronizados}/${itens.length} contas a receber sincronizadas (${itens.length - abertos.length} pagas/canceladas ignoradas). ${erros} erros.`,
      detalhes: { sincronizados, erros, total_tiny: itens.length, total_abertos: abertos.length },
    })

    return NextResponse.json({ sincronizados, erros, total_tiny: itens.length, total_abertos: abertos.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
