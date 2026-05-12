import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { criarOrdemProducao } from '@/lib/producao/criar-ordem'

function normalizarStatus(status?: string | null) {
  return String(status || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function statusParaBanco(statusVisual: string) {
  const status = normalizarStatus(statusVisual)

  if (status === 'PERDIDO') return 'CANCELADO'
  if (status === 'ORCADO') return 'AGUARDANDO'
  if (status === 'ATENDENDO') return 'ORÇAR'

  return String(statusVisual || '').trim().toUpperCase()
}

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
    const leadId = Number(body.leadId)
    const novoStatus = statusParaBanco(String(body.novoStatus || ''))

    if (!leadId || !novoStatus) {
      return NextResponse.json(
        { error: 'Lead e status são obrigatórios.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    const agoraIso = new Date().toISOString()
    const hoje = agoraIso.slice(0, 10)
    const dataEncerramento = body.dataEncerramento
      ? String(body.dataEncerramento).slice(0, 10)
      : hoje

    const dadosExtras: Record<string, any> = {}

    if (novoStatus === 'FECHADO' || novoStatus === 'PEDIDO') {
      dadosExtras.data_fechamento = dataEncerramento
    }

    if (novoStatus === 'CANCELADO') {
      dadosExtras.data_cancelamento = dataEncerramento
      dadosExtras.data_finalizacao = dataEncerramento
    }

    if (novoStatus === 'DESQUALIFICADO') {
      dadosExtras.data_finalizacao = dataEncerramento
    }

    const { data: leadAtualizado, error: updateError } = await admin
      .from('leads')
      .update({
        status: novoStatus,
        data_ultima_movimentacao: agoraIso,
        ...dadosExtras,
      })
      .eq('id', leadId)
      .select('*')
      .single()

    if (updateError || !leadAtualizado) {
      return NextResponse.json(
        { error: updateError?.message || 'Erro ao atualizar status do lead.' },
        { status: 400 }
      )
    }

    await admin.from('lead_movimentacoes').insert({
      lead_id: leadId,
      user_id: user.id,
      status_anterior: leadAtual.status,
      novo_status: novoStatus,
      movido_em: agoraIso,
    })

    if (novoStatus === 'FECHADO' || novoStatus === 'PEDIDO') {
      const { data: existente } = await admin
        .from('pos_vendas')
        .select('id')
        .eq('lead_id', leadId)
        .maybeSingle()

      if (!existente) {
        const { data: novoPosVenda } = await admin.from('pos_vendas').insert({
          lead_id: leadId,
          user_id: user.id,
          status_pos_venda: 'EM PRODUÇÃO',
          responsavel: leadAtual.vendedor || null,
          data_inicio: hoje,
          created_at: agoraIso,
          updated_at: agoraIso,
        }).select().single()

        if (novoPosVenda) {
          await criarOrdemProducao(admin, novoPosVenda.id, leadId, leadAtual.produto_interesse, leadAtual.vendedor)
        }
      }
    }

    return NextResponse.json({
      success: true,
      lead: leadAtualizado,
    })
  } catch (error) {
    console.error('ERRO AO MOVER LEAD:', error)

    return NextResponse.json(
      { error: 'Erro interno ao mover lead.' },
      { status: 500 }
    )
  }
}