import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const body = await request.json()
    const token = String(body.token || '').trim()
    const ativo = Boolean(body.ativo)
    const observacoes = String(body.observacoes || '').trim()

    if (!token) {
      return NextResponse.json({ error: 'Informe o token da API.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('integracoes_olist')
      .update({ token, ativo, observacoes, status: 'configurado', updated_at: new Date().toISOString() })
      .eq('nome', 'olist_tiny')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: 'configurado' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado ao salvar configuração.' },
      { status: 500 }
    )
  }
}
