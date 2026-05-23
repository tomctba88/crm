import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()

    if (!integracao?.token) return NextResponse.json({ error: 'Token não encontrado.' }, { status: 400 })

    const hoje = new Date()
    const ini = new Date(); ini.setFullYear(hoje.getFullYear() - 3)
    const fim = new Date(); fim.setFullYear(hoje.getFullYear() + 2)
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR')

    const bodyFiltrado = new URLSearchParams({
      token: integracao.token, formato: 'json', pagina: '1',
      data_ini_vencimento: fmt(ini), data_fim_vencimento: fmt(fim),
    })

    const [resCR, resCP] = await Promise.all([
      fetch('https://api.tiny.com.br/api2/contas.receber.pesquisa.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyFiltrado.toString(),
        cache: 'no-store',
      }).then(r => r.json()).catch(e => ({ fetch_error: String(e) })),
      fetch('https://api.tiny.com.br/api2/contas.pagar.pesquisa.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyFiltrado.toString(),
        cache: 'no-store',
      }).then(r => r.json()).catch(e => ({ fetch_error: String(e) })),
    ])

    return NextResponse.json({
      contas_receber_raw: resCR,
      contas_pagar_raw: resCP,
      token_ativo: integracao.ativo,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
