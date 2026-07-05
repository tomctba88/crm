import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function exigirUsuario() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

// GET /api/pedidos  → lista de pedidos (com nome do cliente)
export async function GET() {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data, error } = await admin()
      .from('pedidos')
      .select('*, clientes(nome_cliente, nome_empresa)')
      .order('id', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ pedidos: data || [] })
  } catch (e) {
    console.error('ERRO GET /api/pedidos:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// POST /api/pedidos  → cria um pedido (RASCUNHO) e gera o número PED-AAAA-####
export async function POST(req: Request) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const db = admin()

    const insert = {
      cliente_id: body.cliente_id ?? null,
      lead_id: body.lead_id ?? null,
      pos_venda_id: body.pos_venda_id ?? null,
      vendedor: body.vendedor ?? user.email ?? null,
      uf: body.uf ?? null,
      cidade: body.cidade ?? null,
      prazo_entrega: body.prazo_entrega ?? null,
      observacoes: body.observacoes ?? null,
      status_global: 'RASCUNHO',
    }

    const { data: criado, error } = await db.from('pedidos').insert(insert).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const ano = new Date().getFullYear()
    const numero = `PED-${ano}-${String(criado.id).padStart(4, '0')}`
    const { data: comNumero, error: errNum } = await db
      .from('pedidos')
      .update({ numero })
      .eq('id', criado.id)
      .select('*')
      .single()

    if (errNum) return NextResponse.json({ error: errNum.message }, { status: 400 })
    return NextResponse.json({ pedido: comNumero })
  } catch (e) {
    console.error('ERRO POST /api/pedidos:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
