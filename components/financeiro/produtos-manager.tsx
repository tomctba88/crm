'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatPct } from '@/lib/financeiro/formatters'
import {
  classificarProduto, SEGMENTO_LABEL, SEGMENTO_COR, SEGMENTOS,
  type Segmento, type FonteClassificacao,
} from '@/lib/financeiro/produtos'

type ProdutoRow = {
  produto: string; sku: string | null; quantidade: number; valor: number
  frete: number; custo: number; valor_lucro: number | null
  percentual_lucro: number | null; total: number; tem_custo: boolean; grupo: string | null
}

type FiltroTipo = 'mes' | 'trimestre' | 'ano'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const MES_ATUAL = new Date().getMonth() + 1
const OVERRIDE_KEY = 'ergotex_produtos_overrides_v1'

function getMesesAno(tipo: FiltroTipo, mes: number): number[] {
  if (tipo === 'mes') return [mes]
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3); const ini = (q - 1) * 3 + 1
    return [ini, ini + 1, ini + 2]
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
}

// ── Agregado de um produto (somando todas as linhas do período) ──
type ProdutoAgg = {
  produto: string; segmento: Segmento; fonte: FonteClassificacao
  receita: number; custo: number; lucro: number; qtd: number; linhas: number
  temCusto: boolean; margemPct: number; precoMedio: number
}

// ── Agregado de um segmento ──
type SegAgg = {
  segmento: Segmento; receita: number; custo: number; lucro: number
  qtd: number; linhas: number; receitaComCusto: number
  margemPct: number; precoMedio: number; coberturaCusto: number; itens: number
}

function vazioSeg(seg: Segmento): SegAgg {
  return { segmento: seg, receita: 0, custo: 0, lucro: 0, qtd: 0, linhas: 0,
    receitaComCusto: 0, margemPct: 0, precoMedio: 0, coberturaCusto: 0, itens: 0 }
}

