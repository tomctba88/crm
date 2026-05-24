import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import {
  parseBalancete, parseFluxoCaixa, parseVendas,
  parseContasReceber, parseContasPagar,
} from '@/lib/financeiro/parsers'

export const maxDuration = 300

const TABELAS = {
  balancete: 'fin_balancete',
  fluxo_caixa: 'fin_fluxo_caixa_import',
  vendas: 'fin_vendas_import',
  contas_receber: 'fin_cr_import',
  contas_pagar: 'fin_cp_import',
} as const

type Tipo = keyof typeof TABELAS

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const form = await request.formData()
    const tipo = form.get('tipo') as Tipo
    const mes = parseInt(form.get('mes') as string, 10)
    const ano = parseInt(form.get('ano') as string, 10)
    const nomeArquivo = (form.get('nome_arquivo') as string) ?? ''
    const rowsJson = form.get('rows') as string

    if (!tipo || !mes || !ano || !rowsJson) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
    }
    if (!(tipo in TABELAS)) {
      return NextResponse.json({ error: 'Tipo de relatório inválido.' }, { status: 400 })
    }
    if (mes < 1 || mes > 12 || ano < 2020 || ano > 2030) {
      return NextResponse.json({ error: 'Mês ou ano inválido.' }, { status: 400 })
    }

    const rows = JSON.parse(rowsJson) as unknown[][]

    let parsed: Record<string, unknown>[] = []
    if (tipo === 'balancete') parsed = parseBalancete(rows) as any
    else if (tipo === 'fluxo_caixa') parsed = parseFluxoCaixa(rows) as any
    else if (tipo === 'vendas') parsed = parseVendas(rows) as any
    else if (tipo === 'contas_receber') parsed = parseContasReceber(rows) as any
    else if (tipo === 'contas_pagar') parsed = parseContasPagar(rows) as any

    if (parsed.length === 0) {
      return NextResponse.json({
        error: `Nenhum registro válido encontrado. Verifique se exportou o relatório "${tipo.replace('_', ' ')}" correto do Tiny.`,
      }, { status: 400 })
    }

    const tabela = TABELAS[tipo]

    // Deletar registros anteriores do mesmo período (idempotência)
    await supabase.from(tabela).delete().eq('mes', mes).eq('ano', ano)

    // Inserir em chunks de 500
    const records = parsed.map(r => ({ ...r, mes, ano }))
    let importados = 0
    let erros = 0
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500)
      const { error } = await supabase.from(tabela).insert(chunk)
      if (error) { console.error(`insert ${tabela} error:`, error); erros += chunk.length }
      else importados += chunk.length
    }

    // Upsert log de upload
    await supabase.from('fin_uploads').upsert({
      tipo, mes, ano,
      nome_arquivo: nomeArquivo,
      total_linhas: importados,
      importado_por: user.id,
      importado_em: new Date().toISOString(),
    }, { onConflict: 'tipo,mes,ano' })

    return NextResponse.json({ importados, erros, tipo, mes, ano })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
