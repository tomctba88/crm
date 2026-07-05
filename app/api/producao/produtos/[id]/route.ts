import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { mapearProduto, type LinhaTiny } from '@/lib/produtos/mapear'

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

// GET /api/producao/produtos/[id]  → produto completo (colunas + raw + ficha técnica)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const db = admin()
    const [{ data: produto, error }, { data: ficha }] = await Promise.all([
      db.from('producao_produtos').select('*').eq('id', Number(id)).maybeSingle(),
      db.from('producao_ficha_tecnica')
        .select('id, insumo_id, quantidade_padrao, producao_insumos(nome, unidade)')
        .eq('produto_id', Number(id)),
    ])

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!produto) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })
    return NextResponse.json({ produto, ficha: ficha || [] })
  } catch (e) {
    console.error('ERRO GET produto:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// PATCH /api/producao/produtos/[id]  → salva a edição (recebe { raw } com todos os campos)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await exigirUsuario()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const raw: LinhaTiny = body.raw || {}

    const db = admin()
    const { data: atual } = await db
      .from('producao_produtos')
      .select('tiny_id, raw')
      .eq('id', Number(id))
      .maybeSingle()

    const rawMesclado = { ...((atual?.raw as object) || {}), ...raw }
    if (atual?.tiny_id) (rawMesclado as LinhaTiny)['ID'] = atual.tiny_id

    // preserva o tiny_id original (não deixa a edição sobrescrever o vínculo)
    const registro = { ...mapearProduto(rawMesclado), tiny_id: atual?.tiny_id ?? null }

    const { error } = await db.from('producao_produtos').update(registro).eq('id', Number(id))
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('ERRO PATCH produto:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
