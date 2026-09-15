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

    const agora = new Date().toISOString()
    const atualizacao: Record<string, unknown> = {
      status: novoStatus,
      updated_at: agora,
    }

    // data_* (DATE) fica para leitura; *_em (TIMESTAMPTZ) é o que alimenta os
    // indicadores de tempo de fabricação e produtividade por hora.
    if (novoStatus === 'EM_ANDAMENTO') {
      atualizacao.data_inicio = agora.slice(0, 10)
      atualizacao.iniciada_em = agora
    }
    if (novoStatus === 'CONCLUIDA' || novoStatus === 'PULADA') {
      atualizacao.data_conclusao = agora.slice(0, 10)
      atualizacao.concluida_em = agora
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
        .update({ status: 'QUALIDADE', updated_at: agora })
        .eq('id', Number(id))
    } else if (novoStatus === 'EM_ANDAMENTO') {
      // Ao iniciar a primeira etapa, avança a ordem para EM_ANDAMENTO.
      // iniciada_em marca o fim da fila e o começo do tempo de execução.
      await admin
        .from('producao_ordens')
        .update({ status: 'EM_ANDAMENTO', updated_at: agora, iniciada_em: agora })
        .eq('id', Number(id))
        .eq('status', 'AGUARDANDO')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
