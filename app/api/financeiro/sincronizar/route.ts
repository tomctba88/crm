import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { syncContasReceber, syncContasPagar, syncCaixa } from '@/lib/financeiro/sync'

export const maxDuration = 300

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

    // Caixa: last 3 years of real cash movements
    const hoje = new Date()
    const dataFinal = hoje.toISOString().slice(0, 10)
    const ini3anos = new Date(hoje); ini3anos.setFullYear(ini3anos.getFullYear() - 3)
    const dataInicial = ini3anos.toISOString().slice(0, 10)

    // Contas a receber/pagar (only open) run first; caixa runs after
    const cr = await syncContasReceber(supabase, token)
      .then(v => ({ status: 'fulfilled' as const, value: v }))
      .catch(e => ({ status: 'rejected' as const, reason: e }))

    const cp = await syncContasPagar(supabase, token)
      .then(v => ({ status: 'fulfilled' as const, value: v }))
      .catch(e => ({ status: 'rejected' as const, reason: e }))

    const fc = await syncCaixa(supabase, token, dataInicial, dataFinal)
      .then(v => ({ status: 'fulfilled' as const, value: v }))
      .catch(e => ({ status: 'rejected' as const, reason: e }))

    const syncedAt = new Date().toISOString()
    await supabase
      .from('integracoes_olist')
      .update({ ultimo_sync_em: syncedAt, updated_at: syncedAt })
      .eq('nome', 'olist_tiny')

    const resultado = {
      contas_receber: cr.status === 'fulfilled' ? cr.value : { error: String((cr as PromiseRejectedResult).reason) },
      contas_pagar: cp.status === 'fulfilled' ? cp.value : { error: String((cp as PromiseRejectedResult).reason) },
      fluxo_caixa: fc.status === 'fulfilled' ? fc.value : { error: String((fc as PromiseRejectedResult).reason) },
      ultima_sync: syncedAt,
    }

    const totalSincronizados =
      ('sincronizados' in resultado.contas_receber ? resultado.contas_receber.sincronizados : 0) +
      ('sincronizados' in resultado.contas_pagar ? resultado.contas_pagar.sincronizados : 0) +
      ('sincronizados' in resultado.fluxo_caixa ? resultado.fluxo_caixa.sincronizados : 0)

    return NextResponse.json({ ...resultado, total_sincronizados: totalSincronizados })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