export default function ProdutosManager() {
  const [rows, setRows] = useState<ProdutoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroTipo>('mes')
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mes, setMes] = useState(MES_ATUAL)
  const [overrides, setOverrides] = useState<Record<string, Segmento>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = localStorage.getItem(OVERRIDE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, Segmento>) : {}
    } catch { return {} }
  })
  const [mostrarRevisao, setMostrarRevisao] = useState(false)
  const [buscaRevisao, setBuscaRevisao] = useState('')
  const [segFiltroTabela, setSegFiltroTabela] = useState<Segmento | 'todos'>('todos')
  const supabase = createClient()

  const salvarOverride = useCallback((produto: string, seg: Segmento | null) => {
    setOverrides(prev => {
      const next = { ...prev }
      if (seg) next[produto] = seg
      else delete next[produto]
      try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)) } catch { /* ignora */ }
      return next
    })
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    const meses = getMesesAno(filtro, mes)
    const { data } = await supabase
      .from('fin_vendas_produtos_import')
      .select('produto,sku,quantidade,valor,frete,custo,valor_lucro,percentual_lucro,total,tem_custo,grupo')
      .eq('ano', ano).in('mes', meses)
    setRows((data ?? []) as ProdutoRow[])
    setLoading(false)
  }, [filtro, ano, mes])

  useEffect(() => { carregar() }, [carregar])

  const dados = useMemo(() => {
    // 1. Agregar por produto (nome), somando linhas do período
    const porProduto = new Map<string, ProdutoAgg>()
    for (const r of rows) {
      const { segmento, fonte } = classificarProduto(r.produto, r.grupo, overrides[r.produto])
      const lucroLinha = r.tem_custo ? (r.valor_lucro ?? (r.valor - r.custo)) : 0
      const ex = porProduto.get(r.produto)
      if (ex) {
        ex.receita += r.valor
        ex.custo += r.tem_custo ? r.custo : 0
        ex.lucro += lucroLinha
        ex.qtd += r.quantidade
        ex.linhas += 1
        ex.temCusto = ex.temCusto || r.tem_custo
      } else {
        porProduto.set(r.produto, {
          produto: r.produto, segmento, fonte,
          receita: r.valor, custo: r.tem_custo ? r.custo : 0, lucro: lucroLinha,
          qtd: r.quantidade, linhas: 1, temCusto: r.tem_custo,
          margemPct: 0, precoMedio: 0,
        })
      }
    }
    const produtos = Array.from(porProduto.values())
    for (const p of produtos) {
      p.margemPct = p.receita > 0 && p.temCusto ? (p.lucro / p.receita) * 100 : 0
      p.precoMedio = p.qtd > 0 ? p.receita / p.qtd : 0
    }

    // 2. Agregar por segmento (a partir das linhas brutas para cobertura de custo)
    const segMap: Record<Segmento, SegAgg> = {
      cadeiras: vazioSeg('cadeiras'), moveis: vazioSeg('moveis'),
    }
    for (const r of rows) {
      const { segmento } = classificarProduto(r.produto, r.grupo, overrides[r.produto])
      const s = segMap[segmento]
      s.receita += r.valor
      s.qtd += r.quantidade
      s.linhas += 1
      if (r.tem_custo) {
        s.receitaComCusto += r.valor
        s.custo += r.custo
        s.lucro += (r.valor_lucro ?? (r.valor - r.custo))
      }
    }
    for (const seg of SEGMENTOS) {
      const s = segMap[seg]
      s.itens = produtos.filter(p => p.segmento === seg).length
      s.margemPct = s.receitaComCusto > 0 ? (s.lucro / s.receitaComCusto) * 100 : 0
      s.precoMedio = s.qtd > 0 ? s.receita / s.qtd : 0
      s.coberturaCusto = s.receita > 0 ? (s.receitaComCusto / s.receita) * 100 : 0
    }

    // 3. Consolidado
    const totReceita = segMap.cadeiras.receita + segMap.moveis.receita
    const totCusto = segMap.cadeiras.custo + segMap.moveis.custo
    const totLucro = segMap.cadeiras.lucro + segMap.moveis.lucro
    const totReceitaCC = segMap.cadeiras.receitaComCusto + segMap.moveis.receitaComCusto
    const totQtd = segMap.cadeiras.qtd + segMap.moveis.qtd
    const consolidado = {
      receita: totReceita, custo: totCusto, lucro: totLucro, qtd: totQtd,
      margemPct: totReceitaCC > 0 ? (totLucro / totReceitaCC) * 100 : 0,
      cobertura: totReceita > 0 ? (totReceitaCC / totReceita) * 100 : 0,
    }

    // 4. Curva ABC (por receita) sobre todos os produtos
    const ordenadosReceita = [...produtos].sort((a, b) => b.receita - a.receita)
    const abc: (ProdutoAgg & { pctAcum: number; classe: 'A' | 'B' | 'C' })[] = []
    let acumulado = 0
    for (const p of ordenadosReceita) {
      acumulado += p.receita
      const pctAcum = totReceita > 0 ? (acumulado / totReceita) * 100 : 0
      const classe = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C'
      abc.push({ ...p, pctAcum, classe })
    }

    // 5. Produtos sem custo (qualidade de dado)
    const semCusto = produtos.filter(p => !p.temCusto && p.receita > 0)
    const receitaSemCusto = semCusto.reduce((s, p) => s + p.receita, 0)

    return { produtos, segMap, consolidado, abc, semCusto, receitaSemCusto, totReceita }
  }, [rows, overrides])

  // ── Insights automáticos ──
  const insights = useMemo(() => {
    const out: { tipo: 'positivo' | 'alerta' | 'info'; texto: string }[] = []
    const c = dados.segMap.cadeiras, m = dados.segMap.moveis
    if (dados.totReceita === 0) return out

    // Quem é mais lucrativo (margem %)
    if (c.margemPct > 0 || m.margemPct > 0) {
      const maiorMargem = c.margemPct >= m.margemPct ? c : m
      const menor = maiorMargem === c ? m : c
      const diff = maiorMargem.margemPct - menor.margemPct
      out.push({
        tipo: 'positivo',
        texto: `${SEGMENTO_LABEL[maiorMargem.segmento]} tem a maior margem bruta (${formatPct(maiorMargem.margemPct)} vs ${formatPct(menor.margemPct)} de ${SEGMENTO_LABEL[menor.segmento]}) — ${diff.toFixed(1)} p.p. de vantagem. Cada real vendido nessa linha gera mais lucro.`,
      })
    }
    // Quem gera mais lucro absoluto
    const maiorLucro = c.lucro >= m.lucro ? c : m
    if (maiorLucro.lucro > 0) {
      const part = dados.consolidado.lucro > 0 ? (maiorLucro.lucro / dados.consolidado.lucro) * 100 : 0
      out.push({
        tipo: 'info',
        texto: `${SEGMENTO_LABEL[maiorLucro.segmento]} responde por ${formatPct(part)} de todo o lucro bruto do período (${formatBRL(maiorLucro.lucro)}). É o motor de resultado hoje.`,
      })
    }
    // Divergência margem vs volume (linha que vende muito mas com margem baixa)
    if (c.receita > 0 && m.receita > 0) {
      const maiorReceita = c.receita >= m.receita ? c : m
      const maiorMargem = c.margemPct >= m.margemPct ? c : m
      if (maiorReceita.segmento !== maiorMargem.segmento) {
        out.push({
          tipo: 'alerta',
          texto: `${SEGMENTO_LABEL[maiorReceita.segmento]} vende mais (${formatPct((maiorReceita.receita / dados.totReceita) * 100)} da receita), mas ${SEGMENTO_LABEL[maiorMargem.segmento]} é mais rentável. Vale avaliar empurrar o mix para a linha de maior margem ou rever preço/custo da linha de maior volume.`,
        })
      }
    }
    // Produto campeão de lucro
    const topLucro = [...dados.produtos].filter(p => p.temCusto).sort((a, b) => b.lucro - a.lucro)[0]
    if (topLucro && topLucro.lucro > 0) {
      out.push({
        tipo: 'positivo',
        texto: `"${topLucro.produto}" (${SEGMENTO_LABEL[topLucro.segmento]}) é o produto que mais gera lucro: ${formatBRL(topLucro.lucro)} com margem de ${formatPct(topLucro.margemPct)}.`,
      })
    }
    // Produtos que destroem margem
    const destroem = dados.produtos.filter(p => p.temCusto && p.margemPct < 0)
    if (destroem.length > 0) {
      const perda = destroem.reduce((s, p) => s + p.lucro, 0)
      out.push({
        tipo: 'alerta',
        texto: `${destroem.length} produto(s) estão sendo vendidos com prejuízo (margem negativa), drenando ${formatBRL(Math.abs(perda))} do resultado. Revise preço, custo ou descontinue.`,
      })
    }
    // Concentração (curva ABC)
    const classeA = dados.abc.filter(p => p.classe === 'A')
    if (classeA.length > 0 && dados.produtos.length >= 5) {
      const pctItens = (classeA.length / dados.produtos.length) * 100
      out.push({
        tipo: 'info',
        texto: `Concentração (Pareto): ${classeA.length} produtos (${formatPct(pctItens)} do catálogo vendido) geram 80% da receita. São os itens críticos para garantir estoque, prazo e atendimento.`,
      })
    }
    // Qualidade de dado
    if (dados.semCusto.length > 0) {
      out.push({
        tipo: 'alerta',
        texto: `${dados.semCusto.length} produto(s) sem custo cadastrado no Tiny (${formatBRL(dados.receitaSemCusto)} de receita) ficam fora do cálculo de margem. Cadastre o custo para a análise refletir 100% do faturamento.`,
      })
    }
    return out
  }, [dados])

  // ── Dados para gráficos ──
  const chartComparativo = useMemo(() => SEGMENTOS.map(seg => ({
    nome: SEGMENTO_LABEL[seg],
    Receita: Math.round(dados.segMap[seg].receita),
    Custo: Math.round(dados.segMap[seg].custo),
    Lucro: Math.round(dados.segMap[seg].lucro),
  })), [dados])

  const chartMixReceita = useMemo(() => SEGMENTOS.map(seg => ({
    name: SEGMENTO_LABEL[seg], value: Math.round(dados.segMap[seg].receita), seg,
  })).filter(d => d.value > 0), [dados])

  const chartMixLucro = useMemo(() => SEGMENTOS.map(seg => ({
    name: SEGMENTO_LABEL[seg], value: Math.round(Math.max(0, dados.segMap[seg].lucro)), seg,
  })).filter(d => d.value > 0), [dados])

  // Matriz: dispersão receita (x) × margem% (y), por produto com custo
  const scatterData = useMemo(() => {
    const base = dados.produtos.filter(p => p.temCusto && p.receita > 0)
    return SEGMENTOS.map(seg => ({
      seg,
      pontos: base.filter(p => p.segmento === seg).map(p => ({
        x: Math.round(p.receita), y: Number(p.margemPct.toFixed(1)), z: p.qtd, nome: p.produto,
      })),
    }))
  }, [dados])

  const medianas = useMemo(() => {
    const base = dados.produtos.filter(p => p.temCusto && p.receita > 0)
    if (base.length === 0) return { receita: 0, margem: 0 }
    const rec = [...base].map(p => p.receita).sort((a, b) => a - b)
    const mar = [...base].map(p => p.margemPct).sort((a, b) => a - b)
    const mid = (arr: number[]) => arr[Math.floor(arr.length / 2)]
    return { receita: mid(rec), margem: mid(mar) }
  }, [dados])

  // Tabela ABC filtrada
  const tabelaABC = useMemo(() => {
    let lista = dados.abc
    if (segFiltroTabela !== 'todos') lista = lista.filter(p => p.segmento === segFiltroTabela)
    return lista
  }, [dados, segFiltroTabela])

  // Lista para revisão de classificação
  const listaRevisao = useMemo(() => {
    const q = buscaRevisao.trim().toLowerCase()
    return [...dados.produtos]
      .filter(p => !q || p.produto.toLowerCase().includes(q))
      .sort((a, b) => b.receita - a.receita)
  }, [dados, buscaRevisao])

  const temDados = rows.length > 0

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-3xl bg-gradient-to-br from-[#0b1733] to-[#1b4fd6] p-6 text-white shadow-sm">
        <h1 className="text-xl font-bold">Análise de Produtos · Cadeiras × Móveis</h1>
        <p className="mt-1 max-w-3xl text-sm text-blue-100">
          Visão de <strong>gestão por categoria</strong> (category management): compare as duas linhas
          em receita, custo, margem e lucro, descubra qual é mais rentável e onde está o resultado.
          Fonte: relatório <em>Vendas por Produto</em> do Tiny.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-slate-500">Período:</span>
          {(['mes', 'trimestre', 'ano'] as FiltroTipo[]).map(t => (
            <button key={t} onClick={() => setFiltro(t)}
              className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
                filtro === t ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {t === 'mes' ? 'Mês' : t === 'trimestre' ? 'Trimestre' : 'Ano'}
            </button>
          ))}
          <select value={ano} onChange={e => setAno(Number(e.target.value))}
            className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {filtro !== 'ano' && (
          <div className="flex flex-wrap gap-1">
            {MESES.map((m, i) => (
              <button key={m} onClick={() => setMes(i + 1)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  (filtro === 'mes' ? mes === i + 1 : getMesesAno('trimestre', mes).includes(i + 1))
                    ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">Carregando…</div>
      ) : !temDados ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="font-semibold text-amber-800">Sem dados de produtos para o período.</p>
          <p className="mt-1 text-sm text-amber-700">
            Importe o relatório <strong>Vendas por Produto</strong> do Tiny na aba Importação
            (com as colunas Custo, Valor Lucro e % Lucro).
          </p>
        </div>
      ) : (
        <>
          {/* KPIs executivos */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard titulo="Receita total" valor={formatBRL(dados.consolidado.receita)}
              sub={`${dados.produtos.length} produtos · ${dados.consolidado.qtd} un.`} cor="#0b1733" />
            <KpiCard titulo="Lucro bruto" valor={formatBRL(dados.consolidado.lucro)}
              sub={`Custo: ${formatBRL(dados.consolidado.custo)}`} cor="#16a34a" />
            <KpiCard titulo="Margem bruta média" valor={formatPct(dados.consolidado.margemPct)}
              sub={dados.consolidado.cobertura < 99 ? `Cobertura de custo: ${formatPct(dados.consolidado.cobertura)}` : 'Custo em 100% das vendas'}
              cor="#1b4fd6" />
            <KpiCard titulo="Linha mais rentável"
              valor={SEGMENTO_LABEL[dados.segMap.cadeiras.margemPct >= dados.segMap.moveis.margemPct ? 'cadeiras' : 'moveis']}
              sub={`Maior margem % do período`}
              cor={SEGMENTO_COR[dados.segMap.cadeiras.margemPct >= dados.segMap.moveis.margemPct ? 'cadeiras' : 'moveis']} />
          </div>

          {/* Comparativo lado a lado */}
          <div className="grid gap-4 lg:grid-cols-2">
            {SEGMENTOS.map(seg => {
              const s = dados.segMap[seg]
              const partReceita = dados.consolidado.receita > 0 ? (s.receita / dados.consolidado.receita) * 100 : 0
              const partLucro = dados.consolidado.lucro > 0 ? (s.lucro / dados.consolidado.lucro) * 100 : 0
              return (
                <div key={seg} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: SEGMENTO_COR[seg] }} />
                    <h3 className="text-lg font-bold text-[#0b1733]">{SEGMENTO_LABEL[seg]}</h3>
                    <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      {s.itens} produtos
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                    <Metric label="Receita" valor={formatBRL(s.receita)} extra={`${formatPct(partReceita)} do total`} />
                    <Metric label="Lucro bruto" valor={formatBRL(s.lucro)} extra={`${formatPct(partLucro)} do lucro`} />
                    <Metric label="Custo (CMV)" valor={formatBRL(s.custo)} />
                    <Metric label="Margem bruta" valor={formatPct(s.margemPct)} destaque cor={SEGMENTO_COR[seg]} />
                    <Metric label="Itens vendidos" valor={`${s.qtd} un.`} />
                    <Metric label="Preço médio / un." valor={formatBRL(s.precoMedio)} />
                  </div>
                  {s.coberturaCusto < 99 && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      Margem calculada sobre {formatPct(s.coberturaCusto)} da receita (resto sem custo cadastrado).
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Veredito */}
          <Veredito segMap={dados.segMap} />

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Receita × Custo × Lucro por linha">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartComparativo} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="Receita" fill="#1b4fd6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Custo" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Lucro" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-2 gap-4">
              <ChartCard titulo="Mix de receita">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={chartMixReceita} dataKey="value" nameKey="name" cx="50%" cy="45%"
                      outerRadius={70} label={(p: { name?: string }) => p.name ?? ''}>
                      {chartMixReceita.map(d => <Cell key={d.seg} fill={SEGMENTO_COR[d.seg]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard titulo="Mix de lucro">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={chartMixLucro} dataKey="value" nameKey="name" cx="50%" cy="45%"
                      outerRadius={70} label={(p: { name?: string }) => p.name ?? ''}>
                      {chartMixLucro.map(d => <Cell key={d.seg} fill={SEGMENTO_COR[d.seg]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          {/* Matriz de decisão (quadrante volume × margem) */}
          <ChartCard titulo="Matriz de decisão · Receita × Margem por produto"
            subtitulo="Cada ponto é um produto. Quadrante superior-direito = Estrelas (alto volume + alta margem). Inferior-direito = Vacas leiteiras (volume alto, margem baixa). Superior-esquerdo = Nichos rentáveis. Inferior-esquerdo = candidatos a revisão/descontinuação.">
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis type="number" dataKey="x" name="Receita" tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  label={{ value: 'Receita →', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Margem %" tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  label={{ value: 'Margem % →', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[60, 400]} name="Qtd" />
                <ReferenceLine x={medianas.receita} stroke="#cbd5e1" strokeDasharray="4 4" />
                <ReferenceLine y={medianas.margem} stroke="#cbd5e1" strokeDasharray="4 4" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as { nome: string; x: number; y: number; z: number } | undefined
                    if (!p) return null
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow">
                        <p className="font-semibold text-[#0b1733]">{p.nome}</p>
                        <p className="text-slate-600">Receita: {formatBRL(p.x)}</p>
                        <p className="text-slate-600">Margem: {p.y}%</p>
                        <p className="text-slate-600">Qtd: {p.z} un.</p>
                      </div>
                    )
                  }} />
                <Legend />
                {scatterData.map(({ seg, pontos }) => (
                  <Scatter key={seg} name={SEGMENTO_LABEL[seg]} data={pontos} fill={SEGMENTO_COR[seg]} fillOpacity={0.7} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Curva ABC */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-[#0b1733]">Curva ABC de produtos</h3>
                <p className="text-xs text-slate-500">
                  Classe A = 80% da receita · B = próximos 15% · C = últimos 5%. Priorize a gestão dos itens A.
                </p>
              </div>
              <div className="flex gap-1">
                {(['todos', ...SEGMENTOS] as const).map(t => (
                  <button key={t} onClick={() => setSegFiltroTabela(t)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      segFiltroTabela === t ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {t === 'todos' ? 'Todos' : SEGMENTO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Produto</th>
                    <th className="py-2 pr-2">Linha</th>
                    <th className="py-2 pr-2 text-right">Receita</th>
                    <th className="py-2 pr-2 text-right">Lucro</th>
                    <th className="py-2 pr-2 text-right">Margem</th>
                    <th className="py-2 pr-2 text-right">Qtd</th>
                    <th className="py-2 pr-2 text-center">Classe</th>
                  </tr>
                </thead>
                <tbody>
                  {tabelaABC.slice(0, 40).map((p, i) => (
                    <tr key={p.produto} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                      <td className="py-2 pr-2 font-medium text-[#0b1733]">{p.produto}</td>
                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                          <span className="h-2 w-2 rounded-full" style={{ background: SEGMENTO_COR[p.segmento] }} />
                          {SEGMENTO_LABEL[p.segmento]}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(p.receita)}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${p.lucro < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {p.temCusto ? formatBRL(p.lucro) : '—'}
                      </td>
                      <td className={`py-2 pr-2 text-right tabular-nums ${p.margemPct < 0 ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                        {p.temCusto ? formatPct(p.margemPct) : '—'}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{p.qtd}</td>
                      <td className="py-2 pr-2 text-center">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                          p.classe === 'A' ? 'bg-emerald-100 text-emerald-700'
                          : p.classe === 'B' ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                        }`}>{p.classe}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tabelaABC.length > 40 && (
                <p className="mt-2 text-center text-xs text-slate-400">Mostrando os 40 maiores de {tabelaABC.length} produtos.</p>
              )}
            </div>
          </div>

          {/* Insights + Como usar */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#0b1733]">Insights automáticos</h3>
              <p className="text-xs text-slate-500">Leitura do período atual, gerada a partir dos seus números.</p>
              <ul className="mt-4 space-y-2.5">
                {insights.length === 0 && <li className="text-sm text-slate-400">Sem insights para o período.</li>}
                {insights.map((ins, i) => (
                  <li key={i} className={`flex gap-2.5 rounded-xl border p-3 text-sm ${
                    ins.tipo === 'positivo' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : ins.tipo === 'alerta' ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-blue-200 bg-blue-50 text-blue-900'
                  }`}>
                    <span className="mt-0.5 font-bold">
                      {ins.tipo === 'positivo' ? '↑' : ins.tipo === 'alerta' ? '!' : 'i'}
                    </span>
                    <span>{ins.texto}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-[#0b1733] p-6 text-white shadow-sm">
              <h3 className="text-lg font-bold">Como usar esta análise (modelo de grandes empresas)</h3>
              <ul className="mt-4 space-y-3 text-sm text-blue-100">
                <GuiaItem titulo="Gestão de mix (mix management)"
                  texto="Direcione o esforço comercial e o marketing para a linha de maior margem. Pequenas mudanças no mix de vendas elevam o lucro sem precisar vender mais." />
                <GuiaItem titulo="Precificação por margem-alvo"
                  texto="Use a margem de cada linha para definir descontos máximos do vendedor. Produtos de margem baixa não comportam o mesmo desconto dos de margem alta." />
                <GuiaItem titulo="Curva ABC / Pareto"
                  texto="Os itens classe A merecem prioridade em estoque, prazo e negociação de fornecedor. Itens C podem ser racionalizados para reduzir complexidade." />
                <GuiaItem titulo="Racionalização de portfólio"
                  texto="Produtos de margem negativa ou irrelevante (quadrante inferior-esquerdo) são candidatos a reajuste de preço, renegociação de custo ou descontinuação." />
                <GuiaItem titulo="Negociação de custos (CMV)"
                  texto="A linha que mais consome CMV é onde 1% de redução de custo gera mais lucro. Use o volume como argumento na negociação com fornecedores." />
              </ul>
            </div>
          </div>

          {/* Revisão de classificação */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <button onClick={() => setMostrarRevisao(v => !v)}
              className="flex w-full items-center justify-between text-left">
              <div>
                <h3 className="text-lg font-bold text-[#0b1733]">Revisar classificação dos produtos</h3>
                <p className="text-xs text-slate-500">
                  Cada produto é classificado pelo grupo do Tiny ou pelo nome. Ajuste manualmente se algum caiu na linha errada.
                </p>
              </div>
              <span className="text-slate-400">{mostrarRevisao ? '▲' : '▼'}</span>
            </button>
            {mostrarRevisao && (
              <div className="mt-4">
                <input value={buscaRevisao} onChange={e => setBuscaRevisao(e.target.value)}
                  placeholder="Buscar produto…"
                  className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                        <th className="py-2 pr-2">Produto</th>
                        <th className="py-2 pr-2">Origem</th>
                        <th className="py-2 pr-2 text-right">Receita</th>
                        <th className="py-2 pr-2">Linha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaRevisao.map(p => (
                        <tr key={p.produto} className="border-b border-slate-100">
                          <td className="py-2 pr-2 font-medium text-[#0b1733]">{p.produto}</td>
                          <td className="py-2 pr-2 text-xs text-slate-500">
                            {p.fonte === 'override' ? 'Manual'
                              : p.fonte === 'grupo' ? 'Grupo Tiny'
                              : p.fonte === 'nome' ? 'Nome'
                              : 'Padrão (Móveis)'}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{formatBRL(p.receita)}</td>
                          <td className="py-2 pr-2">
                            <select value={p.segmento}
                              onChange={e => salvarOverride(p.produto, e.target.value as Segmento)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]">
                              {SEGMENTOS.map(s => <option key={s} value={s}>{SEGMENTO_LABEL[s]}</option>)}
                            </select>
                            {overrides[p.produto] && (
                              <button onClick={() => salvarOverride(p.produto, null)}
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

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function KpiCard({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: cor }}>{valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  )
}

function Metric({ label, valor, extra, destaque, cor }: {
  label: string; valor: string; extra?: string; destaque?: boolean; cor?: string
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`${destaque ? 'text-xl font-bold' : 'text-base font-semibold'}`}
        style={destaque ? { color: cor } : { color: '#0b1733' }}>{valor}</p>
      {extra && <p className="text-[11px] text-slate-400">{extra}</p>}
    </div>
  )
}

function ChartCard({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-bold text-[#0b1733]">{titulo}</h3>
      {subtitulo && <p className="mb-2 mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function GuiaItem({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <li className="border-l-2 border-blue-400 pl-3">
      <p className="font-semibold text-white">{titulo}</p>
      <p className="text-blue-200">{texto}</p>
    </li>
  )
}

function Veredito({ segMap }: { segMap: Record<Segmento, SegAgg> }) {
  const c = segMap.cadeiras, m = segMap.moveis
  if (c.receita === 0 && m.receita === 0) return null
  const maiorMargem = c.margemPct >= m.margemPct ? c : m
  const maiorLucro = c.lucro >= m.lucro ? c : m
  const mesmaLinha = maiorMargem.segmento === maiorLucro.segmento
  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-700">Veredito · Quem é mais lucrativo?</h3>
      <p className="mt-2 text-[#0b1733]">
        {mesmaLinha ? (
          <>
            <strong>{SEGMENTO_LABEL[maiorMargem.segmento]}</strong> é a linha mais lucrativa do período:
            tem a maior margem bruta (<strong>{formatPct(maiorMargem.margemPct)}</strong>) e também gera o maior
            lucro absoluto (<strong>{formatBRL(maiorLucro.lucro)}</strong>). É onde concentrar esforço comercial.
          </>
        ) : (
          <>
            Depende do critério: <strong>{SEGMENTO_LABEL[maiorMargem.segmento]}</strong> é mais
            rentável por venda (margem de <strong>{formatPct(maiorMargem.margemPct)}</strong>), mas{' '}
            <strong>{SEGMENTO_LABEL[maiorLucro.segmento]}</strong> traz mais lucro em volume
            (<strong>{formatBRL(maiorLucro.lucro)}</strong>). Estratégia: proteger o volume da linha de lucro
            e empurrar o mix para a de maior margem.
          </>
        )}
      </p>
    </div>
  )
}
