'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL } from '@/lib/financeiro/formatters'
import {
  classificarAtividade, ATIVIDADES, ATIVIDADE_LABEL, ATIVIDADE_COR, type Atividade,
} from '@/lib/financeiro/dfc'

type FluxoItem = {
  tipo: string            // 'receita' | 'despesa'
  grupo: string           // contato (cliente/fornecedor/banco)
  categoria: string
  data_inicio: string | null
  valor: number           // sempre positivo (abs)
  mes: number
  ano: number
}

type CatAgg = { categoria: string; entradas: number; saidas: number; liquido: number; fonte: 'override' | 'auto' }
type AtivAgg = { atividade: Atividade; entradas: number; saidas: number; liquido: number; categorias: CatAgg[] }

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const OVERRIDE_KEY = 'ergotex_dfc_overrides_v1'
const SALDO_KEY = 'ergotex_dfc_saldos_v1'

// O que cada atividade significa, em linguagem de gestão (mostrado ao clicar no KPI).
const DEFINICAO: Record<Atividade, string> = {
  operacional: 'Caixa gerado (ou consumido) pela atividade-fim: vendas recebidas menos pagamentos a fornecedores, salários, impostos e despesas do dia a dia. É o motor do negócio — o indicador mais importante para a sustentabilidade.',
  investimento: 'Caixa usado para comprar — ou obtido ao vender — ativos de longo prazo: máquinas, veículos, imóveis, aplicações. Valor negativo (compra) normalmente indica expansão de capacidade.',
  financiamento: 'Caixa trocado com bancos e sócios: empréstimos e consórcios captados ou pagos, aportes de capital e distribuição de lucros. Mostra como a empresa se financia.',
}

