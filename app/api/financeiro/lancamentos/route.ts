import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

export const maxDuration = 60

// PATCH: reclassifica um lançamento do fluxo de caixa para outra conta (categoria).
// Escopo atual: mover de conta. Outros campos podem ser adicionados no corpo no futuro.
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id, categoria } = await request.json()
    if (!id) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })
    const novaCategoria = String(categoria ?? '').trim()
    if (!novaCategoria) return NextResponse.json({ error: 'Conta de destino inválida.' }, { status: 400 })

    const { error } = await supabase
      .from('fin_fluxo_caixa_import')
      .update({ categoria: novaCategoria })
      .eq('id', id)

    if (error) {
      console.error('mover lançamento error:', error)
      return NextResponse.json({ error: 'Erro ao mover o lançamento.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id, categoria: novaCategoria })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
