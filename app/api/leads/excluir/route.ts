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

    const body = await req.json()
    const id = Number(body.id)

    if (!id) {
      return NextResponse.json(
        { error: 'ID do lead não informado.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: erroOrdens } = await admin
      .from('producao_ordens')
      .delete()
      .eq('lead_id', id)

    if (erroOrdens) {
      return NextResponse.json({ error: erroOrdens.message }, { status: 400 })
    }

    const { error } = await admin.from('leads').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('ERRO AO EXCLUIR LEAD:', error)
    return NextResponse.json(
      { error: 'Erro interno ao excluir lead.' },
      { status: 500 }
    )
  }
}
