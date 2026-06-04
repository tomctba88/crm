'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatPct } from '@/lib/financeiro/formatters'
import { CATEGORIAS_CUSTO, CATEGORIAS_MAO_DE_OBRA } from '@/lib/tiny/categorias'

type BalanceteItem = { tipo: string; grupo: string; categoria: string; valor: number }
type VendaItem = {
  cliente: string; cnpj_cpf: string; valor: number; frete: number
  custo: number; valor_lucro: number; percentual_lucro: number; total: number; segmento: string
}
type PedidoItem = { valor_total: number; valor_liquido: number; taxas: number; tarifas: number; forma_recebimento: string }
type RecebimentoItem = { valor_original: number; valor_recebido: number; juros: number; taxas: number; descontos: number }

type FiltroTipo = 'mes' | 'trimestre' | 'ano'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const MES_ATUAL = new Date().getMonth() + 1

const SEGMENTO_LABEL: Record<string, string> = {
  corporativo: 'Corporativo',
  decor: 'Decor',
  lojista: 'Lojista',
  outros: 'Outros',
}
const SEGMENTO_COR: Record<string, string> = {
  corporativo: '#1b4fd6',
  decor: '#16a34a',
  lojista: '#f59e0b',
  outros: '#94a3b8',
}

function getMesesAno(tipo: FiltroTipo, ano: number, mes: number): number[] {
  if (tipo === 'mes') return [mes]
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3); const ini = (q - 1) * 3 + 1
    return [ini, ini + 1, ini + 2]
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
}

function matchesCat(categoria: string, lista: string[]) {
  const lower = categoria?.toLowerCase() ?? ''
  return lista.some(c => lower.includes(c.toLowerCase()))
}

