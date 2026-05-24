import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { getTinyToken, tinyFetchTodas, dataTinyParaISO } from '@/lib/tiny/client'

export const maxDuration = 300

function str(v: unknown): string {
  return v ? String(v) : ''
}

function mapStatus(s: string): string {
  const m: Record<string, string> = {
    'aberto': 'aberto',
    'em aberto': 'aberto',
    'vencido': 'vencido',
    'cancelado': 'cancelado',
  }
  return m[s?.toLowerCase()] ?? 'aberto'
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const token = await getTinyToken(supabase)

    const itens = await tinyFetchTodas(
      token,
      'contas.receber.pesquisa',
      { situacao: 'aberto' },
      'conta'
    )

    const tinyIds = itens.filter(i => !!str(i.id)).map(i => str(i.id))

    const records = itens
      .filter(i => !!str(i.id))
      .map(i => {
        const catObj = i.categoria as any
        const categoria = str(catObj?.nome ?? i.categoria)
        const categoriaId = str(catObj?.id ?? i.categoria_id)
        return {
          tiny_id: str(i.id),
          numero_documento: str(i.numero_doc ?? i.numero ?? i.numeroDocumento),
          cliente: str(i.nome_contato ?? i.nome_cliente ?? i.nome_conta ?? (i.cliente as any)?.nome ?? i.cliente),
          historico: str(i.historico ?? i.descricao),
          valor: Math.abs(Number(i.valor ?? 0)),
          data_vencimento: dataTinyParaISO(str(i.data_vencimento ?? i.dataVencimento)),
          data_emissao: dataTinyParaISO(str(i.data_emissao ?? i.dataEmissao)),
          status: mapStatus(str(i.situacao)),
          categoria,
          categoria_id: categoriaId,
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
      if (error) erros += chunk.length
      else sincronizados += chunk.length
    }

    // Deletar contas que não vieram mais (foram pagas/canceladas no Tiny)
    let deletados = 0
    if (tinyIds.length > 0) {
      const { error: delErr } = await supabase
        .from('fin_contas_receber')
        .delete()
        .eq('origem', 'tiny')
        .not('tiny_id', 'in', `(${tinyIds.map(id => `"${id}"`).join(',')})`)
      if (!delErr) deletados = 0 // count não disponível sem returning
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'contas_receber',
      status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
      mensagem: `${sincronizados} contas a receber sincronizadas. ${erros} erros.`,
      detalhes: { sincronizados, deletados, erros, total_tiny: itens.length },
    })

    return NextResponse.json({ sincronizados, deletados, erros, total_tiny: itens.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
