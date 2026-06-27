import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import {
  parseBalancete, parseFluxoCaixa, parseVendas,
  parseContasReceber, parseContasPagar,
  parseRecebimentos, parsePedidos, parseVendasProdutos,
} from '@/lib/financeiro/parsers'

export const maxDuration = 300

const TABELAS = {
  balancete: 'fin_balancete',
  fluxo_caixa: 'fin_fluxo_caixa_import',
  vendas: 'fin_vendas_import',
  contas_receber: 'fin_cr_import',
  contas_pagar: 'fin_cp_import',
  recebimentos: 'fin_recebimentos_import',
  pedidos: 'fin_pedidos_import',
  vendas_produtos: 'fin_vendas_produtos_import',
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: Record<string, unknown>[] = []
    if (tipo === 'balancete') parsed = parseBalancete(rows) as any
    else if (tipo === 'fluxo_caixa') parsed = parseFluxoCaixa(rows) as any
    else if (tipo === 'vendas') parsed = parseVendas(rows) as any
    else if (tipo === 'contas_receber') parsed = parseContasReceber(rows) as any
    else if (tipo === 'contas_pagar') parsed = parseContasPagar(rows) as any
    else if (tipo === 'recebimentos') parsed = parseRecebimentos(rows) as any
    else if (tipo === 'pedidos') parsed = parsePedidos(rows) as any
    else if (tipo === 'vendas_produtos') parsed = parseVendasProdutos(rows) as any

    if (parsed.length === 0) {
      return NextResponse.json({
        error: `Nenhum registro válido encontrado. Verifique se exportou o relatório correto do Tiny.`,
      }, { status: 400 })
    }

    const tabela = TABELAS[tipo]

    // Excluir registros anteriores do mesmo período — sempre substituir, nunca duplicar
    const { error: deleteError } = await supabase.from(tabela).delete().eq('mes', mes).eq('ano', ano)
    if (deleteError) {
      console.error(`delete ${tabela} error:`, deleteError)
      return NextResponse.json({ error: 'Erro ao limpar dados anteriores. Tente novamente.' }, { status: 500 })
    }

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

    if (erros > 0 && importados === 0) {
      return NextResponse.json({ error: 'Falha ao inserir os registros. Os dados anteriores foram removidos. Tente reimportar.' }, { status: 500 })
    }

    // Para vendas por produto: listar produtos sem custo cadastrado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const semCusto: string[] = tipo === 'vendas_produtos'
      ? (parsed as any[])
          .filter(r => r.tem_custo === false && r.valor > 0)
          .map(r => r.sku ? `${r.produto} (SKU: ${r.sku})` : r.produto)
      : []

    // Para o Relatório de Vendas (por cliente): se NENHUMA linha trouxe custo,
    // o arquivo foi exportado sem as colunas Custo/Lucro — a margem por cliente
    // ficará vazia. Avisa para o usuário reexportar com as colunas certas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avisoVendasSemCusto = tipo === 'vendas'
      && parsed.length > 0
      && (parsed as any[]).every(r => Number(r.custo) === 0)
      ? 'Este arquivo foi importado SEM a coluna de Custo — a margem por cliente ficará vazia. Reexporte no Tiny marcando as colunas Custo, Valor Lucro e % Lucro (⚙ selecionar colunas) e reimporte.'
      : null

    // Rede de segurança de layout: nos relatórios de títulos (linha a linha,
    // sem pulos intencionais), se o parser aproveitou bem menos linhas do que
    // o arquivo tinha, é sinal de que as colunas vieram em ordem/nome inesperado.
    // (Foi o que aconteceu com o Contas a Receber: o Tiny mudou a ordem das
    // colunas e o parser antigo descartava tudo silenciosamente.)
    const tiposTitulos: Tipo[] = ['contas_receber', 'contas_pagar', 'recebimentos', 'pedidos']
    const linhasComDados = rows.slice(1).filter(
      r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== '')
    ).length
    const avisoLayout = tiposTitulos.includes(tipo)
      && parsed.length > 0
      && linhasComDados > 10
      && parsed.length < linhasComDados * 0.5
      ? `Só ${parsed.length} de ~${linhasComDados} linhas foram reconhecidas. O arquivo pode estar com colunas em ordem/nome diferente do esperado — confira se exportou o relatório certo no Tiny.`
      : null

    const aviso = avisoVendasSemCusto ?? avisoLayout

    // Upsert log de upload
    await supabase.from('fin_uploads').upsert({
      tipo, mes, ano,
      nome_arquivo: nomeArquivo,
      total_linhas: importados,
      importado_por: user.id,
      importado_em: new Date().toISOString(),
    }, { onConflict: 'tipo,mes,ano' })

    return NextResponse.json({ importados, erros, tipo, mes, ano, sem_custo: semCusto, aviso })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
