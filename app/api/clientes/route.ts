import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

export async function GET(req: Request) {
  try {
    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() || ''

    if (q.length < 2) {
      return NextResponse.json({ clientes: [] })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await admin
      .from('clientes')
      .select('id, nome_cliente, nome_empresa, telefone, uf')
      .or(`nome_cliente.ilike.%${q}%,nome_empresa.ilike.%${q}%,telefone.ilike.%${q}%`)
      .order('nome_cliente', { ascending: true })
      .limit(10)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ clientes: data || [] })
  } catch (error) {
    console.error('ERRO AO BUSCAR CLIENTES:', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
