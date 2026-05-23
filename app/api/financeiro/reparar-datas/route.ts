import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { tinyRequest } from '@/lib/tiny/api'

function parseDateBR(dataBR: string): string | null {
  if (!dataBR || dataBR === '0000-00-00') return null
  const parts = dataBR.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return null
}

// Extrai data real de pagamento do endpoint de detalhe do Tiny
async function fetchDataReal(token: string, tinyId: string, tipo: 'receber' | 'pagar'): Promise<string | null> {
  try {
    const endpoint = tipo === 'receber' ? 'contas.receber.obter' : 'contas.pagar.obter'
    const retorno = await tinyRequest(token, endpoint, { id: tinyId })
    const conta = (retorno.conta ?? retorno) as Record<string, unknown>

    for (const key of ['historico_recebimentos', 'historico_pagamentos', 'historico', 'ocorrencias', 'parcelas']) {
      const obj = conta[key]
      if (!obj) continue
      const arr: unknown[] = Array.isArray(obj)
        ? obj
        : Array.isArray((obj as Record<string, unknown>).historico)
          ? (obj as Record<string, unknown[]>).historico
          : []
      if (arr.length === 0) continue
      const first = arr[0] as Record<string, unknown>
      for (const field of ['data_ocorrencia', 'data_pagamento', 'data']) {
        const v = first[field]
        if (v && typeof v === 'string' && v !== '0000-00-00') {
          const parsed = parseDateBR(v)
          if (parsed) return parsed
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// Repara datas reais de recebimento/pagamento para contas históricas
// chamando o endpoint de detalhe do Tiny (contas.receber.obter / contas.pagar.obter).
// Execute uma vez após a primeira sincronização para corrigir dados históricos.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()
    if (!integracao?.token || !integracao.ativo)
      return NextResponse.json({ error: 'Token não configurado.' }, { status: 400 })

    const token = integracao.token
    const CONCURRENCY = 5

    // ── Contas a Receber ──────────────────────────────────────────────────────
    const { data: recebidas } = await supabase
      .from('fin_contas_receber')
      .select('tiny_id')
      .eq('status', 'recebido')

    const idsReceber = (recebidas ?? []).map(r => String(r.tiny_id))
    let atualizadasCR = 0

    for (let i = 0; i < idsReceber.length; i += CONCURRENCY) {
      const batch = idsReceber.slice(i, i + CONCURRENCY)
      const resultados = await Promise.all(
        batch.map(async id => ({ id, data: await fetchDataReal(token, id, 'receber') }))
      )
      for (const { id, data } of resultados) {
        if (!data) continue
        const { error } = await supabase
          .from('fin_contas_receber')
          .update({ data_recebimento: data })
          .eq('tiny_id', id)
        if (!error) atualizadasCR++
      }
    }

    // ── Contas a Pagar ────────────────────────────────────────────────────────
    const { data: pagas } = await supabase
      .from('fin_contas_pagar')
      .select('tiny_id')
      .eq('status', 'pago')

    const idsPagar = (pagas ?? []).map(r => String(r.tiny_id))
    let atualizadasCP = 0

    for (let i = 0; i < idsPagar.length; i += CONCURRENCY) {
      const batch = idsPagar.slice(i, i + CONCURRENCY)
      const resultados = await Promise.all(
        batch.map(async id => ({ id, data: await fetchDataReal(token, id, 'pagar') }))
      )
      for (const { id, data } of resultados) {
        if (!data) continue
        const { error } = await supabase
          .from('fin_contas_pagar')
          .update({ data_pagamento: data })
          .eq('tiny_id', id)
        if (!error) atualizadasCP++
      }
    }

    return NextResponse.json({
      ok: true,
      mensagem: 'Datas reais de recebimento/pagamento atualizadas com sucesso.',
      contas_receber: { total: idsReceber.length, atualizadas: atualizadasCR },
      contas_pagar: { total: idsPagar.length, atualizadas: atualizadasCP },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
