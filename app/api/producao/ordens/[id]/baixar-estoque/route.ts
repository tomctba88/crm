import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

type MaterialInput = { insumo_id: number; quantidade: number; nome: string }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const ordemId = Number(id)
    const body = await request.json()
    const materiais: MaterialInput[] = Array.isArray(body.materiais) ? body.materiais : []

    if (materiais.length === 0) {
      return NextResponse.json({ error: 'Nenhum material informado.' }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Impede baixa dupla
    const { data: ordem } = await admin
      .from('producao_ordens')
      .select('id, materiais_calculados')
      .eq('id', ordemId)
      .single()

    if (!ordem) return NextResponse.json({ error: 'Ordem não encontrada.' }, { status: 404 })
    if (ordem.materiais_calculados) {
      return NextResponse.json({ error: 'O estoque desta ordem já foi baixado.' }, { status: 400 })
    }

    const insumoIds = materiais.map((m) => m.insumo_id)

    // 1. Verificar saldos
    const { data: estoques } = await admin
      .from('producao_estoque_insumos')
      .select('insumo_id, quantidade_atual')
      .in('insumo_id', insumoIds)

    const saldoPorInsumo = new Map<number, number>()
    for (const e of estoques || []) saldoPorInsumo.set(e.insumo_id, Number(e.quantidade_atual))

    const insuficientes = materiais
      .filter((m) => (saldoPorInsumo.get(m.insumo_id) ?? 0) < m.quantidade)
      .map((m) => ({
        insumo_id: m.insumo_id,
        nome: m.nome,
        precisa: m.quantidade,
        disponivel: saldoPorInsumo.get(m.insumo_id) ?? 0,
      }))

    if (insuficientes.length > 0) {
      return NextResponse.json({ error: 'Saldo insuficiente.', insuficientes }, { status: 400 })
    }

    // 2. Inserir movimentos
    const movimentos = materiais.map((m) => ({
      insumo_id: m.insumo_id,
      tipo: 'saida_producao',
      quantidade: m.quantidade,
      ordem_id: ordemId,
      observacao: `Baixa por produção`,
      created_by: user.email || null,
    }))
    const { error: movErr } = await admin.from('producao_movimentos_estoque').insert(movimentos)
    if (movErr) return NextResponse.json({ error: movErr.message }, { status: 400 })

    // 3. Atualizar saldos
    for (const m of materiais) {
      const novo = (saldoPorInsumo.get(m.insumo_id) ?? 0) - m.quantidade
      await admin
        .from('producao_estoque_insumos')
        .update({ quantidade_atual: novo, updated_at: new Date().toISOString() })
        .eq('insumo_id', m.insumo_id)
    }

    // 4. Salvar snapshot na ordem
    const snapshot = materiais.map((m) => ({ insumo_id: m.insumo_id, nome: m.nome, quantidade_calculada: m.quantidade }))
    await admin
      .from('producao_ordens')
      .update({ materiais_calculados: snapshot, updated_at: new Date().toISOString() })
      .eq('id', ordemId)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
