import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const base = new URL(request.url).origin

    const [cr, cp, fc] = await Promise.allSettled([
      fetch(`${base}/api/financeiro/sincronizar/contas-receber`, { method: 'POST' }).then(r => r.json()),
      fetch(`${base}/api/financeiro/sincronizar/contas-pagar`, { method: 'POST' }).then(r => r.json()),
      fetch(`${base}/api/financeiro/sincronizar/fluxo-caixa`, { method: 'POST' }).then(r => r.json()),
    ])

    const syncedAt = new Date().toISOString()
    await supabase
      .from('integracoes_olist')
      .update({ ultimo_sync_em: syncedAt, updated_at: syncedAt })
      .eq('nome', 'olist_tiny')

    const resultado = {
      contas_receber: cr.status === 'fulfilled' ? cr.value : { error: (cr as PromiseRejectedResult).reason?.message },
      contas_pagar: cp.status === 'fulfilled' ? cp.value : { error: (cp as PromiseRejectedResult).reason?.message },
      fluxo_caixa: fc.status === 'fulfilled' ? fc.value : { error: (fc as PromiseRejectedResult).reason?.message },
      ultima_sync: syncedAt,
    }

    const totalSincronizados =
      (resultado.contas_receber?.sincronizados ?? 0) +
      (resultado.contas_pagar?.sincronizados ?? 0) +
      (resultado.fluxo_caixa?.sincronizados ?? 0)

    return NextResponse.json({ ...resultado, total_sincronizados: totalSincronizados })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
