import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

const STATUS_VALIDOS = ['AGUARDANDO', 'EM_ANDAMENTO', 'QUALIDADE', 'CONCLUIDO', 'CANCELADO']

// Quando a produção conclui, atualiza o pos_vendas para "PRONTO PARA ENTREGA"
const STATUS_POSVENDAS: Record<string, string | null> = {
  CONCLUIDO: 'PRONTO PARA ENTREGA',
  CANCELADO: null,
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const novoStatus = String(body.status || '').toUpperCase()

    if (!STATUS_VALIDOS.includes(novoStatus)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: ordem, error: ordemError } = await admin
      .from('producao_ordens')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', Number(id))
      .select('pos_venda_id')
      .single()

    if (ordemError || !ordem) {
      return NextResponse.json({ error: 'Ordem não encontrada.' }, { status: 404 })
    }

    // Atualiza pos_vendas se há mapeamento de status
    const novoPosVendasStatus = STATUS_POSVENDAS[novoStatus]
    if (novoPosVendasStatus) {
      await admin
        .from('pos_vendas')
        .update({ status_pos_venda: novoPosVendasStatus, updated_at: new Date().toISOString() })
        .eq('id', ordem.pos_venda_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
