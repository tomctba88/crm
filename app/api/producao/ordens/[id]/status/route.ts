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

    const agora = new Date().toISOString()
    const atualizacao: Record<string, unknown> = { status: novoStatus, updated_at: agora }

    // concluida_em fecha o cronômetro do tempo de fabricação (OP gerada → fim)
    if (novoStatus === 'CONCLUIDO') {
      atualizacao.concluida_em = agora
      atualizacao.data_conclusao = agora.slice(0, 10)
    }

    const { data: ordem, error: ordemError } = await admin
      .from('producao_ordens')
      .update(atualizacao)
      .eq('id', Number(id))
      .select('pos_venda_id')
      .single()

    if (ordemError || !ordem) {
      return NextResponse.json({ error: 'Ordem não encontrada.' }, { status: 404 })
    }

    // Ao concluir, o que foi planejado (menos o refugo) vira produzido nos itens
    // que ninguém apontou à mão — sem isso o volume da fábrica ficaria zerado.
    if (novoStatus === 'CONCLUIDO') {
      const { data: itens } = await admin
        .from('producao_ordem_itens')
        .select('id, qtd_planejada, qtd_produzida, qtd_perdida')
        .eq('ordem_id', Number(id))

      for (const item of itens || []) {
        if (Number(item.qtd_produzida) > 0) continue
        const produzida = Math.max(0, Number(item.qtd_planejada) - Number(item.qtd_perdida))
        await admin
          .from('producao_ordem_itens')
          .update({ qtd_produzida: produzida, updated_at: agora })
          .eq('id', item.id)
      }
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
