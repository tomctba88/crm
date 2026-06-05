import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { conciliarCategorias, type FluxoDespesa, type CpTitulo } from '@/lib/financeiro/conciliar'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const acao = body?.acao

    // ── PREVIEW: gera as propostas de correção para o período ──
    if (acao === 'preview') {
      const mes = parseInt(String(body.mes), 10)
      const ano = parseInt(String(body.ano), 10)
      if (!mes || !ano) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })

      const [{ data: fx }, cpRes] = await Promise.all([
        supabase.from('fin_fluxo_caixa_import')
          .select('id,grupo,categoria,periodo_label,valor')
          .eq('ano', ano).eq('mes', mes).eq('tipo', 'despesa'),
        supabase.from('fin_cp_import')
          .select('fornecedor,categoria,numero_documento,historico,valor,pago')
          .eq('ano', ano).eq('mes', mes),
      ])

      if (cpRes.error) {
        // Coluna categoria ausente ou tabela vazia
        return NextResponse.json({
          error: 'Não foi possível ler Contas a Pagar com categoria. Aplique a migração e reimporte Contas a Pagar.',
        }, { status: 400 })
      }

      const cp = (cpRes.data ?? []) as CpTitulo[]
      if (!cp.some(c => (c.categoria || '').trim())) {
        return NextResponse.json({
          error: 'As Contas a Pagar deste mês não têm categoria. Reimporte o relatório de Contas a Pagar (com a coluna Categoria).',
        }, { status: 400 })
      }

      const propostas = conciliarCategorias((fx ?? []) as FluxoDespesa[], cp)
      return NextResponse.json({ propostas })
    }

    // ── APPLY: aplica as categorias confirmadas ──
    if (acao === 'apply') {
      const itens = Array.isArray(body.itens) ? body.itens : []
      if (!itens.length) return NextResponse.json({ error: 'Nada para aplicar.' }, { status: 400 })

      let aplicados = 0
      const erros: string[] = []
      for (const it of itens) {
        const categoria = String(it?.categoria ?? '').trim()
        if (!it?.id || !categoria) continue
        const { error } = await supabase
          .from('fin_fluxo_caixa_import')
          .update({ categoria })
          .eq('id', it.id)
        if (error) erros.push(String(it.id))
        else aplicados++
      }
      return NextResponse.json({ ok: true, aplicados, erros })
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
