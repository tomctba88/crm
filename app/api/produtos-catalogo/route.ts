import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

// GET /api/produtos-catalogo?q=texto  → busca no catálogo + total geral
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

    const { count } = await admin
      .from('produtos_catalogo')
      .select('*', { count: 'exact', head: true })

    let query = admin
      .from('produtos_catalogo')
      .select('id, tiny_id, sku, descricao, unidade, preco, preco_custo, estoque, categoria, situacao, url_imagem')
      .order('descricao')
      .limit(50)
    if (q.length >= 1) query = query.or(`descricao.ilike.%${q}%,sku.ilike.%${q}%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ produtos: data || [], total: count || 0 })
  } catch (e) {
    console.error('ERRO GET catálogo:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
