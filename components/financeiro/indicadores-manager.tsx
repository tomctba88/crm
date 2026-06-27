'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatPct } from '@/lib/financeiro/formatters'
import { getGrupoPorCategoria, CATEGORIAS_DESPESA } from '@/lib/tiny/categorias'
import LancamentosDrawer, { type Lancamento } from './lancamentos-drawer'
import ConciliacaoModal from './conciliacao-modal'

type BalanceteItem = { tipo: string; grupo: string; categoria: string; valor: number }
type VendaItem = {
  cliente: string; cnpj_cpf: string; valor: number; frete: number
  custo: number; valor_lucro: number; percentual_lucro: number; total: number; segmento: string
}
type RecebimentoItem = { valor_recebido: number }
type FluxoItem = {
  id: string | number; tipo: string; grupo: string; categoria: string
  periodo_label: string; data_inicio: string | null; valor: number
}

type FiltroTipo = 'mes' | 'trimestre' | 'ano'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const MES_ATUAL = new Date().getMonth() + 1

const SEGMENTO_LABEL: Record<string, string> = { corporativo: 'Corporativo', decor: 'Decor', lojista: 'Lojista', outros: 'Outros' }
const SEGMENTO_COR: Record<string, string> = { corporativo: '#1b4fd6', decor: '#16a34a', lojista: '#f59e0b', outros: '#94a3b8' }

type Regime = 'competencia' | 'caixa'

// Mapeamento de grupo Tiny → categoria de resultado
const GRUPO_RESULTADO: Record<string, string> = {}
function getResultadoLabel(grupo: string): string {
  const g = grupo.toLowerCase()
  if (g.includes('custo')) return 'CMV'
  if (g.includes('sócios') || g.includes('socios')) return 'Salários Sócios'
  if (g.includes('financeira')) return 'Despesas Financeiras'
  if (g.includes('operacion')) return 'Despesas Operacionais' // pega "operacional" e "operacionais"
  if (g.includes('trabalhista')) return 'Despesas Trabalhistas'
  if (g.includes('tributária') || g.includes('tributaria')) return 'Despesas Tributárias'
  if (g.includes('imobilizado')) return 'Imobilizado'
  if (g.includes('investimento')) return 'Investimentos'
  if (g.includes('empréstimo') || g.includes('emprestimo')) return 'Empréstimos'
  return 'Sem Grupo'
}

// Ordem dos grupos no DRE
const ORDEM_RESULTADO = [
  'CMV', 'Salários Sócios', 'Despesas Financeiras', 'Despesas Operacionais',
  'Despesas Trabalhistas', 'Despesas Tributárias', 'Imobilizado', 'Investimentos',
  'Empréstimos', 'Sem Grupo',
]

function getMesesAno(tipo: FiltroTipo, ano: number, mes: number): number[] {
  if (tipo === 'mes') return [mes]
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3); const ini = (q - 1) * 3 + 1
    return [ini, ini + 1, ini + 2]
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
}

