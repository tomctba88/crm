import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { mapearProduto, type LinhaTiny } from '@/lib/produtos/mapear'

// POST /api/producao/produtos/importar
// Recebe um lote de linhas do Tiny e grava em producao_produtos.
// Upsert manual por tiny_id (atualiza existentes, insere novos).
export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const linhas: LinhaTiny[] = Array.isArray(body.produtos) ? body.produtos : []
    if (linhas.length === 0) return NextResponse.json({ inseridos: 0, atualizados: 0 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const registros = linhas.map(mapearProduto).filter((r) => r.tiny_id)
    if (registros.length === 0) return NextResponse.json({ inseridos: 0, atualizados: 0 })

    // descobre quais tiny_id já existem
    const tinyIds = registros.map((r) => r.tiny_id as string)
    const { data: existentes } = await admin
      .from('producao_produtos')
      .select('id, tiny_id')
      .in('tiny_id', tinyIds)

    const mapa = new Map<string, number>()
    for (const e of existentes || []) {
      const r = e as { id: number; tiny_id: string }
      mapa.set(r.tiny_id, r.id)
    }

    const inserir = registros.filter((r) => !mapa.has(r.tiny_id as string))
    const atualizar = registros
      .filter((r) => mapa.has(r.tiny_id as string))
      .map((r) => ({ ...r, id: mapa.get(r.tiny_id as string)! }))

    if (inserir.length > 0) {
      const { error } = await admin.from('producao_produtos').insert(inserir)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (atualizar.length > 0) {
      // upsert pela PK (id) → atualiza cada registro existente
      const { error } = await admin.from('producao_produtos').upsert(atualizar, { onConflict: 'id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ inseridos: inserir.length, atualizados: atualizar.length })
  } catch (e) {
    console.error('ERRO import produtos:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
