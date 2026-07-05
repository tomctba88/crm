import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

// GET /api/pedidos/produtos?q=texto
// Busca produtos fabricados da Produção já com o preço final calculado (valor de tabela).
export async function GET(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() || ''

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = admin
      .from('producao_produtos')
      .select('id, nome, sku, custo_mao_obra, margem_lucro_pct')
      .eq('ativo', true)
      .order('nome')
      .limit(20)
    if (q.length >= 1) query = query.or(`nome.ilike.%${q}%,sku.ilike.%${q}%`)

    const [{ data: produtos, error }, { data: ficha }, { data: estoques }] = await Promise.all([
      query,
      admin.from('producao_ficha_tecnica').select('produto_id, insumo_id, quantidade_padrao, custo_unitario'),
      admin.from('producao_estoque_insumos').select('insumo_id, custo_unitario'),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const custoEstoque: Record<number, number> = {}
    for (const e of estoques || []) {
      const r = e as { insumo_id: number; custo_unitario: number | null }
      custoEstoque[r.insumo_id] = r.custo_unitario != null ? Number(r.custo_unitario) : 0
    }

    const custoMateriais: Record<number, number> = {}
    for (const f of ficha || []) {
      const r = f as { produto_id: number; insumo_id: number; quantidade_padrao: number; custo_unitario: number | null }
      const cu = r.custo_unitario != null ? Number(r.custo_unitario) : (custoEstoque[r.insumo_id] ?? 0)
      custoMateriais[r.produto_id] = (custoMateriais[r.produto_id] || 0) + Number(r.quantidade_padrao) * cu
    }

    const resultado = (produtos || []).map((p) => {
      const prod = p as { id: number; nome: string; sku: string | null; custo_mao_obra: number | null; margem_lucro_pct: number | null }
      const total = ((custoMateriais[prod.id] || 0) + (Number(prod.custo_mao_obra) || 0)) *
        (1 + (Number(prod.margem_lucro_pct) || 0) / 100)
      return { id: prod.id, nome: prod.nome, sku: prod.sku, preco: Math.round(total * 100) / 100 }
    })

    return NextResponse.json({ produtos: resultado })
  } catch (e) {
    console.error('ERRO GET /api/pedidos/produtos:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
