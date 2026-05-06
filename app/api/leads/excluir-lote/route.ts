import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      )
    }

    const { data: perfil } = await supabase
      .from('profiles')
      .select('nivel_acesso')
      .eq('id', user.id)
      .single()

    if (!perfil || perfil.nivel_acesso !== 'administrador') {
      return NextResponse.json(
        { error: 'Sem permissão para excluir leads.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number).filter(Boolean)
      : []

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum lead informado.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await admin
      .from('leads')
      .delete()
      .in('id', ids)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error('ERRO AO EXCLUIR LEADS:', error)

    return NextResponse.json(
      { error: 'Erro interno ao excluir leads.' },
      { status: 500 }
    )
  }
}