export default function DFCManager() {
  const supabase = createClient()
  const hoje = new Date()
  const [escopo, setEscopo] = useState<'mes' | 'ano'>('mes')
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1)
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [itens, setItens] = useState<FluxoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarRevisao, setMostrarRevisao] = useState(false)
  const [buscaRevisao, setBuscaRevisao] = useState('')
  const [kpiAberto, setKpiAberto] = useState<Atividade | null>(null)

  const [overrides, setOverrides] = useState<Record<string, Atividade>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = localStorage.getItem(OVERRIDE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, Atividade>) : {}
    } catch { return {} }
  })
  const [saldos, setSaldos] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = localStorage.getItem(SALDO_KEY)
      return raw ? (JSON.parse(raw) as Record<string, number>) : {}
    } catch { return {} }
  })

  const periodoKey = escopo === 'mes' ? `${anoSel}-${mesSel}` : `${anoSel}-ano`
  const periodoLabel = escopo === 'mes' ? `${MESES_LONGO[mesSel - 1]}/${anoSel}` : `Ano ${anoSel}`
  const saldoInicial = saldos[periodoKey] ?? 0

  const salvarOverride = useCallback((categoria: string, ativ: Atividade | null) => {
    setOverrides(prev => {
      const next = { ...prev }
      if (ativ) next[categoria] = ativ
      else delete next[categoria]
      try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)) } catch { /* ignora */ }
      return next
    })
  }, [])

  const salvarSaldoInicial = useCallback((key: string, valor: number) => {
    setSaldos(prev => {
      const next = { ...prev, [key]: valor }
      try { localStorage.setItem(SALDO_KEY, JSON.stringify(next)) } catch { /* ignora */ }
      return next
    })
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase.from('fin_fluxo_caixa_import')
        .select('tipo,grupo,categoria,data_inicio,valor,mes,ano')
        .eq('ano', anoSel)
      if (escopo === 'mes') q = q.eq('mes', mesSel)
      const { data } = await q.order('data_inicio', { ascending: true })
      setItens((data ?? []) as FluxoItem[])
    } finally {
      setLoading(false)
    }
  }, [escopo, mesSel, anoSel])

  useEffect(() => { carregar() }, [carregar])

  // ── Agregação da DFC ──
  const dfc = useMemo(() => {
    // mapa: atividade → categoria → {entradas, saidas}
    const mapa: Record<Atividade, Map<string, { entradas: number; saidas: number; fonte: 'override' | 'auto' }>> = {
      operacional: new Map(), investimento: new Map(), financiamento: new Map(),
    }
    for (const it of itens) {
      const cat = it.categoria || 'Sem categoria'
      const { atividade, fonte } = classificarAtividade(cat, overrides[cat])
      const m = mapa[atividade]
      const cur = m.get(cat) ?? { entradas: 0, saidas: 0, fonte }
      if (it.tipo === 'receita') cur.entradas += it.valor
      else cur.saidas += it.valor
      cur.fonte = fonte
      m.set(cat, cur)
    }

    const ativAggs: AtivAgg[] = ATIVIDADES.map(ativ => {
      const categorias: CatAgg[] = [...mapa[ativ].entries()]
        .map(([categoria, v]) => ({
          categoria, entradas: v.entradas, saidas: v.saidas,
          liquido: v.entradas - v.saidas, fonte: v.fonte,
        }))
        .sort((a, b) => b.liquido - a.liquido)
      const entradas = categorias.reduce((s, c) => s + c.entradas, 0)
      const saidas = categorias.reduce((s, c) => s + c.saidas, 0)
      return { atividade: ativ, entradas, saidas, liquido: entradas - saidas, categorias }
    })

    const porAtiv = Object.fromEntries(ativAggs.map(a => [a.atividade, a])) as Record<Atividade, AtivAgg>
    const variacao = ativAggs.reduce((s, a) => s + a.liquido, 0)
    const totalEntradas = ativAggs.reduce((s, a) => s + a.entradas, 0)
    const totalSaidas = ativAggs.reduce((s, a) => s + a.saidas, 0)

    return { ativAggs, porAtiv, variacao, totalEntradas, totalSaidas }
  }, [itens, overrides])

  // ── Parecer técnico automático: lê os números e interpreta ──
  const parecer = useMemo(() => {
    const op = dfc.porAtiv.operacional, inv = dfc.porAtiv.investimento, fin = dfc.porAtiv.financiamento
    const O = op.liquido, I = inv.liquido, F = fin.liquido
    const variacao = dfc.variacao
    const fcf = O + I // fluxo de caixa livre (operacional após investimentos)
    if (dfc.totalEntradas === 0 && dfc.totalSaidas === 0) return null

    // Diagnóstico-título (regime de caixa: a operação se sustenta sozinha?)
    let diagnostico: { titulo: string; texto: string; tom: 'bom' | 'alerta' | 'neutro' }
    if (O > 0 && fcf >= 0 && variacao >= 0) {
      diagnostico = {
        tom: 'bom', titulo: 'Geração de caixa saudável',
        texto: `A operação gerou ${formatBRL(O)} de caixa, cobriu os investimentos do período e o caixa total cresceu ${formatBRL(variacao)}. A empresa se autofinancia.`,
      }
    } else if (O > 0) {
      diagnostico = {
        tom: 'neutro', titulo: 'Operação gera caixa, mas houve consumo no período',
        texto: `A operação gerou ${formatBRL(O)}, porém investimentos e/ou financiamento consumiram caixa e a variação do período fechou em ${formatBRL(variacao)}.`,
      }
    } else {
      diagnostico = {
        tom: 'alerta', titulo: 'A operação não gerou caixa no período',
        texto: `A atividade-fim consumiu ${formatBRL(Math.abs(O))} de caixa — o negócio não se autofinanciou. Prioridade: acelerar recebimentos e cortar saídas operacionais.`,
      }
    }

    const insights: { tipo: 'positivo' | 'alerta' | 'info'; texto: string }[] = []

    // Margem de caixa operacional
    if (op.entradas > 0) {
      const margem = (O / op.entradas) * 100
      if (O > 0) insights.push({ tipo: 'positivo', texto: `Margem de caixa operacional de ${margem.toFixed(1)}%: de cada R$ 100 recebidos da operação, sobraram R$ ${margem.toFixed(0)} depois de pagar fornecedores, salários e despesas.` })
      else insights.push({ tipo: 'alerta', texto: `As saídas operacionais (${formatBRL(op.saidas)}) superaram os recebimentos (${formatBRL(op.entradas)}) — queima de caixa na operação.` })
    }
    // Investimento
    if (I < 0) insights.push({ tipo: 'info', texto: `Investimento (CAPEX) de ${formatBRL(Math.abs(I))} em ativos de longo prazo — sinal de expansão de capacidade.` })
    else if (I > 0) insights.push({ tipo: 'alerta', texto: `Entrada de ${formatBRL(I)} por venda de ativos/resgate de aplicações: gera caixa, mas não é receita recorrente — não confunda com melhora operacional.` })
    // Fluxo de caixa livre
    if (O > 0) {
      if (fcf >= 0) insights.push({ tipo: 'positivo', texto: `Fluxo de caixa livre positivo (${formatBRL(fcf)}): a operação cobriu os investimentos com recurso próprio.` })
      else insights.push({ tipo: 'alerta', texto: `Fluxo de caixa livre negativo (${formatBRL(fcf)}): os investimentos superaram o caixa gerado pela operação; a diferença foi bancada por reserva ou financiamento.` })
    }
    // Financiamento
    if (F < 0) insights.push({ tipo: 'positivo', texto: `Financiamento líquido de −${formatBRL(Math.abs(F))}: a empresa amortizou dívidas/consórcios ou remunerou sócios, reduzindo a alavancagem.` })
    else if (F > 0) {
      if (O <= 0) insights.push({ tipo: 'alerta', texto: `Captou ${formatBRL(F)} de terceiros enquanto a operação não gerou caixa — dependência de dinheiro externo para funcionar. Risco se a captação cessar.` })
      else insights.push({ tipo: 'info', texto: `Captou ${formatBRL(F)} de terceiros (empréstimos/aportes) — saudável se o destino for investimento produtivo.` })
    }
    // Sustentabilidade da variação
    if (variacao > 0 && O <= 0) insights.push({ tipo: 'alerta', texto: `O caixa cresceu ${formatBRL(variacao)}, mas a melhora NÃO veio da operação (e sim de financiamento/venda de ativos) — não sustentável.` })
    if (variacao < 0) insights.push({ tipo: 'info', texto: `O caixa encolheu ${formatBRL(Math.abs(variacao))} no período. Confirme se foi investimento planejado (ok) ou queima operacional (atenção).` })
    // Maior saída operacional
    const maiorSaida = op.categorias.filter(c => c.saidas > 0).sort((a, b) => b.saidas - a.saidas)[0]
    if (maiorSaida && op.saidas > 0) {
      const pct = (maiorSaida.saidas / op.saidas) * 100
      insights.push({ tipo: 'info', texto: `Maior saída de caixa operacional: "${maiorSaida.categoria}" com ${formatBRL(maiorSaida.saidas)} (${pct.toFixed(0)}% das saídas da operação).` })
    }

    return { diagnostico, insights }
  }, [dfc])

  // Lista de categorias para revisão de classificação
  const listaRevisao = useMemo(() => {
    const map = new Map<string, { categoria: string; movimento: number; atividade: Atividade; fonte: 'override' | 'auto' }>()
    for (const it of itens) {
      const cat = it.categoria || 'Sem categoria'
      const { atividade, fonte } = classificarAtividade(cat, overrides[cat])
      const cur = map.get(cat) ?? { categoria: cat, movimento: 0, atividade, fonte }
      cur.movimento += it.valor
      cur.atividade = atividade
      cur.fonte = fonte
      map.set(cat, cur)
    }
    const q = buscaRevisao.trim().toLowerCase()
    return [...map.values()]
      .filter(c => !q || c.categoria.toLowerCase().includes(q))
      .sort((a, b) => b.movimento - a.movimento)
  }, [itens, overrides, buscaRevisao])

  const chartData = useMemo(() => [
    ...dfc.ativAggs.map(a => ({ nome: ATIVIDADE_LABEL[a.atividade], valor: a.liquido, cor: ATIVIDADE_COR[a.atividade] })),
    { nome: 'Variação', valor: dfc.variacao, cor: dfc.variacao >= 0 ? '#16a34a' : '#dc2626' },
  ], [dfc])

  const saldoFinal = saldoInicial + dfc.variacao
  const semDados = !loading && itens.length === 0

  // Exporta a DFC como PDF via diálogo de impressão (Salvar como PDF).
  // Usa as regras @media print do globals.css (escopo body.imprimindo + #area-impressao).
  function exportarPDF() {
    document.body.classList.add('imprimindo')
    const limpar = () => { document.body.classList.remove('imprimindo'); window.removeEventListener('afterprint', limpar) }
    window.addEventListener('afterprint', limpar)
    window.print()
  }

  return (
    <div id="area-impressao" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">DFC — Demonstração de Fluxo de Caixa</h1>
          <p className="mt-1 text-sm text-slate-500">
            Método direto, por <strong>regime de caixa</strong> (o que entrou e saiu de fato).
            Fonte: relatório <em>Entradas e Saídas por Cliente</em> do Tiny.
          </p>
        </div>
        <div className="no-print flex shrink-0 gap-2">
          {!semDados && !loading && (
            <button onClick={exportarPDF}
              className="rounded-2xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] transition">
              Exportar PDF
            </button>
          )}
          <Link href="/financeiro/importacao"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Importar Relatório
          </Link>
        </div>
      </div>

      {/* Cabeçalho que aparece SÓ no PDF */}
      <div className="only-print">
        <p className="text-lg font-black text-[#0b1733]">Ergotex · DFC — {periodoLabel}</p>
        <p className="text-xs text-slate-500">Método direto (regime de caixa) · Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
      </div>

      {/* Seletor de período */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
          {(['mes', 'ano'] as const).map(e => (
            <button key={e} onClick={() => setEscopo(e)}
              className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${escopo === e ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {e === 'mes' ? 'Mês' : 'Ano inteiro'}
            </button>
          ))}
          <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}
            className="ml-auto rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-1.5 text-sm font-medium text-[#0b1733] outline-none focus:border-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {escopo === 'mes' && (
          <div className="flex flex-wrap gap-1">
            {MESES.map((m, i) => (
              <button key={m} onClick={() => setMesSel(i + 1)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mesSel === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-200" />)}
          </div>
          <div className="h-72 animate-pulse rounded-3xl bg-slate-200" />
        </div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado de caixa para {periodoLabel}</p>
          <p className="mt-2 text-sm text-slate-400">
            Importe o relatório <strong>Entradas e Saídas por Cliente</strong> do Tiny na aba Importação (card Fluxo de Caixa).
          </p>
          <Link href="/financeiro/importacao"
            className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : (
        <>
          {/* KPIs das 3 atividades + variação — clique para ver a definição */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dfc.ativAggs.map(a => (
              <button key={a.atividade} type="button" onClick={() => setKpiAberto(p => p === a.atividade ? null : a.atividade)}
                className={`rounded-3xl bg-white p-6 shadow-sm border text-left transition hover:border-[#1b4fd6] ${kpiAberto === a.atividade ? 'border-[#1b4fd6] ring-1 ring-[#1b4fd6]' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ATIVIDADE_COR[a.atividade] }} />
                  <p className="text-sm font-semibold text-slate-500">Caixa {ATIVIDADE_LABEL[a.atividade]}</p>
                  <span className="ml-auto text-xs text-slate-300">{kpiAberto === a.atividade ? '×' : 'ⓘ'}</span>
                </div>
                <p className={`mt-3 text-2xl font-black ${a.liquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatBRL(a.liquido)}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  +{formatBRL(a.entradas)} entradas · −{formatBRL(a.saidas)} saídas
                </p>
                {kpiAberto === a.atividade && (
                  <p className="mt-3 border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-500">{DEFINICAO[a.atividade]}</p>
                )}
              </button>
            ))}
            <div className="rounded-3xl bg-[#0b1733] p-6 shadow-sm text-white">
              <p className="text-sm font-semibold text-blue-100">Variação Líquida de Caixa</p>
              <p className={`mt-3 text-2xl font-black ${dfc.variacao >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatBRL(dfc.variacao)}</p>
              <p className="mt-1 text-[11px] text-blue-200">Operacional + Investimento + Financiamento</p>
            </div>
          </div>

          {/* Parecer Técnico — interpretação automática dos números */}
          {parecer && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-[#0b1733]">Parecer Técnico</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">automático · {periodoLabel}</span>
              </div>
              <div className={`mt-3 rounded-2xl border p-4 ${
                parecer.diagnostico.tom === 'bom' ? 'border-emerald-200 bg-emerald-50'
                : parecer.diagnostico.tom === 'alerta' ? 'border-red-200 bg-red-50'
                : 'border-blue-200 bg-blue-50'
              }`}>
                <p className={`text-sm font-black ${
                  parecer.diagnostico.tom === 'bom' ? 'text-emerald-800'
                  : parecer.diagnostico.tom === 'alerta' ? 'text-red-800' : 'text-blue-800'
                }`}>
                  {parecer.diagnostico.tom === 'bom' ? '✓ ' : parecer.diagnostico.tom === 'alerta' ? '⚠️ ' : 'ℹ️ '}
                  {parecer.diagnostico.titulo}
                </p>
                <p className="mt-1 text-sm text-slate-700">{parecer.diagnostico.texto}</p>
              </div>
              <ul className="mt-4 space-y-2.5">
                {parecer.insights.map((ins, i) => (
                  <li key={i} className={`flex gap-2.5 rounded-xl border p-3 text-sm ${
                    ins.tipo === 'positivo' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : ins.tipo === 'alerta' ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-blue-200 bg-blue-50 text-blue-900'
                  }`}>
                    <span className="mt-0.5 font-bold">{ins.tipo === 'positivo' ? '↑' : ins.tipo === 'alerta' ? '!' : 'i'}</span>
                    <span>{ins.texto}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-slate-400">
                Parecer gerado automaticamente a partir dos números do período. Não substitui a análise de um contador.
              </p>
            </div>
          )}

          {/* Gráfico ponte */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#0b1733]">Geração de caixa por atividade</h3>
            <p className="text-xs text-slate-400">{periodoLabel} — quanto cada atividade somou ou consumiu de caixa</p>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Demonstração estruturada */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#0b1733]">Demonstração — {periodoLabel}</h3>
            <p className="text-xs text-slate-400">Método direto. Entradas em verde, saídas em vermelho.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {dfc.ativAggs.map(a => (
                    <DfcBloco key={a.atividade} ativ={a} />
                  ))}

                  {/* Variação líquida */}
                  <tr className="border-t-2 border-slate-300 bg-[#eef3fb]">
                    <td className="px-3 py-3 font-black text-[#0b1733]">(=) VARIAÇÃO LÍQUIDA DE CAIXA</td>
                    <td className={`px-3 py-3 text-right font-black ${dfc.variacao >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatBRL(dfc.variacao)}
                    </td>
                  </tr>

                  {/* Saldo inicial / final */}
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-600">
                      (+) Saldo inicial de caixa
                      <span className="ml-2 text-[10px] text-slate-400">(informe o saldo do começo do período)</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={saldoInicial || ''}
                        onChange={e => salvarSaldoInicial(periodoKey, Number(e.target.value) || 0)}
                        placeholder="0,00"
                        className="no-print w-36 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-[#1b4fd6]"
                      />
                      <span className="only-print text-right text-slate-700">{formatBRL(saldoInicial)}</span>
                    </td>
                  </tr>
                  <tr className="border-t-2 border-[#0b1733] bg-slate-50">
                    <td className="px-3 py-3 font-black text-[#0b1733]">(=) SALDO FINAL DE CAIXA</td>
                    <td className={`px-3 py-3 text-right font-black ${saldoFinal >= 0 ? 'text-[#0b1733]' : 'text-red-700'}`}>
                      {formatBRL(saldoFinal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {saldoInicial === 0 && (
              <p className="mt-3 text-xs text-slate-400">
                💡 O relatório do Tiny mostra apenas a <strong>variação</strong> do caixa. Informe o saldo inicial
                (extrato bancário do 1º dia do período) para ver o saldo final — fica salvo neste navegador.
              </p>
            )}
          </div>

          {/* Revisão de classificação */}
          <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <button onClick={() => setMostrarRevisao(v => !v)} className="flex w-full items-center justify-between text-left">
              <div>
                <h3 className="text-lg font-bold text-[#0b1733]">Revisar classificação das categorias</h3>
                <p className="text-xs text-slate-500">
                  Cada categoria é classificada automaticamente em Operacional / Investimento / Financiamento.
                  Ajuste se alguma caiu na atividade errada — fica salvo neste navegador.
                </p>
              </div>
              <span className="text-slate-400">{mostrarRevisao ? '▲' : '▼'}</span>
            </button>
            {mostrarRevisao && (
              <div className="mt-4">
                <input value={buscaRevisao} onChange={e => setBuscaRevisao(e.target.value)}
                  placeholder="Buscar categoria…"
                  className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                        <th className="py-2 pr-2">Categoria</th>
                        <th className="py-2 pr-2">Origem</th>
                        <th className="py-2 pr-2 text-right">Movimento</th>
                        <th className="py-2 pr-2">Atividade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaRevisao.map(c => (
                        <tr key={c.categoria} className="border-b border-slate-100">
                          <td className="py-2 pr-2 font-medium text-[#0b1733]">{c.categoria}</td>
                          <td className="py-2 pr-2 text-xs text-slate-500">{c.fonte === 'override' ? 'Manual' : 'Automático'}</td>
                          <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{formatBRL(c.movimento)}</td>
                          <td className="py-2 pr-2">
                            <select value={c.atividade}
                              onChange={e => salvarOverride(c.categoria, e.target.value as Atividade)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#1b4fd6]">
                              {ATIVIDADES.map(a => <option key={a} value={a}>{ATIVIDADE_LABEL[a]}</option>)}
                            </select>
                            {overrides[c.categoria] && (
                              <button onClick={() => salvarOverride(c.categoria, null)}
                                className="ml-2 text-xs text-slate-400 hover:text-slate-600" title="Voltar ao automático">↺</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Bloco de uma atividade na demonstração ────────────────────────────────────
function DfcBloco({ ativ }: { ativ: AtivAgg }) {
  const entradas = ativ.categorias.filter(c => c.entradas > 0)
  const saidas = ativ.categorias.filter(c => c.saidas > 0)
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50">
        <td className="px-3 py-2 font-black uppercase tracking-wide text-[#0b1733]">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: ATIVIDADE_COR[ativ.atividade] }} />
          Atividades de {ATIVIDADE_LABEL[ativ.atividade]}
        </td>
        <td className={`px-3 py-2 text-right font-black ${ativ.liquido >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {formatBRL(ativ.liquido)}
        </td>
      </tr>
      {entradas.map(c => (
        <tr key={`e-${c.categoria}`} className="border-b border-slate-50 hover:bg-slate-50">
          <td className="px-3 py-1.5 pl-8 text-slate-600">(+) {c.categoria}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-green-600">{formatBRL(c.entradas)}</td>
        </tr>
      ))}
      {saidas.map(c => (
        <tr key={`s-${c.categoria}`} className="border-b border-slate-50 hover:bg-slate-50">
          <td className="px-3 py-1.5 pl-8 text-slate-600">(−) {c.categoria}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-red-600">−{formatBRL(c.saidas)}</td>
        </tr>
      ))}
      {ativ.categorias.length === 0 && (
        <tr><td colSpan={2} className="px-3 py-1.5 pl-8 text-xs text-slate-400">Sem movimentos nesta atividade.</td></tr>
      )}
    </>
  )
}
