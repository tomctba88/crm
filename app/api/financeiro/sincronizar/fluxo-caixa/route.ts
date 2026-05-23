import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { tinyPaginado } from '@/lib/tiny/api'

function parseDateBR(dataBR: string): string | null {
  const parts = dataBR.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return null
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist')
      .select('token, ativo')
      .eq('nome', 'olist_tiny')
      .maybeSingle()

    if (!integracao?.token || !integracao.ativo) {
      return NextResponse.json({ error: 'Token do Tiny não configurado ou integração inativa.' }, { status: 400 })
    }

    const token = integracao.token
    let sincronizados = 0
    let erros = 0

    // Entradas = contas recebidas
    const recebidas = await tinyPaginado(
      token,
      'contas.receber.pesquisa',
      'contas_receber',
      'conta',
      { situacao: 'recebido' }
    )

    for (const item of recebidas) {
      try {
        const tinyId = `cr-${item.id ?? item.numero}`
        if (!tinyId || tinyId === 'cr-') continue
        const dataLanc = item.data_pagamento
          ? parseDateBR(String(item.data_pagamento))
          : item.data_vencimento
            ? parseDateBR(String(item.data_vencimento))
            : null
        if (!dataLanc) continue

        const row = {
          tiny_id: tinyId,
          tipo: 'entrada',
          descricao: String(item.historico ?? item.descricao ?? ''),
          valor: Number(item.valor ?? 0),
          data_lancamento: dataLanc,
          categoria: String(item.categoria ?? ''),
          conta_bancaria: String(item.conta_bancaria ?? ''),
          documento_referencia: String(item.numero ?? ''),
          origem: 'tiny',
        }

        const { error } = await supabase
          .from('fin_fluxo_caixa')
          .upsert(row, { onConflict: 'tiny_id' })

        if (error) { erros++; continue }
        sincronizados++
      } catch {
        erros++
      }
    }

    // Saídas = contas pagas
    const pagas = await tinyPaginado(
      token,
      'contas.pagar.pesquisa',
      'contas_pagar',
      'conta',
      { situacao: 'pago' }
    )

    for (const item of pagas) {
      try {
        const tinyId = `cp-${item.id ?? item.numero}`
        if (!tinyId || tinyId === 'cp-') continue
        const dataLanc = item.data_pagamento
          ? parseDateBR(String(item.data_pagamento))
          : item.data_vencimento
            ? parseDateBR(String(item.data_vencimento))
            : null
        if (!dataLanc) continue

        const row = {
          tiny_id: tinyId,
          tipo: 'saida',
          descricao: String(item.historico ?? item.descricao ?? ''),
          valor: Number(item.valor ?? 0),
          data_lancamento: dataLanc,
          categoria: String(item.categoria ?? ''),
          conta_bancaria: String(item.conta_bancaria ?? ''),
          documento_referencia: String(item.numero ?? ''),
          origem: 'tiny',
        }

        const { error } = await supabase
          .from('fin_fluxo_caixa')
          .upsert(row, { onConflict: 'tiny_id' })

        if (error) { erros++; continue }
        sincronizados++
      } catch {
        erros++
      }
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'fluxo_caixa',
      status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
      mensagem: `${sincronizados} lançamentos de fluxo de caixa sincronizados. ${erros} erros.`,
      detalhes: { sincronizados, erros },
    })

    return NextResponse.json({
      sincronizados,
      erros,
      ultima_sync: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
