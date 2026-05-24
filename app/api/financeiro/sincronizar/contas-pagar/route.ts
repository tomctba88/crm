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
  if (lower.includes('aberto') || lower === 'a pagar') return 'aberto'
  if (lower.includes('vencido')) return 'vencido'
  if (lower.includes('pago') || lower.includes('recebido')) return 'pago'
  if (lower.includes('cancelado')) return 'cancelado'
  return 'aberto'
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const token = await getTinyToken(supabase)

    const ini = new Date(); ini.setFullYear(ini.getFullYear() - 3)
    const fim = new Date(); fim.setFullYear(fim.getFullYear() + 2)

    const itens = await tinyFetchTodas(
      token,
      'contas.pagar.pesquisa',
      { data_ini_vencimento: fmtBR(ini), data_fim_vencimento: fmtBR(fim) },
      'conta'
    )

    const validos = itens.filter(i => !!str(i.id))
    const tinyIds = validos.map(i => str(i.id))

    const records = validos.map(i => {
      const catObj = i.categoria as any
      return {
        tiny_id: str(i.id),
        numero_documento: str(i.numero_doc ?? i.numero ?? i.numeroDocumento),
        fornecedor: str(i.nome_contato ?? i.nome_fornecedor ?? i.nome_conta ?? (i.fornecedor as any)?.nome ?? i.fornecedor),
        historico: str(i.historico ?? i.descricao),
        valor: Math.abs(Number(i.valor ?? 0)),
        data_vencimento: dataTinyParaISO(str(i.data_vencimento ?? i.dataVencimento)),
        data_emissao: dataTinyParaISO(str(i.data_emissao ?? i.dataEmissao)),
        data_pagamento: dataTinyParaISO(str(i.data_pagamento ?? i.dataPagamento ?? i.data_baixa ?? i.dataBaixa)),
        valor_pago: Math.abs(Number(i.valor_pago ?? i.valorPago ?? 0)),
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
        .from('fin_contas_pagar')
        .upsert(chunk, { onConflict: 'tiny_id' })
      if (error) { console.error('upsert CP error:', error); erros += chunk.length }
      else sincronizados += chunk.length
    }

    if (tinyIds.length > 0) {
      await supabase
        .from('fin_contas_pagar')
        .delete()
        .eq('origem', 'tiny')
        .not('tiny_id', 'in', `(${tinyIds.map(id => `"${id}"`).join(',')})`)
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'contas_pagar',
      status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
      mensagem: `${sincronizados}/${itens.length} contas a pagar sincronizadas. ${erros} erros.`,
      detalhes: { sincronizados, erros, total_tiny: itens.length },
    })

    return NextResponse.json({ sincronizados, erros, total_tiny: itens.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
