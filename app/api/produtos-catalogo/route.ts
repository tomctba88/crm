import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { mapearCatalogo, type LinhaTiny } from '@/lib/catalogo/mapear'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

    const db = admin()

    const { count } = await db
      .from('produtos_catalogo')
      .select('*', { count: 'exact', head: true })

    let query = db
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

// POST /api/produtos-catalogo  → cadastro manual de um produto (recebe { raw })
export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const raw: LinhaTiny = body.raw || {}
    if (!raw['Descrição']) return NextResponse.json({ error: 'Descrição é obrigatória.' }, { status: 400 })

    const registro = mapearCatalogo(raw)
    const { data, error } = await admin()
      .from('produtos_catalogo')
      .insert(registro)
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ id: data.id })
  } catch (e) {
    console.error('ERRO POST catálogo:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
