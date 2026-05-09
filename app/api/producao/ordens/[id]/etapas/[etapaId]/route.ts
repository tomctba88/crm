import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

const STATUS_VALIDOS = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'PULADA']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; etapaId: string }> }
) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id, etapaId } = await params
    const body = await request.json()
    const novoStatus = String(body.status || '').toUpperCase()

    if (!STATUS_VALIDOS.includes(novoStatus)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const atualizacao: Record<string, unknown> = {
      status: novoStatus,
      updated_at: new Date().toISOString(),
    }

    if (novoStatus === 'EM_ANDAMENTO') {
      atualizacao.data_inicio = new Date().toISOString().slice(0, 10)
    }
    if (novoStatus === 'CONCLUIDA' || novoStatus === 'PULADA') {
      atualizacao.data_conclusao = new Date().toISOString().slice(0, 10)
    }

    const { error } = await admin
      .from('producao_etapas')
      .update(atualizacao)
      .eq('id', Number(etapaId))
      .eq('ordem_id', Number(id))

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Se todas as etapas da ordem estão concluídas/puladas, avança a ordem para QUALIDADE
    const { data: etapas } = await admin
      .from('producao_etapas')
      .select('status')
      .eq('ordem_id', Number(id))

    const todas = etapas || []
    const todasFinalizadas = todas.length > 0 && todas.every((e) => e.status === 'CONCLUIDA' || e.status === 'PULADA')

    if (todasFinalizadas) {
      await admin
        .from('producao_ordens')
        .update({ status: 'QUALIDADE', updated_at: new Date().toISOString() })
        .eq('id', Number(id))
    } else if (novoStatus === 'EM_ANDAMENTO') {
      // Ao iniciar a primeira etapa, avança a ordem para EM_ANDAMENTO
      await admin
        .from('producao_ordens')
        .update({ status: 'EM_ANDAMENTO', updated_at: new Date().toISOString() })
        .eq('id', Number(id))
        .eq('status', 'AGUARDANDO')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
