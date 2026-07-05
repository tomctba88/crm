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

// POST /api/producao/produtos  → cadastro manual (recebe { raw })
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

    // cadastro manual não tem tiny_id (fica nulo)
    const registro = { ...mapearProduto(raw), tiny_id: null }
    const { data, error } = await admin().from('producao_produtos').insert(registro).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ id: data.id })
  } catch (e) {
    console.error('ERRO POST produto:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
