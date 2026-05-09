import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import {
  normalizarStatus,
  isVendaFechada,
  obterDatasParaStatus,
} from '@/lib/constants/status'
import { criarOrdemProducao } from '@/lib/producao/criar-ordem'

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const leadId = body.leadId ? Number(body.leadId) : null
    let payload = body.payload || {}

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (leadId) {
      // ATUALIZAÇÃO DE LEAD EXISTENTE
      const { data: leadAtual, error: leadError } = await admin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

      if (leadError || !leadAtual) {
        return NextResponse.json(
          { error: 'Lead não encontrado.' },
          { status: 404 }
        )
      }

      // Se o status foi alterado, calcula as datas automaticamente
      if (payload.status && payload.status !== leadAtual.status) {
        const novoStatus = payload.status
        const datasAutomaticas = obterDatasParaStatus(novoStatus)

        // Mescla as datas automáticas com o payload
        // Mas respeita valores já preenchidos pelo usuário
        payload = {
          ...payload,
          data_fechamento: payload.data_fechamento || datasAutomaticas.data_fechamento,
          data_cancelamento: payload.data_cancelamento || datasAutomaticas.data_cancelamento,
          data_finalizacao: payload.data_finalizacao || datasAutomaticas.data_finalizacao,
          data_ultima_movimentacao: new Date().toISOString(),
        }

        // Registra a movimentação no histórico
        await admin.from('lead_movimentacoes').insert({
          lead_id: leadId,
          user_id: user.id,
          status_anterior: leadAtual.status,
          novo_status: novoStatus,
          movido_em: new Date().toISOString(),
        })

        // Se mudou para venda fechada, cria pós-vendas automaticamente
        if (isVendaFechada(novoStatus)) {
          const { data: existente } = await admin
            .from('pos_vendas')
            .select('id')
            .eq('lead_id', leadId)
            .maybeSingle()

          if (!existente) {
            const hoje = new Date().toISOString().slice(0, 10)
            const { data: novoPosVenda } = await admin.from('pos_vendas').insert({
              lead_id: leadId,
              user_id: user.id,
              status_pos_venda: 'EM PRODUÇÃO',
              responsavel: leadAtual.vendedor || null,
              data_inicio: hoje,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).select().single()

            if (novoPosVenda) {
              await criarOrdemProducao(admin, novoPosVenda.id, leadId, leadAtual.produto_interesse, leadAtual.vendedor)
            }
          }
        }
      }

      const { error } = await admin
        .from('leads')
        .update(payload)
        .eq('id', leadId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Lead atualizado com sucesso.',
      })
    }

    // CRIAÇÃO DE NOVO LEAD
    // Se já vem com status de venda fechada, preenche a data
    if (payload.status) {
      const datasAutomaticas = obterDatasParaStatus(payload.status)
      payload = {
        ...payload,
        data_fechamento: payload.data_fechamento || datasAutomaticas.data_fechamento,
        data_cancelamento: payload.data_cancelamento || datasAutomaticas.data_cancelamento,
        data_finalizacao: payload.data_finalizacao || datasAutomaticas.data_finalizacao,
      }
    }

    const { data: novoLead, error } = await admin
      .from('leads')
      .insert(payload)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Se o novo lead já foi criado com status de venda fechada, cria pós-vendas e ordem de produção
    if (novoLead && isVendaFechada(payload.status)) {
      const hoje = new Date().toISOString().slice(0, 10)
      const { data: novoPosVenda } = await admin.from('pos_vendas').insert({
        lead_id: novoLead.id,
        user_id: user.id,
        status_pos_venda: 'EM PRODUÇÃO',
        responsavel: payload.vendedor || null,
        data_inicio: hoje,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()

      if (novoPosVenda) {
        await criarOrdemProducao(admin, novoPosVenda.id, novoLead.id, payload.produto_interesse, payload.vendedor)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Lead cadastrado com sucesso.',
      lead: novoLead,
    })
  } catch (error) {
    console.error('ERRO AO SALVAR LEAD:', error)

    return NextResponse.json(
      { error: 'Erro interno ao salvar lead.' },
      { status: 500 }
    )
  }
}