export default function IndicadoresManager() {
  const [balancete, setBalancete] = useState<BalanceteItem[]>([])
  const [vendasImport, setVendasImport] = useState<VendaItem[]>([])
  const [recebimentosImport, setRecebimentosImport] = useState<RecebimentoItem[]>([])
  const [fluxo, setFluxo] = useState<FluxoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [regime, setRegime] = useState<Regime>('competencia')
  const [filtro, setFiltro] = useState<FiltroTipo>('mes')
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mes, setMes] = useState(MES_ATUAL)
  const [filtroBusca, setFiltroBusca] = useState('')
  const [paginaClientes, setPaginaClientes] = useState(1)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [contaSelecionada, setContaSelecionada] = useState<string | null>(null)
  const [mostrarConciliacao, setMostrarConciliacao] = useState(false)
  const supabase = createClient()

  const carregar = useCallback(async () => {
    setLoading(true)
    const meses = getMesesAno(filtro, ano, mes)
    const [{ data: bal }, { data: vd }, { data: rec }, { data: fx }] = await Promise.all([
      supabase.from('fin_balancete').select('tipo,grupo,categoria,valor').eq('ano', ano).in('mes', meses),
      supabase.from('fin_vendas_import').select('cliente,cnpj_cpf,valor,frete,custo,valor_lucro,percentual_lucro,total,segmento').eq('ano', ano).in('mes', meses),
      supabase.from('fin_recebimentos_import').select('valor_recebido').eq('ano', ano).in('mes', meses),
      supabase.from('fin_fluxo_caixa_import').select('id,tipo,grupo,categoria,periodo_label,data_inicio,valor').eq('ano', ano).in('mes', meses),
    ])
    setBalancete((bal ?? []) as BalanceteItem[])
    setVendasImport((vd ?? []) as VendaItem[])
    setRecebimentosImport((rec ?? []) as RecebimentoItem[])
    setFluxo((fx ?? []) as FluxoItem[])
    setPaginaClientes(1)
    setLoading(false)
  }, [filtro, ano, mes])

  useEffect(() => { carregar() }, [carregar])

  const dados = useMemo(() => {
    const bal = balancete
    const vd = vendasImport

    // ── FATURAMENTO ──
    const totalVendas = vd.reduce((s, v) => s + v.valor, 0)
    const fretesCobrados = vd.reduce((s, v) => s + v.frete, 0)
    // Pedidos e ticket médio usam a mesma fonte do faturamento (relatório de Vendas)
    // para que o ticket médio seja matematicamente coerente com o Total Vendas.
    const numPedidos = vd.length
    const ticketMedio = numPedidos > 0 ? totalVendas / numPedidos : 0
    const lucroBrutoVendas = vd.reduce((s, v) => s + v.valor_lucro, 0)
    const margemBruta = totalVendas > 0 ? (lucroBrutoVendas / totalVendas) * 100 : 0
    const temSegmento = vd.some(v => v.segmento && v.segmento !== 'outros')

    // ── SEGMENTOS ──
    const segmentos = ['corporativo', 'decor', 'lojista'].map(seg => {
      const vdSeg = vd.filter(v => v.segmento === seg)
      const total = vdSeg.reduce((s, v) => s + v.valor, 0)
      const lucro = vdSeg.reduce((s, v) => s + v.valor_lucro, 0)
      const margem = total > 0 ? (lucro / total) * 100 : 0
      return { segmento: seg, label: SEGMENTO_LABEL[seg], total, lucro, margem, cor: SEGMENTO_COR[seg] }
    }).filter(s => s.total > 0)

    // ── SAÍDAS: agrupado por grupo/categoria ──
    // Entradas continuam vindo do balancete.
    const totalEntradas = bal.filter(b => b.tipo === 'entrada').reduce((s, b) => s + b.valor, 0)

    // Mapa categoria → grupo derivado do balancete (saída). Usado para classificar os
    // lançamentos do fluxo no DRE quando recalculamos a partir dele.
    const catGrupo: Record<string, string> = {}
    for (const b of bal.filter(b => b.tipo === 'saida')) {
      if (b.categoria) catGrupo[b.categoria] = b.grupo || 'Sem Grupo'
    }

    const gruposMap: Record<string, { categorias: Record<string, number>; total: number; isCusto: boolean }> = {}
    const addSaida = (grupoRaw: string, catRaw: string, valor: number) => {
      const g = grupoRaw || 'Sem Grupo'
      if (!gruposMap[g]) gruposMap[g] = { categorias: {}, total: 0, isCusto: g.toLowerCase().includes('custo') }
      const cat = catRaw || 'Sem categoria'
      gruposMap[g].categorias[cat] = (gruposMap[g].categorias[cat] || 0) + valor
      gruposMap[g].total += valor
    }

    // Fonte das saídas: fluxo de caixa (lançamento a lançamento, editável). Se não houver
    // lançamentos de fluxo no período, cai para o balancete agregado (meses antigos).
    const despesasFluxo = fluxo.filter(f => f.tipo === 'despesa')
    if (despesasFluxo.length > 0) {
      for (const f of despesasFluxo) {
        const cat = f.categoria || 'Sem categoria'
        // Grupo: balancete (categorias originais) → mapa do plano de contas → Sem grupo.
        addSaida(catGrupo[cat] || getGrupoPorCategoria(cat) || 'Sem Grupo', cat, f.valor)
      }
    } else {
      for (const b of bal.filter(b => b.tipo === 'saida')) {
        addSaida(b.grupo || 'Sem Grupo', b.categoria || 'Sem categoria', b.valor)
      }
    }

    // ── RESULTADO DO MÊS: agrupa grupos no painel de resultado ──
    const resultadoAgrupado: Record<string, number> = {}
    for (const [g, v] of Object.entries(gruposMap)) {
      const label = getResultadoLabel(g)
      resultadoAgrupado[label] = (resultadoAgrupado[label] || 0) + v.total
    }
    const totalSaidas = Object.values(gruposMap).reduce((s, v) => s + v.total, 0)
    const cmvBalancete = resultadoAgrupado['CMV'] || 0 // compras pagas no mês (caixa)
    const cmvVendas = vd.reduce((s, v) => s + v.custo, 0) // custo dos produtos vendidos (competência)

    // ── REGIME: alterna entre Competência e Caixa ──
    // Competência: receita = vendas faturadas; CMV = custo do que foi vendido
    // Caixa: receita = entradas recebidas; CMV = compras efetivamente pagas
    const receita = regime === 'caixa' ? totalEntradas : totalVendas
    const cmvTotal = regime === 'caixa' ? cmvBalancete : cmvVendas
    const lucroBruto = receita - cmvTotal
    const basePercentual = receita || 1

    // Despesas não-CMV (operacionais, trabalhistas, etc.) vêm do balancete em ambos os regimes
    const despesasNaoCMV = totalSaidas - cmvBalancete
    const lucroLiquido = regime === 'caixa'
      ? totalEntradas - totalSaidas
      : totalVendas - cmvVendas - despesasNaoCMV

    // EBIT = Receita - CMV - Despesas Operacionais - Despesas Trabalhistas - Sócios
    const ebit = receita - cmvTotal
      - (resultadoAgrupado['Despesas Operacionais'] || 0)
      - (resultadoAgrupado['Despesas Trabalhistas'] || 0)
      - (resultadoAgrupado['Salários Sócios'] || 0)

    // ── FRETES ──
    const despesasFretes = (gruposMap['DESPESAS OPERACIONAIS']?.categorias['Fretes e Carretos'] || 0)
    const fretePagoEmpresa = Math.max(0, despesasFretes - fretesCobrados)
    const fretesPctFaturamento = totalVendas > 0 ? (fretePagoEmpresa / totalVendas) * 100 : 0

    // ── GRUPOS ORDENADOS para DRE detalhado ──
    const gruposOrdenados = Object.entries(gruposMap).sort(([a], [b]) => {
      const ia = ORDEM_RESULTADO.indexOf(getResultadoLabel(a))
      const ib = ORDEM_RESULTADO.indexOf(getResultadoLabel(b))
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      return a.localeCompare(b)
    })

    // ── CLIENTES ──
    const numClientes = vd.length
    const totalRecebido = recebimentosImport.reduce((s, r) => s + r.valor_recebido, 0)

    // ── BLOCO 5: PONTO DE EQUILÍBRIO ──
    // Fixas: não variam com a venda (trabalhistas, sócios, operacionais).
    // Variáveis: acompanham a venda (CMV, tributos sobre venda, taxas financeiras).
    const despesasFixas =
      (resultadoAgrupado['Despesas Trabalhistas'] || 0)
      + (resultadoAgrupado['Salários Sócios'] || 0)
      + (resultadoAgrupado['Despesas Operacionais'] || 0)
    const despesasVariaveis =
      cmvTotal
      + (resultadoAgrupado['Despesas Tributárias'] || 0)
      + (resultadoAgrupado['Despesas Financeiras'] || 0)
    const margemContribuicaoPct = receita > 0 ? ((receita - despesasVariaveis) / receita) * 100 : 0
    const pontoEquilibrio = margemContribuicaoPct > 0 ? despesasFixas / (margemContribuicaoPct / 100) : 0
    const folgaPE = receita - pontoEquilibrio

    // ── BLOCO 6: EBITDA E MARGENS ──
    // Proxy de depreciação: lançamentos de Imobilizado (na falta da depreciação real do Tiny).
    const depreciacao = resultadoAgrupado['Imobilizado'] || 0
    const ebitda = ebit + depreciacao
    const margemEbitda = receita > 0 ? (ebitda / receita) * 100 : 0
    const margemEbit = receita > 0 ? (ebit / receita) * 100 : 0
    const margemBrutaCalc = receita > 0 ? (lucroBruto / receita) * 100 : 0
    const margemLiquida = receita > 0 ? (lucroLiquido / receita) * 100 : 0

    // ── BLOCO 7: CONCENTRAÇÃO E RECEBÍVEIS ──
    const top5Clientes = [...vd].sort((a, b) => b.valor - a.valor).slice(0, 5).map(v => ({
      cliente: v.cliente || '—',
      valor: v.valor,
      pctTotal: totalVendas > 0 ? (v.valor / totalVendas) * 100 : 0,
      margem: v.valor > 0 && v.valor_lucro !== 0 ? (v.valor_lucro / v.valor) * 100 : 0,
    }))
    const concentracaoTop5Pct = top5Clientes.reduce((s, c) => s + c.pctTotal, 0)
    const top1Pct = top5Clientes[0]?.pctTotal ?? 0
    // Honesto: razão entre o que entrou (Recebimentos) e o que foi faturado no mês.
    // NÃO é PMR/aging — para prazo real de recebimento usar o Contas a Receber.
    const recebidoVsFaturado = totalVendas > 0 ? (totalRecebido / totalVendas) * 100 : 0

    // ── BLOCO 8: ESTRUTURA DE CUSTOS (análise vertical) ──
    const rankingCustos = Object.entries(gruposMap)
      .map(([grupo, g]) => ({
        grupo, valor: g.total, isCusto: g.isCusto,
        pctReceita: receita > 0 ? (g.total / receita) * 100 : 0,
      }))
      .filter(g => g.valor > 0)
      .sort((a, b) => b.valor - a.valor)
    const maxPctReceita = rankingCustos[0]?.pctReceita || 1
    const indiceEficiencia = receita > 0 ? ((resultadoAgrupado['Despesas Operacionais'] || 0) / receita) * 100 : 0

    void GRUPO_RESULTADO

    return {
      totalVendas, fretesCobrados, numPedidos, ticketMedio,
      lucroBrutoVendas, margemBruta, temSegmento, segmentos,
      totalEntradas, totalSaidas, cmvTotal,
      receita, lucroBruto, basePercentual,
      lucroLiquido, ebit, resultadoAgrupado, gruposMap, gruposOrdenados,
      despesasFretes, fretePagoEmpresa, fretesPctFaturamento,
      numClientes, totalRecebido,
      // Bloco 5
      despesasFixas, despesasVariaveis, margemContribuicaoPct, pontoEquilibrio, folgaPE,
      // Bloco 6
      depreciacao, ebitda, margemEbitda, margemEbit, margemBrutaCalc, margemLiquida,
      // Bloco 7
      top5Clientes, concentracaoTop5Pct, top1Pct, recebidoVsFaturado,
      // Bloco 8
      rankingCustos, maxPctReceita, indiceEficiencia,
    }
  }, [balancete, vendasImport, recebimentosImport, fluxo, regime])

  // Contas de saída disponíveis (para mover lançamentos entre elas): as presentes
  // nos dados + todas as categorias conhecidas do plano de contas.
  const contasSaida = useMemo(() => {
    const presentes = Object.values(dados.gruposMap).flatMap(g => Object.keys(g.categorias))
    return Array.from(new Set([...presentes, ...CATEGORIAS_DESPESA])).sort((a, b) => a.localeCompare(b))
  }, [dados.gruposMap])

  // Lançamentos da conta selecionada (somente despesas do fluxo daquela categoria)
  const lancamentosConta: Lancamento[] = useMemo(() => {
    if (!contaSelecionada) return []
    return fluxo
      .filter(f => f.tipo === 'despesa' && (f.categoria || 'Sem categoria') === contaSelecionada)
      .map(f => ({ id: f.id, data_inicio: f.data_inicio, periodo_label: f.periodo_label, grupo: f.grupo, valor: f.valor }))
  }, [fluxo, contaSelecionada])

  const clientesFiltrados = useMemo(() => {
    let r = [...vendasImport].sort((a, b) => b.valor - a.valor)
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      r = r.filter(v => v.cliente?.toLowerCase().includes(b) || v.cnpj_cpf?.includes(b))
    }
    return r
  }, [vendasImport, filtroBusca])

  const POR_PAGINA = 25
  const totalPaginasClientes = Math.ceil(clientesFiltrados.length / POR_PAGINA)
  const clientesPagina = clientesFiltrados.slice((paginaClientes - 1) * POR_PAGINA, paginaClientes * POR_PAGINA)
  const semDados = !loading && balancete.length === 0 && vendasImport.length === 0

  const periodoLabel = filtro === 'mes' ? `${MESES[mes - 1]}/${ano}`
    : filtro === 'trimestre' ? `T${Math.ceil(mes / 3)}/${ano}` : `${ano}`

  const pct = (v: number, base: number) => base > 0 ? formatPct((v / base) * 100) : '—'

  // ── BLOCO 9: Painel Executivo (semáforos derivados de `dados`) ──
  type Sinal = 'verde' | 'amarelo' | 'vermelho'
  const painel: { nome: string; valor: string; sinal: Sinal; acao?: string }[] = (() => {
    if (loading || semDados) return []
    const d = dados
    const out: { nome: string; valor: string; sinal: Sinal; acao?: string }[] = []

    const resSinal: Sinal = d.lucroLiquido > 0 ? 'verde' : d.lucroLiquido >= -0.05 * d.receita ? 'amarelo' : 'vermelho'
    out.push({ nome: 'Resultado do período', valor: formatBRL(d.lucroLiquido), sinal: resSinal,
      acao: resSinal === 'vermelho' ? 'Prejuízo acima de 5% da receita — revisar custos e despesas com urgência.' : resSinal === 'amarelo' ? 'Resultado próximo de zero — margem de segurança baixa.' : undefined })

    const mbS: Sinal = d.margemBrutaCalc > 35 ? 'verde' : d.margemBrutaCalc >= 25 ? 'amarelo' : 'vermelho'
    out.push({ nome: 'Margem bruta', valor: `${d.margemBrutaCalc.toFixed(1)}%`, sinal: mbS,
      acao: mbS === 'vermelho' ? 'Margem bruta abaixo de 25%: revisar política de desconto ou custo dos produtos.' : mbS === 'amarelo' ? 'Margem bruta entre 25–35%: há espaço para melhorar preço/custo.' : undefined })

    const mlS: Sinal = d.margemLiquida > 8 ? 'verde' : d.margemLiquida >= 3 ? 'amarelo' : 'vermelho'
    out.push({ nome: 'Margem líquida', valor: `${d.margemLiquida.toFixed(1)}%`, sinal: mlS,
      acao: mlS === 'vermelho' ? 'Margem líquida abaixo de 3%: resultado apertado, atenção às despesas fixas.' : mlS === 'amarelo' ? 'Margem líquida entre 3–8%: monitorar despesas.' : undefined })

    const peS: Sinal = d.pontoEquilibrio <= 0 ? 'amarelo'
      : d.receita > d.pontoEquilibrio * 1.1 ? 'verde' : d.receita >= d.pontoEquilibrio ? 'amarelo' : 'vermelho'
    out.push({ nome: 'Ponto de equilíbrio', valor: peS === 'vermelho' ? `Faltam ${formatBRL(d.pontoEquilibrio - d.receita)}` : peS === 'verde' ? 'Acima do PE' : 'No limite',
      sinal: peS,
      acao: peS === 'vermelho' ? `Receita abaixo do ponto de equilíbrio: faturar mais ${formatBRL(d.pontoEquilibrio - d.receita)} para cobrir os custos fixos.` : peS === 'amarelo' && d.pontoEquilibrio > 0 ? 'Receita pouco acima do ponto de equilíbrio — pouca folga.' : undefined })

    const cS: Sinal = d.top1Pct < 20 ? 'verde' : d.top1Pct <= 30 ? 'amarelo' : 'vermelho'
    out.push({ nome: 'Concentração de receita', valor: `Top 1: ${d.top1Pct.toFixed(1)}%`, sinal: cS,
      acao: cS !== 'verde' && d.top5Clientes[0] ? `${d.top5Clientes[0].cliente} concentra ${d.top1Pct.toFixed(1)}% da receita — risco de dependência de um cliente.` : undefined })

    const rS: Sinal = d.recebidoVsFaturado > 80 ? 'verde' : d.recebidoVsFaturado >= 60 ? 'amarelo' : 'vermelho'
    out.push({ nome: 'Recebido vs faturado', valor: `${d.recebidoVsFaturado.toFixed(0)}%`, sinal: rS,
      acao: rS !== 'verde' ? `Entrou menos caixa (${formatBRL(d.totalRecebido)}) do que o faturado no mês — acompanhar recebimentos e inadimplência.` : undefined })

    return out
  })()
  const alertasPainel = painel.filter(p => p.sinal !== 'verde')

  function toggleExpandido(grupo: string) {
    setExpandidos(prev => {
      const s = new Set(prev)
      s.has(grupo) ? s.delete(grupo) : s.add(grupo)
      return s
    })
  }

  function exportarCSV() {
    const linhas: string[][] = [['Cliente', 'Segmento', 'CNPJ/CPF', 'Faturamento', 'Custo', 'Lucro R$', 'Margem %']]
    clientesFiltrados.forEach(v => linhas.push([
      v.cliente, SEGMENTO_LABEL[v.segmento] || v.segmento, v.cnpj_cpf,
      v.valor.toFixed(2), v.custo.toFixed(2), v.valor_lucro.toFixed(2), v.percentual_lucro.toFixed(1),
    ]))
    const csv = linhas.map(r => r.join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `fechamento-${periodoLabel}.csv`; a.click()
  }

  // Exporta o relatório como PDF via diálogo de impressão do navegador
  // (Salvar como PDF). A classe no body ativa as regras @media print do globals.css.
  function exportarPDF() {
    document.body.classList.add('imprimindo')
    const limpar = () => { document.body.classList.remove('imprimindo'); window.removeEventListener('afterprint', limpar) }
    window.addEventListener('afterprint', limpar)
    window.print()
  }

  return (
    <div id="area-impressao" className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Fechamento do Mês</h1>
          <p className="mt-1 text-sm text-slate-500">DRE por Competência ou Caixa · Faturamento por segmento · Custos · Margem por cliente</p>
        </div>
        <div className="no-print flex gap-2 self-start">
          {!semDados && !loading && (
            <button onClick={exportarPDF}
              className="rounded-2xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] transition">
              Exportar PDF
            </button>
          )}
          <Link href="/financeiro/importacao" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Importar Relatórios
          </Link>
        </div>
      </div>

      {/* Cabeçalho que aparece SÓ no PDF */}
      <div className="only-print">
        <p className="text-lg font-black text-[#0b1733]">Ergotex · Fechamento do Mês — {periodoLabel}</p>
        <p className="text-xs text-slate-500">
          Regime: {regime === 'competencia' ? 'Competência' : 'Caixa'} · Gerado em {new Date().toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Seletor de Regime */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Regime contábil:</span>
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button onClick={() => setRegime('competencia')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${regime === 'competencia' ? 'bg-[#1b4fd6] text-white shadow' : 'text-slate-600 hover:text-slate-800'}`}>
              Competência
            </button>
            <button onClick={() => setRegime('caixa')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${regime === 'caixa' ? 'bg-[#1b4fd6] text-white shadow' : 'text-slate-600 hover:text-slate-800'}`}>
              Caixa
            </button>
          </div>
          <p className="text-xs text-slate-400 flex-1 min-w-[200px]">
            {regime === 'competencia'
              ? 'Mostra o que foi vendido e o lucro gerado no mês (independente de quando o dinheiro entra).'
              : 'Mostra o dinheiro que efetivamente entrou e saiu no mês (movimentação real do caixa).'}
          </p>
        </div>
      </div>

      {/* Filtro período */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
          {(['mes', 'trimestre', 'ano'] as FiltroTipo[]).map(t => (
            <button key={t} onClick={() => setFiltro(t)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${filtro === t ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t === 'mes' ? 'Mês' : t === 'trimestre' ? 'Trimestre' : 'Ano'}
            </button>
          ))}
        </div>
        {(filtro === 'mes' || filtro === 'trimestre') && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b1733] focus:outline-none">
              {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex flex-wrap gap-1">
              {MESES.map((m, i) => (
                <button key={m} onClick={() => setMes(i + 1)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mes === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        {filtro === 'ano' && (
          <div className="flex flex-wrap gap-2">
            {ANOS.map(a => (
              <button key={a} onClick={() => setAno(a)}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${ano === a ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {a}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-slate-200" />)}</div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado importado para {periodoLabel}</p>
          <Link href="/financeiro/importacao" className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : (
        <>
          <p className="no-print text-xs text-slate-400">
            Base: relatórios Tiny · <span className="font-semibold text-[#1b4fd6]">{periodoLabel}</span>{' · '}
            <Link href="/financeiro/importacao" className="underline">Reimportar</Link>
          </p>

          {/* ═══ BLOCO 1: RESULTADO DO MÊS + FATURAMENTO ═══ */}
          <div className="grid gap-6 xl:grid-cols-2">

            {/* Coluna esquerda: Faturamento por Fonte */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#0b1733]">Faturamento</h2>
                <p className="text-xs text-slate-400">Base: Relatório de Vendas</p>
              </div>

              {/* KPIs rápidos */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Vendas', valor: dados.totalVendas, cor: 'text-[#0b1733]' },
                  { label: 'Pedidos Emitidos', valor: dados.numPedidos, cor: 'text-[#1b4fd6]', isMoney: false },
                  { label: 'Ticket Médio', valor: dados.ticketMedio, cor: 'text-slate-700' },
                  { label: 'Fretes Cobrados', valor: dados.fretesCobrados, cor: 'text-slate-500', sub: pct(dados.fretesCobrados, dados.totalVendas) },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-3">
                    <p className="text-[10px] font-semibold text-slate-500">{k.label}</p>
                    {k.sub && <p className="text-[9px] text-slate-400">{k.sub}</p>}
                    <p className={`mt-1 text-base font-black ${k.cor}`}>
                      {k.isMoney === false ? k.valor : formatBRL(k.valor as number)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Segmentos */}
              {dados.temSegmento ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Por Fonte de Receita</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[10px] font-semibold text-slate-400">
                        <th className="pb-1.5">Fonte</th>
                        <th className="pb-1.5 text-right">Total</th>
                        <th className="pb-1.5 text-right">Lucro</th>
                        <th className="pb-1.5 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.segmentos.map((s, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-1.5 font-semibold" style={{ color: s.cor }}>{s.label}</td>
                          <td className="py-1.5 text-right font-bold text-[#0b1733]">{formatBRL(s.total)}</td>
                          <td className="py-1.5 text-right text-green-700">{formatBRL(s.lucro)}</td>
                          <td className={`py-1.5 text-right font-black text-sm ${s.margem < 25 ? 'text-red-600' : s.margem < 35 ? 'text-orange-500' : 'text-green-700'}`}>{s.margem.toFixed(2)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300 font-black bg-[#eef3fb]">
                        <td className="py-1.5 text-[#0b1733]">Total</td>
                        <td className="py-1.5 text-right text-[#0b1733]">{formatBRL(dados.totalVendas)}</td>
                        <td className="py-1.5 text-right text-green-700">{formatBRL(dados.lucroBrutoVendas)}</td>
                        <td className={`py-1.5 text-right text-sm ${dados.margemBruta < 25 ? 'text-red-600' : dados.margemBruta < 35 ? 'text-orange-500' : 'text-green-700'}`}>{dados.margemBruta.toFixed(2)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center">
                  <p className="text-xs text-slate-400">Para ver Corporativo / Decor / Lojista, exporte o Relatório de Vendas com a coluna <strong>Fonte de Receita</strong> do Tiny.</p>
                </div>
              )}

              {/* Fretes */}
              {dados.despesasFretes > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Fretes</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {[
                        { label: 'Receita Fretes (cobrado)', valor: dados.fretesCobrados, cor: 'text-green-600' },
                        { label: 'Despesas Fretes (Tiny)', valor: dados.despesasFretes, cor: 'text-red-500' },
                        { label: 'Frete pago pela empresa', valor: dados.fretePagoEmpresa, cor: 'text-orange-600' },
                      ].map(r => (
                        <tr key={r.label} className="border-b border-slate-50">
                          <td className="py-1 text-slate-600">{r.label}</td>
                          <td className={`py-1 text-right font-semibold ${r.cor}`}>{formatBRL(r.valor)}</td>
                          <td className="py-1 text-right text-slate-400">{pct(r.valor, dados.totalVendas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Coluna direita: Resultado do Mês */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-black text-[#0b1733]">Resultado do Mês</h2>
                <p className="text-xs text-slate-400">
                  {regime === 'competencia'
                    ? 'Competência: receita = vendas faturadas · CMV = custo do que foi vendido'
                    : 'Caixa: receita = entradas recebidas · CMV = compras pagas (Balancete Tiny)'}
                  {' · '}{periodoLabel}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-semibold text-slate-400">
                    <th className="pb-1.5 text-left">Descrição</th>
                    <th className="pb-1.5 text-right">Valor</th>
                    <th className="pb-1.5 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr className="bg-[#eef3fb] font-black">
                    <td className="py-2 text-[#0b1733]">{regime === 'competencia' ? 'Total Vendas (faturado)' : 'Total Entradas (recebido)'}</td>
                    <td className="py-2 text-right text-[#0b1733]">{formatBRL(dados.receita)}</td>
                    <td className="py-2 text-right text-slate-400">100%</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500 text-xs pl-3">Fretes Cobrados</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{formatBRL(dados.fretesCobrados)}</td>
                    <td className="py-1.5 text-right text-xs text-slate-400">{pct(dados.fretesCobrados, dados.basePercentual)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500 text-xs pl-3">Pedidos Emitidos</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{dados.numPedidos}</td>
                    <td className="py-1.5 text-right text-xs text-slate-400">—</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500 text-xs pl-3">Ticket Médio</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{formatBRL(dados.ticketMedio)}</td>
                    <td className="py-1.5 text-right text-xs text-slate-400">—</td>
                  </tr>

                  {/* Linha separadora */}
                  <tr><td colSpan={3} className="py-0.5" /></tr>

                  {/* CMV */}
                  <tr>
                    <td className="py-1.5 font-semibold text-red-700">CMV {regime === 'competencia' ? '(custo do vendido)' : '(compras pagas)'}</td>
                    <td className="py-1.5 text-right font-semibold text-red-700">{formatBRL(dados.cmvTotal)}</td>
                    <td className="py-1.5 text-right text-red-600">{pct(dados.cmvTotal, dados.basePercentual)}</td>
                  </tr>
                  <tr className="bg-green-50">
                    <td className="py-1.5 font-bold text-green-800 pl-3">Lucro Bruto</td>
                    <td className="py-1.5 text-right font-bold text-green-700">{formatBRL(dados.lucroBruto)}</td>
                    <td className="py-1.5 text-right text-green-600">{pct(dados.lucroBruto, dados.basePercentual)}</td>
                  </tr>

                  {/* Grupos de despesa em ordem */}
                  {ORDEM_RESULTADO.filter(r => r !== 'CMV').map(label => {
                    const val = dados.resultadoAgrupado[label] || 0
                    if (val === 0) return null
                    return (
                      <tr key={label}>
                        <td className="py-1.5 text-slate-600">{label}</td>
                        <td className="py-1.5 text-right text-slate-700 font-semibold">{formatBRL(val)}</td>
                        <td className="py-1.5 text-right text-slate-400">{pct(val, dados.basePercentual)}</td>
                      </tr>
                    )
                  })}

                  {/* EBIT */}
                  <tr className="border-t border-slate-200 bg-blue-50">
                    <td className="py-1.5 font-bold text-[#1b4fd6] pl-3">EBIT</td>
                    <td className={`py-1.5 text-right font-bold ${dados.ebit >= 0 ? 'text-[#1b4fd6]' : 'text-red-600'}`}>{formatBRL(dados.ebit)}</td>
                    <td className="py-1.5 text-right text-slate-400">{pct(dados.ebit, dados.basePercentual)}</td>
                  </tr>

                  {/* Lucro Líquido */}
                  <tr className={`border-t-2 border-slate-300 font-black ${dados.lucroLiquido >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <td className={`py-2 ${dados.lucroLiquido >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                      {regime === 'competencia' ? 'Resultado (Competência)' : 'Resultado (Caixa)'}
                    </td>
                    <td className={`py-2 text-right text-lg ${dados.lucroLiquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(dados.lucroLiquido)}</td>
                    <td className={`py-2 text-right ${dados.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-500'}`}>{pct(dados.lucroLiquido, dados.basePercentual)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ BLOCO 2: DRE DETALHADO POR GRUPO ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-6 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#0b1733]">DRE Detalhado por Grupo</h2>
                <p className="text-xs text-slate-400">Saídas por categoria · clique numa conta para ver os lançamentos</p>
              </div>
              <div className="no-print flex flex-wrap items-center gap-2">
                {filtro === 'mes' && (
                  <button
                    onClick={() => setMostrarConciliacao(true)}
                    className="rounded-xl bg-[#1b4fd6] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0b1733] transition"
                  >
                    Corrigir categorias via Contas a Pagar
                  </button>
                )}
                <button
                  onClick={() => {
                    if (expandidos.size > 0) setExpandidos(new Set())
                    else setExpandidos(new Set(dados.gruposOrdenados.map(([g]) => g)))
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  {expandidos.size > 0 ? 'Recolher tudo' : 'Expandir tudo'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f8fafc]">
                  <tr>
                    <th className="px-6 py-2.5 text-left text-xs font-semibold text-slate-500">Grupo / Categoria</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Valor</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">% Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.gruposOrdenados.map(([grupo, gDados]) => {
                    const isExpanded = expandidos.has(grupo)
                    const isCusto = gDados.isCusto
                    const cats = Object.entries(gDados.categorias).sort((a, b) => b[1] - a[1])
                    return [
                      <tr
                        key={`g-${grupo}`}
                        onClick={() => toggleExpandido(grupo)}
                        className={`border-b cursor-pointer select-none ${isCusto ? 'bg-red-50 border-red-100 hover:bg-red-100/60' : 'bg-[#eef3fb] border-blue-100 hover:bg-blue-100/40'}`}
                      >
                        <td className="px-6 py-3 font-black text-[#0b1733]">
                          <span className="mr-2 text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                          {grupo}
                        </td>
                        <td className={`px-4 py-3 text-right font-black ${isCusto ? 'text-red-700' : 'text-[#0b1733]'}`}>{formatBRL(gDados.total)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${isCusto ? 'text-red-600' : 'text-slate-600'}`}>{pct(gDados.total, dados.totalVendas)}</td>
                      </tr>,
                      ...(isExpanded ? cats.map(([cat, val]) => (
                        <tr key={`c-${grupo}-${cat}`}
                          onClick={() => setContaSelecionada(cat)}
                          className="border-b border-slate-50 hover:bg-[#eef3fb] cursor-pointer group/cat">
                          <td className="px-6 py-2 pl-12 text-slate-600">
                            {cat}
                            <span className="ml-2 text-[10px] font-semibold text-[#1b4fd6] opacity-0 group-hover/cat:opacity-100 transition">ver lançamentos →</span>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-700">{formatBRL(val)}</td>
                          <td className="px-4 py-2 text-right text-slate-400 text-xs">{pct(val, dados.totalVendas)}</td>
                        </tr>
                      )) : [])
                    ]
                  })}
                  {/* Total saídas */}
                  <tr className="border-t-2 border-slate-400 bg-slate-100 font-black">
                    <td className="px-6 py-3 text-[#0b1733]">Total Saídas</td>
                    <td className="px-4 py-3 text-right text-[#0b1733]">{formatBRL(dados.totalSaidas)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{pct(dados.totalSaidas, dados.totalVendas)}</td>
                  </tr>
                  <tr className={`font-black text-base ${dados.lucroLiquido >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <td className={`px-6 py-3 ${dados.lucroLiquido >= 0 ? 'text-green-800' : 'text-red-700'}`}>Lucro Líquido</td>
                    <td className={`px-4 py-3 text-right ${dados.lucroLiquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(dados.lucroLiquido)}</td>
                    <td className={`px-4 py-3 text-right ${dados.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-500'}`}>{pct(dados.lucroLiquido, dados.totalVendas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ BLOCO 3: MARGEM POR CLIENTE ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">Margem por Cliente</h2>
              <div className="no-print flex flex-wrap gap-3 items-center">
                <input type="text" placeholder="Buscar cliente ou CNPJ" value={filtroBusca}
                  onChange={e => { setFiltroBusca(e.target.value); setPaginaClientes(1) }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6] w-52" />
                <button onClick={exportarCSV}
                  className="rounded-xl bg-[#0b1733] px-4 py-2 text-xs font-bold text-white hover:bg-[#1b4fd6] transition">
                  Exportar CSV
                </button>
              </div>
            </div>

            {/* Aviso quando o relatório de vendas não tem coluna de custo */}
            {dados.lucroBrutoVendas === 0 && dados.totalVendas > 0 && (
              <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-sm font-bold text-orange-700">
                  O relatório de Vendas importado não tem a coluna de Custo
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  Por isso Custo, Lucro e Margem aparecem em branco. Para ver as margens, exporte o
                  Relatório de Vendas do Tiny <strong>incluindo as colunas Custo, Lucro e % Lucro</strong>
                  {' '}(em Tiny → Relatórios → Vendas → Relatório de Vendas → ⚙ selecionar colunas) e reimporte
                  no card &quot;Relatório de Vendas&quot;.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    {dados.temSegmento && <th className="pb-2 pr-3">Segmento</th>}
                    <th className="pb-2 pr-3">Cliente</th>
                    <th className="pb-2 pr-3 text-right">Faturamento</th>
                    <th className="pb-2 pr-3 text-right">Custo</th>
                    <th className="pb-2 pr-3 text-right">Lucro R$</th>
                    <th className="pb-2 text-right">Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesPagina.map((v, i) => {
                    const mp = v.valor > 0 && v.valor_lucro !== 0 ? (v.valor_lucro / v.valor) * 100 : 0
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        {dados.temSegmento && (
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: SEGMENTO_COR[v.segmento] || '#94a3b8' }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: SEGMENTO_COR[v.segmento] || '#94a3b8' }} />
                              {SEGMENTO_LABEL[v.segmento] || v.segmento}
                            </span>
                          </td>
                        )}
                        <td className="py-2 pr-3 font-medium text-[#0b1733] max-w-[220px]">
                          <p className="truncate">{v.cliente || '—'}</p>
                          {v.cnpj_cpf && <p className="text-[10px] text-slate-400 font-mono">{v.cnpj_cpf}</p>}
                        </td>
                        <td className="py-2 pr-3 text-right">{formatBRL(v.valor)}</td>
                        <td className="py-2 pr-3 text-right text-slate-500">{v.custo > 0 ? formatBRL(v.custo) : '—'}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${v.valor_lucro > 0 ? 'text-green-700' : v.valor_lucro < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {v.valor_lucro !== 0 ? formatBRL(v.valor_lucro) : '—'}
                        </td>
                        <td className={`py-2 text-right font-black ${mp === 0 ? 'text-slate-400' : mp < 20 ? 'text-red-600' : mp < 35 ? 'text-orange-600' : 'text-green-700'}`}>
                          {mp !== 0 ? `${mp.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {clientesPagina.length === 0 && (
                    <tr><td colSpan={dados.temSegmento ? 6 : 5} className="py-6 text-center text-sm text-slate-400">Sem clientes encontrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPaginasClientes > 1 && (
              <div className="no-print mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">{clientesFiltrados.length} clientes</span>
                <div className="flex gap-2">
                  <button disabled={paginaClientes === 1} onClick={() => setPaginaClientes(p => p - 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Anterior</button>
                  <span className="text-xs text-slate-500 self-center">{paginaClientes}/{totalPaginasClientes}</span>
                  <button disabled={paginaClientes === totalPaginasClientes} onClick={() => setPaginaClientes(p => p + 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Próxima</button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ BLOCO 5: PONTO DE EQUILÍBRIO ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">Ponto de Equilíbrio</h2>
              <p className="text-xs text-slate-400">Faturamento mínimo para cobrir todos os custos do período · {periodoLabel}</p>
            </div>
            {dados.pontoEquilibrio === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                Não foi possível calcular — importe os dados de despesas e vendas do período.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-2xl p-3 ${dados.receita >= dados.pontoEquilibrio ? 'bg-green-50' : 'bg-amber-50'}`}>
                    <p className="text-[10px] font-semibold text-slate-500">Ponto de Equilíbrio</p>
                    <p className={`mt-1 text-base font-black ${dados.receita >= dados.pontoEquilibrio ? 'text-green-700' : 'text-amber-700'}`}>{formatBRL(dados.pontoEquilibrio)}</p>
                  </div>
                  <div className="rounded-2xl bg-[#eef3fb] p-3">
                    <p className="text-[10px] font-semibold text-slate-500">Receita Atual</p>
                    <p className="mt-1 text-base font-black text-[#0b1733]">{formatBRL(dados.receita)}</p>
                  </div>
                  <div className="rounded-2xl bg-[#eef3fb] p-3">
                    <p className="text-[10px] font-semibold text-slate-500">Margem de Contribuição</p>
                    <p className="mt-1 text-base font-black text-[#1b4fd6]">{dados.margemContribuicaoPct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl bg-[#eef3fb] p-3">
                    <p className="text-[10px] font-semibold text-slate-500">{dados.folgaPE >= 0 ? 'Folga' : 'Déficit'}</p>
                    <p className={`mt-1 text-base font-black ${dados.folgaPE >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(dados.folgaPE)}</p>
                  </div>
                </div>
                {/* Barra: 0 → 150% do PE, com marcador no PE */}
                {(() => {
                  const scaleMax = dados.pontoEquilibrio * 1.5
                  const posPE = 100 / 1.5 // PE fica a 66,7% da barra
                  const posReceita = Math.min(100, (dados.receita / scaleMax) * 100)
                  const acima = dados.receita >= dados.pontoEquilibrio
                  return (
                    <div className="mt-5">
                      <div className="relative h-7 w-full rounded-full bg-slate-100">
                        <div className={`absolute left-0 top-0 h-7 rounded-full ${acima ? 'bg-green-400' : 'bg-amber-400'}`} style={{ width: `${posReceita}%` }} />
                        <div className="absolute top-0 h-7 w-0.5 bg-[#0b1733]" style={{ left: `${posPE}%` }} />
                        <span className="absolute -top-5 -translate-x-1/2 text-[10px] font-bold text-[#0b1733]" style={{ left: `${posPE}%` }}>PE</span>
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                        <span>R$ 0</span>
                        <span>{formatBRL(scaleMax)}</span>
                      </div>
                      <p className={`mt-2 text-xs font-semibold ${acima ? 'text-green-700' : 'text-amber-700'}`}>
                        {acima
                          ? `Receita ${((dados.receita / dados.pontoEquilibrio - 1) * 100).toFixed(0)}% acima do ponto de equilíbrio.`
                          : `Receita ${((1 - dados.receita / dados.pontoEquilibrio) * 100).toFixed(0)}% abaixo do ponto de equilíbrio.`}
                      </p>
                    </div>
                  )
                })()}
                <p className="mt-3 text-[11px] text-slate-400">
                  Fixas: Trabalhistas + Sócios + Operacionais ({formatBRL(dados.despesasFixas)}).
                  Variáveis: CMV + Tributárias + Financeiras ({formatBRL(dados.despesasVariaveis)}).
                  Receita por competência; despesas do caixa do período.
                </p>
              </>
            )}
          </div>

          {/* ═══ BLOCO 6: EBITDA E MARGENS ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">EBITDA e Margens</h2>
              <p className="text-xs text-slate-400">Indicadores de rentabilidade — padrão CFO/investidor · {periodoLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] font-semibold text-slate-400">
                    <th className="pb-1.5">Indicador</th>
                    <th className="pb-1.5 text-right">Valor</th>
                    <th className="pb-1.5 text-right">Margem</th>
                    <th className="pb-1.5 text-right">Referência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { nome: 'Margem Bruta', valor: dados.lucroBruto, margem: dados.margemBrutaCalc, ref: 35 },
                    { nome: 'EBIT (Margem Operacional)', valor: dados.ebit, margem: dados.margemEbit, ref: 10 },
                    { nome: 'EBITDA', valor: dados.ebitda, margem: dados.margemEbitda, ref: 15 },
                    { nome: 'Margem Líquida', valor: dados.lucroLiquido, margem: dados.margemLiquida, ref: 8 },
                  ].map(l => {
                    const cor = l.margem >= l.ref ? 'bg-green-100 text-green-700'
                      : l.margem >= l.ref * 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    return (
                      <tr key={l.nome}>
                        <td className="py-2 font-semibold text-[#0b1733]">{l.nome}</td>
                        <td className={`py-2 text-right font-semibold ${l.valor >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{formatBRL(l.valor)}</td>
                        <td className={`py-2 text-right font-black ${l.margem >= l.ref ? 'text-green-700' : l.margem >= l.ref * 0.5 ? 'text-amber-600' : 'text-red-600'}`}>{l.margem.toFixed(1)}%</td>
                        <td className="py-2 text-right">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cor}`}>&gt; {l.ref}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              EBITDA estimado usando lançamentos de Imobilizado como proxy de depreciação ({formatBRL(dados.depreciacao)}) — para o valor exato, some a depreciação real.
              {dados.margemBrutaCalc > 50 && ' A margem bruta pode estar superestimada se houver produtos vendidos sem custo cadastrado (a parte sem custo entra como 100% de margem).'}
            </p>
          </div>

          {/* ═══ BLOCO 7: RECEBÍVEIS E CONCENTRAÇÃO ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">Recebíveis e Concentração</h2>
              <p className="text-xs text-slate-400">Risco de crédito e dependência de clientes · {periodoLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(() => {
                const rv = dados.recebidoVsFaturado
                const corRv = rv > 80 ? 'text-green-700' : rv >= 60 ? 'text-amber-600' : 'text-red-600'
                const conc = dados.concentracaoTop5Pct
                const corConc = conc < 30 ? 'text-green-700' : conc <= 50 ? 'text-amber-600' : 'text-red-600'
                const corTop1 = dados.top1Pct < 20 ? 'text-green-700' : dados.top1Pct <= 30 ? 'text-amber-600' : 'text-red-600'
                return (
                  <>
                    <div className="rounded-2xl bg-[#eef3fb] p-3">
                      <p className="text-[10px] font-semibold text-slate-500">Recebido vs Faturado</p>
                      <p className={`mt-1 text-base font-black ${corRv}`}>{rv.toFixed(0)}%</p>
                      <p className="text-[9px] text-slate-400">{formatBRL(dados.totalRecebido)} recebidos no mês</p>
                    </div>
                    <div className="rounded-2xl bg-[#eef3fb] p-3">
                      <p className="text-[10px] font-semibold text-slate-500">Concentração Top 5</p>
                      <p className={`mt-1 text-base font-black ${corConc}`}>{conc.toFixed(1)}%</p>
                      <p className="text-[9px] text-slate-400">da receita nos 5 maiores</p>
                    </div>
                    <div className="rounded-2xl bg-[#eef3fb] p-3">
                      <p className="text-[10px] font-semibold text-slate-500">Maior Cliente</p>
                      <p className={`mt-1 text-base font-black ${corTop1}`}>{dados.top1Pct.toFixed(1)}%</p>
                      <p className="text-[9px] text-slate-400 truncate">{dados.top5Clientes[0]?.cliente ?? '—'}</p>
                    </div>
                  </>
                )
              })()}
            </div>

            {dados.top1Pct > 25 && dados.top5Clientes[0] && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                ⚠ {dados.top5Clientes[0].cliente} representa {dados.top1Pct.toFixed(1)}% da receita — risco de concentração elevado.
              </div>
            )}

            {dados.top5Clientes.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] font-semibold text-slate-400">
                      <th className="pb-1.5">Cliente</th>
                      <th className="pb-1.5 text-right">Faturamento</th>
                      <th className="pb-1.5 text-right">% do Total</th>
                      <th className="pb-1.5 text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.top5Clientes.map((c, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1.5 font-medium text-[#0b1733] max-w-[220px] truncate">{c.cliente}</td>
                        <td className="py-1.5 text-right">{formatBRL(c.valor)}</td>
                        <td className="py-1.5 text-right text-slate-500">{c.pctTotal.toFixed(1)}%</td>
                        <td className={`py-1.5 text-right font-semibold ${c.margem === 0 ? 'text-slate-400' : c.margem < 20 ? 'text-red-600' : c.margem < 35 ? 'text-orange-600' : 'text-green-700'}`}>
                          {c.margem !== 0 ? `${c.margem.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 font-black bg-[#eef3fb]">
                      <td className="py-1.5 text-[#0b1733]">Top 5</td>
                      <td className="py-1.5 text-right text-[#0b1733]">{formatBRL(dados.top5Clientes.reduce((s, c) => s + c.valor, 0))}</td>
                      <td className="py-1.5 text-right text-[#0b1733]">{dados.concentracaoTop5Pct.toFixed(1)}%</td>
                      <td className="py-1.5" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-400">
              &quot;Recebido vs Faturado&quot; compara o que entrou (Recebimentos) com o que foi faturado no mês — não é prazo médio (PMR).
              Para PMR/aging e inadimplência real, use a aba <strong>Contas a Receber</strong> (títulos por vencimento).
            </p>
          </div>

          {/* ═══ BLOCO 8: ESTRUTURA DE CUSTOS ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">Estrutura de Custos</h2>
              <p className="text-xs text-slate-400">Peso de cada grupo de despesa sobre a receita · {periodoLabel}</p>
            </div>
            <div className="space-y-2.5">
              {dados.rankingCustos.map(g => {
                const gl = g.grupo.toLowerCase()
                const cor = gl.includes('custo') ? '#dc2626'
                  : gl.includes('trabalhista') || gl.includes('sócio') || gl.includes('socio') ? '#1b4fd6'
                  : gl.includes('operacion') ? '#f59e0b'
                  : gl.includes('tributár') || gl.includes('tributar') ? '#8b5cf6'
                  : gl.includes('financeira') ? '#ec4899' : '#94a3b8'
                return (
                  <div key={g.grupo}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#0b1733]">{g.grupo}</span>
                      <span className="text-slate-500">{formatBRL(g.valor)} · <span className="font-bold">{g.pctReceita.toFixed(1)}%</span></span>
                    </div>
                    <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full" style={{ width: `${(g.pctReceita / dados.maxPctReceita) * 100}%`, background: cor }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-sm font-black text-[#0b1733]">Total Saídas: {formatBRL(dados.totalSaidas)} · {pct(dados.totalSaidas, dados.receita)} da receita</span>
              {(() => {
                const ie = dados.indiceEficiencia
                const cor = ie < 15 ? 'bg-green-100 text-green-700' : ie <= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                return <span className={`rounded-full px-3 py-1 text-xs font-bold ${cor}`}>Eficiência operacional: {ie.toFixed(1)}% da receita</span>
              })()}
            </div>
          </div>

          {/* ═══ BLOCO 9: PAINEL EXECUTIVO ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">Painel Executivo</h2>
              <p className="text-xs text-slate-400">Resumo de saúde financeira · {periodoLabel}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {painel.map(p => (
                <div key={p.nome} className={`rounded-2xl border p-4 ${
                  p.sinal === 'verde' ? 'border-green-200 bg-green-50'
                  : p.sinal === 'amarelo' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{p.sinal === 'verde' ? '🟢' : p.sinal === 'amarelo' ? '🟡' : '🔴'}</span>
                    <p className="text-xs font-semibold text-slate-600">{p.nome}</p>
                  </div>
                  <p className={`mt-1.5 text-lg font-black ${
                    p.sinal === 'verde' ? 'text-green-700' : p.sinal === 'amarelo' ? 'text-amber-700' : 'text-red-700'
                  }`}>{p.valor}</p>
                </div>
              ))}
            </div>

            {alertasPainel.length > 0 ? (
              <div className="mt-4">
                <p className="text-sm font-black text-[#0b1733]">Alertas do período</p>
                <ul className="mt-2 space-y-2">
                  {alertasPainel.map(p => (
                    <li key={p.nome} className={`flex gap-2 rounded-xl border p-3 text-sm ${
                      p.sinal === 'vermelho' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      <span>{p.sinal === 'vermelho' ? '🔴' : '🟡'}</span>
                      <span>{p.acao ?? `${p.nome}: ${p.valor}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-center text-sm font-bold text-green-800">
                ✅ Todos os indicadores em zona saudável no período {periodoLabel}
              </div>
            )}
          </div>
        </>
      )}

      {contaSelecionada && (
        <LancamentosDrawer
          categoria={contaSelecionada}
          lancamentos={lancamentosConta}
          contas={contasSaida}
          onClose={() => setContaSelecionada(null)}
          onMoved={() => { setContaSelecionada(null); carregar() }}
        />
      )}

      {mostrarConciliacao && (
        <ConciliacaoModal
          mes={mes}
          ano={ano}
          onClose={() => setMostrarConciliacao(false)}
          onApplied={() => { setMostrarConciliacao(false); carregar() }}
        />
      )}
    </div>
  )
}
