import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'

export const maxDuration = 120

// Todas as tabelas de dados importados, vinculadas a mes/ano
const TABELAS = [
  'fin_balancete',
  'fin_fluxo_caixa_import',
  'fin_vendas_import',
  'fin_cr_import',
  'fin_cp_import',
  'fin_recebimentos_import',
  'fin_pedidos_import',
  'fin_vendas_produtos_import',
] as const

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { mes, ano } = await request.json()
    const mesNum = parseInt(String(mes), 10)
    const anoNum = parseInt(String(ano), 10)

    if (!mesNum || !anoNum || mesNum < 1 || mesNum > 12 || anoNum < 2020 || anoNum > 2030) {
      return NextResponse.json({ error: 'Mês ou ano inválido.' }, { status: 400 })
    }

    // Apaga os dados de cada tabela para o período
    const resultados: Record<string, number | string> = {}
    for (const tabela of TABELAS) {
      const { error, count } = await supabase
        .from(tabela)
        .delete({ count: 'exact' })
        .eq('mes', mesNum)
        .eq('ano', anoNum)
      if (error) {
        console.error(`limpar ${tabela} error:`, error)
        resultados[tabela] = `erro: ${error.message}`
      } else {
        resultados[tabela] = count ?? 0
      }
    }

    // Apaga o log de uploads do período
    await supabase.from('fin_uploads').delete().eq('mes', mesNum).eq('ano', anoNum)

    const totalRemovidos = Object.values(resultados)
      .filter(v => typeof v === 'number')
      .reduce((s: number, v) => s + (v as number), 0)

    return NextResponse.json({ ok: true, mes: mesNum, ano: anoNum, totalRemovidos, resultados })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
