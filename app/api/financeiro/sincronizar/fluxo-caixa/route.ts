import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { syncFluxoCaixa } from '@/lib/financeiro/sync'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()

    if (!integracao?.token || !integracao.ativo)
      return NextResponse.json({ error: 'Token não configurado ou integração inativa.' }, { status: 400 })

    const resultado = await syncFluxoCaixa(supabase)
    return NextResponse.json({ ...resultado, ultima_sync: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, { status: 500 })
  }
}
