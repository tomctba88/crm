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
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await req.json()
    const id = body.id ? Number(body.id) : null
    const nome_cliente = (body.nome_cliente || '').toString().toUpperCase().trim()
    const nome_empresa = body.nome_empresa
      ? body.nome_empresa.toString().toUpperCase().trim()
      : null
    const telefone = body.telefone?.trim() || null
    const uf = body.uf?.trim() || null

    if (!nome_cliente) {
      return NextResponse.json(
        { error: 'Nome do cliente é obrigatório.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (id) {
      const { error } = await admin
        .from('clientes')
        .update({
          nome_cliente,
          nome_empresa,
          telefone,
          uf,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    } else {
      const { error } = await admin
        .from('clientes')
        .insert({ nome_cliente, nome_empresa, telefone, uf })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('ERRO AO SALVAR CLIENTE:', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
