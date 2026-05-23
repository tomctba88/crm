import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { data: integracao, error: integracaoError } = await supabase
      .from('integracoes_olist')
      .select('*')
      .eq('nome', 'olist_tiny')
      .single()

    if (integracaoError || !integracao?.token) {
      return NextResponse.json({ error: 'Token da integração não configurado.', status: 'erro' }, { status: 400 })
    }

    const body = new URLSearchParams({ token: integracao.token, formato: 'json' })
    const response = await fetch('https://api.tiny.com.br/api2/info.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      await supabase
        .from('integracoes_olist')
        .update({ status: 'erro', updated_at: new Date().toISOString() })
        .eq('id', integracao.id)
      return NextResponse.json({ error: 'Falha ao conectar com a API do Olist/Tiny.', status: 'erro' }, { status: 400 })
    }

    const retorno = result?.retorno
    if (retorno?.status_processamento !== 3) {
      const erroApi =
        retorno?.erros?.[0]?.erro ||
        retorno?.erros?.[0]?.mensagem ||
        (retorno ? `Resposta Tiny: status_processamento=${retorno.status_processamento}` : 'Resposta vazia ou inválida da API do Tiny.')
      await supabase
        .from('integracoes_olist')
        .update({ status: 'erro', observacoes: erroApi, updated_at: new Date().toISOString() })
        .eq('id', integracao.id)
      return NextResponse.json({ error: erroApi, status: 'erro', debug: result }, { status: 400 })
    }

    await supabase
      .from('integracoes_olist')
      .update({ status: 'conectado', observacoes: 'Conexão validada com sucesso.', updated_at: new Date().toISOString() })
      .eq('id', integracao.id)

    return NextResponse.json({ success: true, status: 'conectado', message: 'Conexão com Olist/Tiny validada com sucesso.' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado ao testar conexão.', status: 'erro' },
      { status: 500 }
    )
  }
}
