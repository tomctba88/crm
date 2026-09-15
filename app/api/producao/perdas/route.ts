import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

/**
 * Controle de perda.
 *
 * Duas naturezas, porque doem de formas diferentes:
 *   tipo='insumo' → material estragado (tecido cortado errado, espuma furada).
 *                   Dá baixa no estoque e custa o custo_unitario do insumo.
 *   tipo='peca'   → cadeira acabada refugada. Soma em qtd_perdida do item da OP
 *                   e custa o custo_unitario daquele item.
 *
 * O custo é calculado no servidor quando não vem informado: deixar o usuário
 * digitar valor de perda é convite para relatório sem credibilidade.
 */

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const tipo = body.tipo === 'peca' ? 'peca' : 'insumo'
    const quantidade = Number(body.quantidade)

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: 'Informe a quantidade perdida.' }, { status: 400 })
    }
    if (!body.motivo_id) {
      return NextResponse.json({ error: 'Informe o motivo da perda.' }, { status: 400 })
    }

    const db = admin()
    const ordemItemId = body.ordem_item_id ? Number(body.ordem_item_id) : null
    const insumoId = body.insumo_id ? Number(body.insumo_id) : null
    const revestimentoId = body.revestimento_id ? Number(body.revestimento_id) : null

    if (tipo === 'peca' && !ordemItemId) {
      return NextResponse.json({ error: 'Selecione o item da ordem que foi refugado.' }, { status: 400 })
    }
    if (tipo === 'insumo' && !insumoId && !revestimentoId) {
      return NextResponse.json({ error: 'Selecione o insumo ou o revestimento perdido.' }, { status: 400 })
    }

    // Revestimento ligado ao estoque baixa como insumo
    let insumoParaBaixa = insumoId
    if (!insumoParaBaixa && revestimentoId) {
      const { data: rev } = await db
        .from('producao_revestimentos')
        .select('insumo_id')
        .eq('id', revestimentoId)
        .maybeSingle()
      insumoParaBaixa = rev?.insumo_id ?? null
    }

    // --- custo -------------------------------------------------------------
    let custo = Number(body.custo_estimado)
    let unidade: string | null = body.unidade || null

    if (!Number.isFinite(custo) || custo <= 0) {
      if (tipo === 'peca' && ordemItemId) {
        const { data: item } = await db
          .from('producao_ordem_itens')
          .select('custo_unitario')
          .eq('id', ordemItemId)
          .maybeSingle()
        custo = quantidade * Number(item?.custo_unitario || 0)
        unidade = unidade || 'un'
      } else if (insumoParaBaixa) {
        const { data: estoque } = await db
          .from('producao_estoque_insumos')
          .select('custo_unitario, producao_insumos(unidade)')
          .eq('insumo_id', insumoParaBaixa)
          .maybeSingle()
        custo = quantidade * Number(estoque?.custo_unitario || 0)
        const insumo = estoque?.producao_insumos as { unidade?: string } | { unidade?: string }[] | null
        unidade = unidade || (Array.isArray(insumo) ? insumo[0]?.unidade : insumo?.unidade) || null
      } else if (revestimentoId) {
        const { data: rev } = await db
          .from('producao_revestimentos')
          .select('custo_metro')
          .eq('id', revestimentoId)
          .maybeSingle()
        custo = quantidade * Number(rev?.custo_metro || 0)
        unidade = unidade || 'm'
      } else {
        custo = 0
      }
    }

    // --- registra a perda --------------------------------------------------
    const { data: perda, error } = await db
      .from('producao_perdas')
      .insert({
        data_ref: body.data_ref || new Date().toISOString().slice(0, 10),
        ordem_id: body.ordem_id ? Number(body.ordem_id) : null,
        ordem_item_id: ordemItemId,
        etapa_id: body.etapa_id ? Number(body.etapa_id) : null,
        funcionario_id: body.funcionario_id ? Number(body.funcionario_id) : null,
        motivo_id: Number(body.motivo_id),
        tipo,
        insumo_id: insumoId,
        revestimento_id: revestimentoId,
        quantidade,
        unidade,
        custo_estimado: Number(custo.toFixed(2)),
        recuperavel: Boolean(body.recuperavel),
        observacao: body.observacao || null,
        created_by: user.email,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // --- reflexos ----------------------------------------------------------
    // Peça refugada conta no item da OP (alimenta a taxa de refugo)
    if (tipo === 'peca' && ordemItemId) {
      const { data: item } = await db
        .from('producao_ordem_itens')
        .select('qtd_perdida')
        .eq('id', ordemItemId)
        .maybeSingle()

      await db
        .from('producao_ordem_itens')
        .update({
          qtd_perdida: Number(item?.qtd_perdida || 0) + quantidade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ordemItemId)
    }

    // Material perdido sai do estoque de insumos
    if (tipo === 'insumo' && insumoParaBaixa) {
      await db.from('producao_movimentos_estoque').insert({
        insumo_id: insumoParaBaixa,
        tipo: 'saida_perda',
        quantidade,
        ordem_id: body.ordem_id ? Number(body.ordem_id) : null,
        observacao: `Perda #${perda.id}${body.observacao ? ` — ${body.observacao}` : ''}`,
        created_by: user.email,
      })

      const { data: estoque } = await db
        .from('producao_estoque_insumos')
        .select('id, quantidade_atual')
        .eq('insumo_id', insumoParaBaixa)
        .maybeSingle()

      if (estoque) {
        await db
          .from('producao_estoque_insumos')
          .update({
            quantidade_atual: Number(estoque.quantidade_atual) - quantidade,
            updated_at: new Date().toISOString(),
          })
          .eq('id', estoque.id)
      }
    }

    return NextResponse.json({ success: true, perda })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Perda inválida.' }, { status: 400 })

    const db = admin()
    const { data: perda } = await db
      .from('producao_perdas')
      .select('id, tipo, ordem_item_id, quantidade')
      .eq('id', id)
      .maybeSingle()

    if (!perda) return NextResponse.json({ error: 'Perda não encontrada.' }, { status: 404 })

    // desfaz o reflexo no item antes de apagar (o estoque continua baixado:
    // estorno de material é entrada_ajuste manual, com rastro próprio)
    if (perda.tipo === 'peca' && perda.ordem_item_id) {
      const { data: item } = await db
        .from('producao_ordem_itens')
        .select('qtd_perdida')
        .eq('id', perda.ordem_item_id)
        .maybeSingle()

      await db
        .from('producao_ordem_itens')
        .update({
          qtd_perdida: Math.max(0, Number(item?.qtd_perdida || 0) - Number(perda.quantidade)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', perda.ordem_item_id)
    }

    const { error } = await db.from('producao_perdas').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
