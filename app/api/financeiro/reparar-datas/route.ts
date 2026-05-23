import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

// Reseta data_recebimento/data_pagamento → data_vencimento para todas as contas
// pagas históricas. Use quando o sync armazenou a data do dia em vez da data real.
// Após o reparo, sincronize novamente; novas transições receberão datas reais do Tiny.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const [{ data: recebidas, error: eCR }, { data: pagas, error: eCP }] = await Promise.all([
      supabase.from('fin_contas_receber')
        .select('tiny_id, data_vencimento')
        .eq('status', 'recebido')
        .not('data_vencimento', 'is', null),
      supabase.from('fin_contas_pagar')
        .select('tiny_id, data_vencimento')
        .eq('status', 'pago')
        .not('data_vencimento', 'is', null),
    ])

    if (eCR) return NextResponse.json({ error: eCR.message }, { status: 500 })
    if (eCP) return NextResponse.json({ error: eCP.message }, { status: 500 })

    // Upsert em lote restaurando data_recebimento = data_vencimento
    const recCR = (recebidas ?? []).map(r => ({
      tiny_id: r.tiny_id,
      data_recebimento: r.data_vencimento,
    }))
    const recCP = (pagas ?? []).map(r => ({
      tiny_id: r.tiny_id,
      data_pagamento: r.data_vencimento,
    }))

    let errosCR = 0, errosCP = 0
    const CHUNK = 500
    for (let i = 0; i < recCR.length; i += CHUNK) {
      const { error } = await supabase.from('fin_contas_receber')
        .upsert(recCR.slice(i, i + CHUNK), { onConflict: 'tiny_id' })
      if (error) errosCR++
    }
    for (let i = 0; i < recCP.length; i += CHUNK) {
      const { error } = await supabase.from('fin_contas_pagar')
        .upsert(recCP.slice(i, i + CHUNK), { onConflict: 'tiny_id' })
      if (error) errosCP++
    }

    return NextResponse.json({
      ok: true,
      mensagem: 'Datas restauradas para data_vencimento. Sincronize novamente.',
      contas_receber: recCR.length,
      contas_pagar: recCP.length,
      erros_cr: errosCR,
      erros_cp: errosCP,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
