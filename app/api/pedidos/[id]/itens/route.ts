import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { precoFinalProduto, recalcularTotaisPedido } from '@/lib/pedidos/preco-produto'

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

function round2(n: number) {
  return Math.round(n * 100) / 100
}

// POST /api/pedidos/[id]/itens  → adiciona um produto ao pedido (puxa o preço da ficha)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const pedidoId = Number(id)
    const body = await req.json().catch(() => ({}))
    const db = admin()

    const produtoId = body.produto_id ? Number(body.produto_id) : null
    const quantidade = Number(body.quantidade) > 0 ? Number(body.quantidade) : 1

    let valorTabela = 0
    let descricao: string | null = body.descricao ?? null

    if (produtoId) {
      // produto da Produção (formato Tiny): usa o campo preco; senão calcula pela ficha técnica
      const { data: prod } = await db
        .from('producao_produtos')
        .select('nome, preco')
        .eq('id', produtoId)
        .maybeSingle()
      const p = prod as { nome: string | null; preco: number | null } | null
      valorTabela = Number(p?.preco) || 0
      if (!valorTabela) valorTabela = await precoFinalProduto(db, produtoId)
      if (!descricao) descricao = p?.nome ?? null
    }

    const valorUnitario = valorTabela
    const subtotal = round2(valorUnitario * quantidade)

    const { error } = await db.from('pedido_itens').insert({
      pedido_id: pedidoId,
      produto_id: produtoId,
      descricao,
      quantidade,
      valor_tabela: valorTabela,
      valor_unitario: valorUnitario,
      desconto_pct: 0,
      subtotal,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await recalcularTotaisPedido(db, pedidoId)
    const { data: itens } = await db
      .from('pedido_itens')
      .select('*, producao_produtos(nome, sku)')
      .eq('pedido_id', pedidoId)
      .order('id')
    return NextResponse.json({ itens: itens || [] })
  } catch (e) {
    console.error('ERRO POST itens:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH /api/pedidos/[id]/itens  → edita quantidade / preço / desconto de um item
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const pedidoId = Number(id)
    const body = await req.json().catch(() => ({}))
    const db = admin()

    const itemId = Number(body.item_id)
    if (!itemId) return NextResponse.json({ error: 'item_id obrigatório.' }, { status: 400 })

    const { data: atual } = await db
      .from('pedido_itens')
      .select('quantidade, valor_tabela, valor_unitario, desconto_pct')
      .eq('id', itemId)
      .maybeSingle()
    if (!atual) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })

    const valorTabela = Number(atual.valor_tabela) || 0
    let quantidade = Number(atual.quantidade) || 1
    let valorUnitario = Number(atual.valor_unitario) || 0
    let descontoPct = Number(atual.desconto_pct) || 0

    if ('quantidade' in body) quantidade = Number(body.quantidade) > 0 ? Number(body.quantidade) : 1

    // O vendedor pode informar OU o desconto % OU o preço unitário direto.
    if ('desconto_pct' in body) {
      descontoPct = Math.max(0, Math.min(100, Number(body.desconto_pct) || 0))
      valorUnitario = round2(valorTabela * (1 - descontoPct / 100))
    } else if ('valor_unitario' in body) {
      valorUnitario = Math.max(0, Number(body.valor_unitario) || 0)
      descontoPct = valorTabela > 0 ? round2((1 - valorUnitario / valorTabela) * 100) : 0
    }

    const subtotal = round2(valorUnitario * quantidade)

    const { error } = await db
      .from('pedido_itens')
      .update({ quantidade, valor_unitario: valorUnitario, desconto_pct: descontoPct, subtotal })
      .eq('id', itemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await recalcularTotaisPedido(db, pedidoId)
    const { data: itens } = await db
      .from('pedido_itens')
      .select('*, producao_produtos(nome, sku)')
      .eq('pedido_id', pedidoId)
      .order('id')
    return NextResponse.json({ itens: itens || [] })
  } catch (e) {
    console.error('ERRO PATCH itens:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// DELETE /api/pedidos/[id]/itens?item_id=123  → remove um item
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const pedidoId = Number(id)
    const { searchParams } = new URL(req.url)
    const itemId = Number(searchParams.get('item_id'))
    if (!itemId) return NextResponse.json({ error: 'item_id obrigatório.' }, { status: 400 })

    const db = admin()
    const { error } = await db.from('pedido_itens').delete().eq('id', itemId).eq('pedido_id', pedidoId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await recalcularTotaisPedido(db, pedidoId)
    const { data: itens } = await db
      .from('pedido_itens')
      .select('*, producao_produtos(nome, sku)')
      .eq('pedido_id', pedidoId)
      .order('id')
    return NextResponse.json({ itens: itens || [] })
  } catch (e) {
    console.error('ERRO DELETE itens:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
