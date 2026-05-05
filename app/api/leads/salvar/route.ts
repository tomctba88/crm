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
    const leadId = body.leadId ? Number(body.leadId) : null
    const payload = body.payload || {}

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (leadId) {
      const { error } = await admin
        .from('leads')
        .update(payload)
        .eq('id', leadId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Lead atualizado com sucesso.',
      })
    }

    const { error } = await admin
      .from('leads')
      .insert(payload)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Lead cadastrado com sucesso.',
    })
  } catch (error) {
    console.error('ERRO AO SALVAR LEAD:', error)

    return NextResponse.json(
      { error: 'Erro interno ao salvar lead.' },
      { status: 500 }
    )
  }
}