export default function IndicadoresManager() {
  const [balancete, setBalancete] = useState<BalanceteItem[]>([])
  const [vendasImport, setVendasImport] = useState<VendaItem[]>([])
  const [pedidosImport, setPedidosImport] = useState<PedidoItem[]>([])
  const [recebimentosImport, setRecebimentosImport] = useState<RecebimentoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroTipo>('mes')
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mes, setMes] = useState(MES_ATUAL)
  const [paginaClientes, setPaginaClientes] = useState(1)
  const [filtroBusca, setFiltroBusca] = useState('')
  const supabase = createClient()

  const carregar = useCallback(async () => {
    setLoading(true)
    const meses = getMesesAno(filtro, ano, mes)
    const [{ data: bal }, { data: vd }, { data: ped }, { data: rec }] = await Promise.all([
      supabase.from('fin_balancete').select('tipo,grupo,categoria,valor').eq('ano', ano).in('mes', meses),
      supabase.from('fin_vendas_import').select('cliente,cnpj_cpf,valor,frete,custo,valor_lucro,percentual_lucro,total,segmento').eq('ano', ano).in('mes', meses),
      supabase.from('fin_pedidos_import').select('valor_total,valor_liquido,taxas,tarifas,forma_recebimento').eq('ano', ano).in('mes', meses),
      supabase.from('fin_recebimentos_import').select('valor_original,valor_recebido,juros,taxas,descontos').eq('ano', ano).in('mes', meses),
    ])
    setBalancete((bal ?? []) as BalanceteItem[])
    setVendasImport((vd ?? []) as VendaItem[])
    setPedidosImport((ped ?? []) as PedidoItem[])
    setRecebimentosImport((rec ?? []) as RecebimentoItem[])
    setPaginaClientes(1)
    setLoading(false)
  }, [filtro, ano, mes])

  useEffect(() => { carregar() }, [carregar])

  const dados = useMemo(() => {
    const bal = balancete
    const vd = vendasImport
    const ped = pedidosImport
    const rec = recebimentosImport

    // ── DRE ──
    const totalEntradas = bal.filter(b => b.tipo === 'entrada').reduce((s, b) => s + b.valor, 0)
    const totalSaidas = bal.filter(b => b.tipo === 'saida').reduce((s, b) => s + b.valor, 0)
    const resultado = totalEntradas - totalSaidas

    const cmv = bal.filter(b => b.tipo === 'saida' && matchesCat(b.categoria, CATEGORIAS_CUSTO)).reduce((s, b) => s + b.valor, 0)
    const despTrab = bal.filter(b => b.tipo === 'saida' && matchesCat(b.categoria, CATEGORIAS_MAO_DE_OBRA)).reduce((s, b) => s + b.valor, 0)
    const despOper = bal.filter(b => b.tipo === 'saida' && !matchesCat(b.categoria, CATEGORIAS_CUSTO) && !matchesCat(b.categoria, CATEGORIAS_MAO_DE_OBRA)).reduce((s, b) => s + b.valor, 0)

    // ── FATURAMENTO ──
    const faturamentoBruto = vd.reduce((s, v) => s + v.valor, 0)
    const lucroBruto = vd.reduce((s, v) => s + v.valor_lucro, 0)
    const margemBruta = faturamentoBruto > 0 ? (lucroBruto / faturamentoBruto) * 100 : 0
    const numPedidos = ped.length > 0 ? ped.length : vd.length
    const ticketMedio = numPedidos > 0 ? faturamentoBruto / numPedidos : 0

    // Taxas de cartão/mercado pago
    const totalTaxasPedidos = ped.reduce((s, p) => s + p.taxas + p.tarifas, 0)
    const faturamentoLiquido = faturamentoBruto - totalTaxasPedidos

    // ── SEGMENTOS ──
    const temSegmento = vd.some(v => v.segmento && v.segmento !== 'outros')
    const segmentosChave = temSegmento
      ? ['corporativo', 'decor', 'lojista']
      : ['outros']
    const segmentos = segmentosChave.map(seg => {
      const vdSeg = vd.filter(v => v.segmento === seg)
      const total = vdSeg.reduce((s, v) => s + v.valor, 0)
      const lucro = vdSeg.reduce((s, v) => s + v.valor_lucro, 0)
      const margem = total > 0 ? (lucro / total) * 100 : 0
      const count = vdSeg.length
      return { segmento: seg, label: SEGMENTO_LABEL[seg] || seg, total, lucro, margem, count, cor: SEGMENTO_COR[seg] }
    }).filter(s => s.total > 0)

    // ── CAIXA ──
    const totalRecebido = rec.reduce((s, r) => s + r.valor_recebido, 0)
    const totalOriginal = rec.reduce((s, r) => s + r.valor_original, 0)
    const jurosRecebidos = rec.reduce((s, r) => s + r.juros, 0)
    const taxasRecebimentos = rec.reduce((s, r) => s + r.taxas, 0)
    const descontosDados = rec.reduce((s, r) => s + r.descontos, 0)

    // Pagamentos por forma (de pedidos_import)
    const formaMap: Record<string, number> = {}
    for (const p of ped) {
      const forma = p.forma_recebimento?.split(' ')[0] || 'Outros'
      formaMap[forma] = (formaMap[forma] || 0) + p.valor_total
    }
    const porForma = Object.entries(formaMap).map(([forma, total]) => ({ forma, total })).sort((a, b) => b.total - a.total)

    // ── CUSTOS ──
    const catMap: Record<string, number> = {}
    for (const b of bal.filter(b => b.tipo === 'saida')) {
      catMap[b.categoria || 'Sem categoria'] = (catMap[b.categoria || 'Sem categoria'] ?? 0) + b.valor
    }
    const custosPorCat = Object.entries(catMap).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)

    // Mão de obra
    const maoDeObraMap: Record<string, number> = {}
    for (const b of bal.filter(b => b.tipo === 'saida' && matchesCat(b.categoria, CATEGORIAS_MAO_DE_OBRA))) {
      maoDeObraMap[b.categoria || 'Outros'] = (maoDeObraMap[b.categoria || 'Outros'] ?? 0) + b.valor
    }
    const totalMaoDeObra = Object.values(maoDeObraMap).reduce((s, v) => s + v, 0)

    // Clientes
    const numClientes = vd.length
    const maiorCliente = vd.length > 0 ? vd.reduce((a, b) => a.valor > b.valor ? a : b) : null
    const menorCliente = vd.length > 0 ? vd.reduce((a, b) => a.valor < b.valor ? a : b) : null

    return {
      totalEntradas, totalSaidas, resultado, cmv, despTrab, despOper,
      faturamentoBruto, faturamentoLiquido, lucroBruto, margemBruta,
      numPedidos, ticketMedio, totalTaxasPedidos, temSegmento, segmentos,
      totalRecebido, totalOriginal, jurosRecebidos, taxasRecebimentos, descontosDados, porForma,
      custosPorCat: custosPorCat.slice(0, 15), maoDeObraMap, totalMaoDeObra,
      numClientes, maiorCliente, menorCliente,
    }
  }, [balancete, vendasImport, pedidosImport, recebimentosImport])

  const clientesFiltrados = useMemo(() => {
    let r = [...vendasImport].sort((a, b) => b.valor - a.valor)
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      r = r.filter(v => v.cliente?.toLowerCase().includes(b) || v.cnpj_cpf?.includes(b))
    }
    return r
  }, [vendasImport, filtroBusca])

  const POR_PAGINA = 20
  const totalPaginasClientes = Math.ceil(clientesFiltrados.length / POR_PAGINA)
  const clientesPagina = clientesFiltrados.slice((paginaClientes - 1) * POR_PAGINA, paginaClientes * POR_PAGINA)

  const semDados = !loading && balancete.length === 0 && vendasImport.length === 0

  const periodoLabel = filtro === 'mes'
    ? `${MESES[mes - 1]}/${ano}`
    : filtro === 'trimestre' ? `T${Math.ceil(mes / 3)}/${ano}` : `${ano}`

  function exportarCSV() {
    const cols = ['Segmento', 'Cliente', 'CNPJ/CPF', 'Faturamento', 'Custo', 'Lucro R$', 'Margem %']
    const rows = clientesFiltrados.map(v => [
      dados.temSegmento ? (SEGMENTO_LABEL[v.segmento] || v.segmento) : '',
      v.cliente, v.cnpj_cpf, v.valor.toFixed(2), v.custo.toFixed(2),
      v.valor_lucro.toFixed(2), v.percentual_lucro.toFixed(1),
    ])
    const csv = [cols, ...rows].map(r => r.join(';')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `fechamento-${periodoLabel}.csv`
    a.click()
  }

  const dreRow = (label: string, valor: number, pctBase: number, destaque = false, positivo = true) => (
    <tr className={destaque ? 'bg-[#eef3fb] font-black' : ''}>
      <td className="py-2 pr-4 text-sm">{label}</td>
      <td className={`py-2 pr-4 text-right text-sm font-semibold ${valor < 0 || (!positivo && valor > 0) ? 'text-red-600' : 'text-[#0b1733]'}`}>
        {formatBRL(Math.abs(valor))}
      </td>
      <td className="py-2 text-right text-xs text-slate-500">
        {pctBase > 0 ? formatPct((valor / pctBase) * 100) : '—'}
      </td>
    </tr>
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Fechamento do Mês</h1>
          <p className="mt-1 text-sm text-slate-500">DRE · Faturamento · Custos · Caixa · Margem por cliente</p>
        </div>
        <Link href="/financeiro/importacao"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition self-start">
          Importar Relatórios
        </Link>
      </div>

      {/* Filtros de período */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
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
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]">
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
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado importado para {periodoLabel}</p>
          <p className="mt-2 text-sm text-slate-400">Importe os relatórios do Tiny ERP para visualizar o fechamento.</p>
          <Link href="/financeiro/importacao"
            className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Base: relatórios Tiny importados ·{' '}
            <span className="font-semibold text-[#1b4fd6]">{periodoLabel}</span>
            {' · '}
            <Link href="/financeiro/importacao" className="underline hover:text-[#1b4fd6]">Reimportar</Link>
          </p>

          {/* ─── BLOCO 1: DRE ─── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#0b1733]">Resultado do Período (DRE)</h2>
            <p className="text-xs text-slate-400 mt-1">Base: Balancete importado do Tiny</p>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                      <th className="pb-2 pr-4">Descrição</th>
                      <th className="pb-2 pr-4 text-right">Valor</th>
                      <th className="pb-2 text-right">% Entradas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dreRow('(+) Total de Entradas', dados.totalEntradas, dados.totalEntradas, true)}
                    {dreRow('(-) CMV', dados.cmv, dados.totalEntradas)}
                    {dreRow('(=) Lucro Bruto', dados.totalEntradas - dados.cmv, dados.totalEntradas, true)}
                    {dreRow('(-) Despesas Trabalhistas', dados.despTrab, dados.totalEntradas)}
                    {dreRow('(-) Outras Despesas', dados.despOper, dados.totalEntradas)}
                    {dreRow('(=) Resultado Líquido', dados.resultado, dados.totalEntradas, true, dados.resultado >= 0)}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3 content-start">
                {[
                  { label: 'Total Entradas', valor: dados.totalEntradas, cor: 'text-[#1b4fd6]' },
                  { label: 'Total Saídas', valor: dados.totalSaidas, cor: 'text-red-600' },
                  { label: 'CMV', valor: dados.cmv, cor: 'text-orange-600', sub: formatPct(dados.totalEntradas > 0 ? (dados.cmv/dados.totalEntradas)*100 : 0) + ' das entradas' },
                  { label: 'Resultado', valor: dados.resultado, cor: dados.resultado >= 0 ? 'text-green-600' : 'text-red-600' },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-4">
                    <p className="text-xs font-semibold text-slate-500">{k.label}</p>
                    {k.sub && <p className="text-[10px] text-slate-400">{k.sub}</p>}
                    <p className={`mt-1 text-lg font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── BLOCO 2: FATURAMENTO ─── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-black text-[#0b1733]">Faturamento</h2>
                <p className="text-xs text-slate-400">Base: Relatório de Vendas importado</p>
              </div>
              <button onClick={exportarCSV}
                className="rounded-xl bg-[#0b1733] px-4 py-2 text-xs font-bold text-white hover:bg-[#1b4fd6] transition">
                Exportar CSV
              </button>
            </div>

            {/* KPIs faturamento */}
            <div className="grid gap-3 md:grid-cols-4 mb-6">
              {[
                { label: 'Faturamento Bruto', valor: dados.faturamentoBruto, cor: 'text-[#0b1733]' },
                { label: 'Lucro Bruto', valor: dados.lucroBruto, cor: 'text-green-600', sub: 'Margem: ' + formatPct(dados.margemBruta) },
                { label: 'Pedidos', valor: dados.numPedidos, cor: 'text-[#1b4fd6]', isMoney: false },
                { label: 'Ticket Médio', valor: dados.ticketMedio, cor: 'text-slate-700' },
              ].map(k => (
                <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-4">
                  <p className="text-xs font-semibold text-slate-500">{k.label}</p>
                  {k.sub && <p className="text-[10px] text-slate-400">{k.sub}</p>}
                  <p className={`mt-1 text-lg font-black ${k.cor}`}>
                    {k.isMoney === false ? k.valor : formatBRL(k.valor as number)}
                  </p>
                </div>
              ))}
            </div>

            {/* Segmentos */}
            {dados.temSegmento ? (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-3">Faturamento por Fonte de Receita</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                        <th className="pb-2 pr-4">Segmento</th>
                        <th className="pb-2 pr-4 text-right">Pedidos</th>
                        <th className="pb-2 pr-4 text-right">Faturamento</th>
                        <th className="pb-2 pr-4 text-right">Lucro R$</th>
                        <th className="pb-2 text-right">Margem %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.segmentos.map((s, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-2 font-black text-[#0b1733]">
                              <span className="w-3 h-3 rounded-full" style={{ background: s.cor }} />
                              {s.label}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-500">{s.count}</td>
                          <td className="py-3 pr-4 text-right font-bold">{formatBRL(s.total)}</td>
                          <td className={`py-3 pr-4 text-right font-semibold ${s.lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(s.lucro)}</td>
                          <td className={`py-3 text-right font-black ${s.margem < 20 ? 'text-red-600' : s.margem < 35 ? 'text-orange-600' : 'text-green-700'}`}>{formatPct(s.margem)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 bg-[#eef3fb] font-black">
                        <td className="py-3 pr-4 text-[#0b1733]">Total</td>
                        <td className="py-3 pr-4 text-right">{vendasImport.length}</td>
                        <td className="py-3 pr-4 text-right">{formatBRL(dados.faturamentoBruto)}</td>
                        <td className={`py-3 pr-4 text-right ${dados.lucroBruto >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(dados.lucroBruto)}</td>
                        <td className={`py-3 text-right ${dados.margemBruta < 20 ? 'text-red-600' : dados.margemBruta < 35 ? 'text-orange-600' : 'text-green-700'}`}>{formatPct(dados.margemBruta)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {dados.totalTaxasPedidos > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Taxas de cartão/gateway: <span className="font-semibold text-red-500">-{formatBRL(dados.totalTaxasPedidos)}</span>{' '}
                    → Faturamento líquido: <span className="font-semibold text-green-600">{formatBRL(dados.faturamentoLiquido)}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center">
                <p className="text-sm text-slate-500">
                  Para ver faturamento por <strong>Corporativo / Decor / Lojista</strong>, exporte o Relatório de Vendas do Tiny incluindo a coluna <strong>Fonte de Receita</strong>.
                </p>
                <p className="mt-1 text-xs text-slate-400">Tiny → Relatórios → Vendas → Relatório de Vendas → adicionar coluna Fonte de Receita</p>
              </div>
            )}
          </div>

          {/* ─── BLOCO 3: CAIXA DO PERÍODO ─── */}
          {(dados.totalRecebido > 0 || dados.totalOriginal > 0) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-[#0b1733]">Caixa do Período</h2>
              <p className="text-xs text-slate-400 mt-1">Base: Relatório de Recebimentos + Pedidos</p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                {[
                  { label: 'Valor Original (NFs)', valor: dados.totalOriginal, cor: 'text-[#0b1733]' },
                  { label: 'Valor Recebido', valor: dados.totalRecebido, cor: 'text-green-600', sub: `Eficiência: ${dados.totalOriginal > 0 ? ((dados.totalRecebido/dados.totalOriginal)*100).toFixed(1) : 0}%` },
                  { label: 'Juros Recebidos', valor: dados.jurosRecebidos, cor: 'text-[#1b4fd6]' },
                  { label: 'Taxas / Descontos', valor: dados.taxasRecebimentos + dados.descontosDados, cor: 'text-red-500' },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-4">
                    <p className="text-xs font-semibold text-slate-500">{k.label}</p>
                    {k.sub && <p className="text-[10px] text-slate-400">{k.sub}</p>}
                    <p className={`mt-1 text-lg font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
                  </div>
                ))}
              </div>
              {dados.porForma.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 mb-3">Recebimentos por Forma de Pagamento</p>
                  <div className="flex flex-wrap gap-3">
                    {dados.porForma.map((f, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                        <p className="text-xs text-slate-500">{f.forma}</p>
                        <p className="font-black text-[#0b1733]">{formatBRL(f.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── BLOCO 4: MARGEM POR CLIENTE ─── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#0b1733]">Margem por Cliente</h2>
              <div className="flex flex-wrap gap-3 items-center">
                <input type="text" placeholder="Buscar cliente ou CNPJ" value={filtroBusca}
                  onChange={e => { setFiltroBusca(e.target.value); setPaginaClientes(1) }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6] w-52" />
                {dados.lucroBruto === 0 && (
                  <span className="text-xs text-orange-500">Importe o relatório com Custo/Lucro para ver as margens</span>
                )}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
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
                          {mp !== 0 ? formatPct(mp) : '—'}
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
              <div className="mt-4 flex items-center justify-between">
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

          {/* ─── BLOCO 5: CUSTOS POR CATEGORIA ─── */}
          {dados.custosPorCat.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-[#0b1733]">Custos e Despesas por Categoria</h2>
              <p className="text-xs text-slate-400 mt-1">Top 15 categorias do balancete (saídas)</p>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={Math.min(420, dados.custosPorCat.length * 30 + 60)}>
                  <BarChart data={dados.custosPorCat} layout="vertical" margin={{ top: 4, right: 80, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="categoria" tick={{ fontSize: 10 }} width={180} />
                    <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                    <Bar dataKey="valor" name="Valor" radius={[0, 4, 4, 0]}>
                      {dados.custosPorCat.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? '#1b4fd6' : '#3b6fe0'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ─── BLOCO 6: MÃO DE OBRA ─── */}
          {Object.keys(dados.maoDeObraMap).length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-[#0b1733]">Custo de Mão de Obra</h2>
              <p className="text-xs text-slate-400 mt-1">Total: <span className="font-bold text-[#0b1733]">{formatBRL(dados.totalMaoDeObra)}</span>
                {' · '}{dados.totalEntradas > 0 ? formatPct((dados.totalMaoDeObra/dados.totalEntradas)*100) : '0%'} das entradas</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                      <th className="pb-2 pr-4">Categoria</th>
                      <th className="pb-2 pr-4 text-right">Valor</th>
                      <th className="pb-2 pr-4 text-right">% das Entradas</th>
                      <th className="pb-2 text-right">% do Total MO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dados.maoDeObraMap).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                      <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-medium">{cat}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{formatBRL(val)}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{dados.totalEntradas > 0 ? formatPct((val/dados.totalEntradas)*100) : '—'}</td>
                        <td className="py-2 text-right text-slate-500">{dados.totalMaoDeObra > 0 ? formatPct((val/dados.totalMaoDeObra)*100) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
