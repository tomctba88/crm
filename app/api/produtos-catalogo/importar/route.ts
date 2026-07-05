import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { mapearCatalogo, type LinhaTiny } from '@/lib/catalogo/mapear'

// Recebe um lote de linhas do Tiny (objetos com as chaves = cabeçalhos da planilha)
// e faz upsert por tiny_id na tabela produtos_catalogo.

type Linha = LinhaTiny

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const linhas: Linha[] = Array.isArray(body.produtos) ? body.produtos : []
    if (linhas.length === 0) return NextResponse.json({ inseridos: 0 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // mapeia e descarta linhas sem tiny_id
    const registros = linhas.map(mapearCatalogo).filter((r) => r.tiny_id)

    if (registros.length === 0) return NextResponse.json({ inseridos: 0 })

    const { error } = await admin
      .from('produtos_catalogo')
      .upsert(registros, { onConflict: 'tiny_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ inseridos: registros.length })
  } catch (e) {
    console.error('ERRO import catálogo:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
