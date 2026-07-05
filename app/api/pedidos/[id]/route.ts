import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { recalcularTotaisPedido } from '@/lib/pedidos/preco-produto'

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

// GET /api/pedidos/[id]  → pedido completo (cliente, itens, ordens de produção)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const pedidoId = Number(id)
    const db = admin()

    const [{ data: pedido, error }, { data: itens }, { data: ordens }] = await Promise.all([
      db.from('pedidos').select('*, clientes(nome_cliente, nome_empresa, telefone, uf)').eq('id', pedidoId).maybeSingle(),
      db.from('pedido_itens').select('*, producao_produtos(nome, sku)').eq('pedido_id', pedidoId).order('id'),
      db.from('producao_ordens').select('id, numero, status, data_prevista').eq('pedido_id', pedidoId).order('id'),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })

    return NextResponse.json({ pedido, itens: itens || [], ordens: ordens || [] })
  } catch (e) {
    console.error('ERRO GET /api/pedidos/[id]:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH /api/pedidos/[id]  → atualiza cabeçalho (status, frete, desconto, prazo, cliente, uf/cidade…)
const CAMPOS_PERMITIDOS = [
  'cliente_id', 'lead_id', 'vendedor', 'status_global',
  'uf', 'cidade', 'prazo_entrega', 'valor_frete', 'valor_desconto', 'observacoes',
] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const pedidoId = Number(id)
    const body = await req.json().catch(() => ({}))
    const db = admin()

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const campo of CAMPOS_PERMITIDOS) {
      if (campo in body) patch[campo] = body[campo]
    }

    const { error } = await db.from('pedidos').update(patch).eq('id', pedidoId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // frete ou desconto mudaram → recalcula o total
    if ('valor_frete' in body || 'valor_desconto' in body) {
      await recalcularTotaisPedido(db, pedidoId)
    }

    const { data: pedido } = await db.from('pedidos').select('*').eq('id', pedidoId).maybeSingle()
    return NextResponse.json({ pedido })
  } catch (e) {
    console.error('ERRO PATCH /api/pedidos/[id]:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
