import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

/**
 * Chapas consumidas por ordem — o denominador do aproveitamento.
 *
 * Sem este registro dá para saber quanta chapa virou peça, mas não quanta foi
 * gasta. E é a diferença entre as duas que é a sobra de nesting.
 *
 * Dar baixa no estoque é opcional: quando a chapa está cadastrada como insumo,
 * o consumo gera movimento e ajusta o saldo.
 */

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const { data, error } = await admin()
      .from('producao_chapas_consumidas')
      .select('*, producao_chapas(nome,cor_padrao,espessura_mm,comprimento_mm,largura_mm,custo_chapa)')
      .eq('ordem_id', Number(id))
      .order('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ consumos: data || [] })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const ordemId = Number(id)
    const body = await request.json()

    const chapaId = Number(body.chapa_id)
    const quantidade = Number(body.quantidade)

    if (!chapaId) return NextResponse.json({ error: 'Selecione a chapa.' }, { status: 400 })
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: 'Informe quantas chapas foram usadas.' }, { status: 400 })
    }

    const db = admin()
    const { data: chapa } = await db
      .from('producao_chapas')
      .select('custo_chapa, insumo_id, nome')
      .eq('id', chapaId)
      .maybeSingle()

    if (!chapa) return NextResponse.json({ error: 'Chapa não encontrada.' }, { status: 404 })

    const custoInformado = Number(body.custo_total)
    const custoTotal = Number.isFinite(custoInformado) && custoInformado > 0
      ? custoInformado
      : quantidade * Number(chapa.custo_chapa || 0)

    const { data: consumo, error } = await db
      .from('producao_chapas_consumidas')
      .insert({
        ordem_id: ordemId,
        chapa_id: chapaId,
        quantidade,
        custo_total: Number(custoTotal.toFixed(2)),
        data_ref: body.data_ref || new Date().toISOString().slice(0, 10),
        observacao: body.observacao || null,
        created_by: user.email,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Baixa no estoque quando a chapa também é insumo controlado
    if (chapa.insumo_id) {
      await db.from('producao_movimentos_estoque').insert({
        insumo_id: chapa.insumo_id,
        tipo: 'saida_producao',
        quantidade,
        ordem_id: ordemId,
        observacao: `Consumo de chapa — ${chapa.nome}`,
        created_by: user.email,
      })

      const { data: estoque } = await db
        .from('producao_estoque_insumos')
        .select('id, quantidade_atual')
        .eq('insumo_id', chapa.insumo_id)
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

    return NextResponse.json({ success: true, consumo })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const consumoId = Number(new URL(request.url).searchParams.get('consumoId'))
    if (!consumoId) return NextResponse.json({ error: 'Consumo inválido.' }, { status: 400 })

    // O movimento de estoque não é estornado: correção de saldo é entrada_ajuste
    // manual, com rastro próprio — mesmo critério usado nas perdas.
    const { error } = await admin()
      .from('producao_chapas_consumidas')
      .delete()
      .eq('id', consumoId)
      .eq('ordem_id', Number(id))

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
