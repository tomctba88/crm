import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

/**
 * Itens da ordem de produção — modelo + cor do revestimento + quantidade.
 *
 * É daqui que saem volume, curva ABC e taxa de refugo. Quando a OP tem pedido,
 * os itens nascem do pedido (`sincronizar`); quando não tem, são digitados.
 */

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function autenticar() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const { data, error } = await admin()
      .from('producao_ordem_itens')
      .select('*, producao_produtos(nome, sku), producao_revestimentos(nome, cor, material)')
      .eq('ordem_id', Number(id))
      .order('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ itens: data || [] })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await autenticar()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const ordemId = Number(id)
    const body = await request.json()
    const db = admin()

    // --- puxar os itens do pedido vinculado --------------------------------
    if (body.sincronizar) {
      const { data: ordem } = await db
        .from('producao_ordens')
        .select('pedido_id')
        .eq('id', ordemId)
        .maybeSingle()

      if (!ordem?.pedido_id) {
        return NextResponse.json(
          { error: 'Esta ordem não tem pedido vinculado. Adicione os itens manualmente.' },
          { status: 400 }
        )
      }

      const { data: itensPedido } = await db
        .from('pedido_itens')
        .select('id, produto_id, descricao, quantidade, valor_unitario')
        .eq('pedido_id', ordem.pedido_id)

      if (!itensPedido || itensPedido.length === 0) {
        return NextResponse.json({ error: 'O pedido não tem itens.' }, { status: 400 })
      }

      const produtoIds = itensPedido.map((i) => i.produto_id).filter(Boolean) as number[]
      const { data: produtos } = produtoIds.length
        ? await db.from('producao_produtos').select('id, nome, preco_custo').in('id', produtoIds)
        : { data: [] }
      const porProduto = new Map((produtos || []).map((p) => [p.id, p]))

      const { error } = await db.from('producao_ordem_itens').upsert(
        itensPedido.map((i) => ({
          ordem_id: ordemId,
          pedido_item_id: i.id,
          produto_id: i.produto_id,
          descricao: i.descricao || porProduto.get(i.produto_id!)?.nome || null,
          qtd_planejada: i.quantidade,
          valor_unitario: i.valor_unitario,
          custo_unitario: porProduto.get(i.produto_id!)?.preco_custo || 0,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'pedido_item_id', ignoreDuplicates: true }
      )

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, importados: itensPedido.length })
    }

    // --- item manual -------------------------------------------------------
    const qtdPlanejada = Number(body.qtd_planejada)
    if (!Number.isFinite(qtdPlanejada) || qtdPlanejada <= 0) {
      return NextResponse.json({ error: 'Informe a quantidade.' }, { status: 400 })
    }

    let descricao: string | null = body.descricao?.trim() || null
    let custoUnitario = Number(body.custo_unitario) || 0
    let valorUnitario = Number(body.valor_unitario) || 0

    // sem preço digitado, herda do cadastro do produto
    if (body.produto_id) {
      const { data: produto } = await db
        .from('producao_produtos')
        .select('nome, preco, preco_custo')
        .eq('id', Number(body.produto_id))
        .maybeSingle()
      if (produto) {
        descricao = descricao || produto.nome
        if (!valorUnitario) valorUnitario = Number(produto.preco || 0)
        if (!custoUnitario) custoUnitario = Number(produto.preco_custo || 0)
      }
    }

    if (!descricao) {
      return NextResponse.json({ error: 'Informe o modelo.' }, { status: 400 })
    }

    const { data, error } = await db
      .from('producao_ordem_itens')
      .insert({
        ordem_id: ordemId,
        produto_id: body.produto_id ? Number(body.produto_id) : null,
        descricao,
        revestimento_id: body.revestimento_id ? Number(body.revestimento_id) : null,
        qtd_planejada: qtdPlanejada,
        qtd_produzida: Number(body.qtd_produzida) || 0,
        valor_unitario: valorUnitario,
        custo_unitario: custoUnitario,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, item: data })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

const CAMPOS_EDITAVEIS = [
  'produto_id', 'descricao', 'revestimento_id',
  'qtd_planejada', 'qtd_produzida', 'valor_unitario', 'custo_unitario',
] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const itemId = Number(body.id)
    if (!itemId) return NextResponse.json({ error: 'Item inválido.' }, { status: 400 })

    const atualizacao: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const campo of CAMPOS_EDITAVEIS) {
      if (campo in body) atualizacao[campo] = body[campo]
    }

    const { error } = await admin()
      .from('producao_ordem_itens')
      .update(atualizacao)
      .eq('id', itemId)
      .eq('ordem_id', Number(id))

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const itemId = Number(new URL(request.url).searchParams.get('itemId'))
    if (!itemId) return NextResponse.json({ error: 'Item inválido.' }, { status: 400 })

    const { error } = await admin()
      .from('producao_ordem_itens')
      .delete()
      .eq('id', itemId)
      .eq('ordem_id', Number(id))

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
