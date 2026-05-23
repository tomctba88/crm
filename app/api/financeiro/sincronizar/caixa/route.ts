import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { syncCaixa } from '@/lib/financeiro/sync'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()

    if (!integracao?.token || !integracao.ativo)
      return NextResponse.json({ error: 'Token não configurado ou integração inativa.' }, { status: 400 })

    // Accept ?dataInicial=yyyy-mm-dd&dataFinal=yyyy-mm-dd or default to last 90 days
    const url = new URL(request.url)
    const hoje = new Date()
    const dataFinal = url.searchParams.get('dataFinal') ?? hoje.toISOString().slice(0, 10)
    const defaultIni = new Date(hoje); defaultIni.setDate(defaultIni.getDate() - 90)
    const dataInicial = url.searchParams.get('dataInicial') ?? defaultIni.toISOString().slice(0, 10)

    const resultado = await syncCaixa(supabase, integracao.token, dataInicial, dataFinal)
    return NextResponse.json({ ...resultado, periodo: { dataInicial, dataFinal }, ultima_sync: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, { status: 500 })
  }
}
