'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, formatPct } from '@/lib/financeiro/formatters'
import { CATEGORIAS_CUSTO, CATEGORIAS_MAO_DE_OBRA } from '@/lib/tiny/categorias'

type CaixaItem = {
  data_lancamento: string; tipo: string; valor: number; categoria: string; historico: string
}
type VendaItem = {
  id: string; numero: string; cliente: string; data_venda: string | null
  valor_total: number; valor_liquido: number; valor_desconto: number
  valor_estofaria: number; valor_marcenaria: number; situacao: string
}
type ItemVenda = {
  venda_id: string; descricao: string; segmento: string
  valor_total: number; custo_total: number; margem_valor: number; margem_percentual: number
}

type FiltroTipo = 'mes' | 'trimestre' | 'ano' | 'custom'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const MES_ATUAL = new Date().getMonth() + 1

function getRange(tipo: FiltroTipo, ano: number, mes: number, custom: { ini: string; fim: string }): { ini: string; fim: string } | null {
  if (tipo === 'mes') {
    const fim = new Date(ano, mes, 0).toISOString().slice(0, 10)
    return { ini: `${ano}-${String(mes).padStart(2, '0')}-01`, fim }
  }
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3)
    const iniM = (q - 1) * 3 + 1
    const fimM = q * 3
    const fim = new Date(ano, fimM, 0).toISOString().slice(0, 10)
    return { ini: `${ano}-${String(iniM).padStart(2, '0')}-01`, fim }
  }
  if (tipo === 'ano') return { ini: `${ano}-01-01`, fim: `${ano}-12-31` }
  if (tipo === 'custom' && custom.ini && custom.fim) return custom
  return null
}

export default function IndicadoresManager() {
  const [caixa, setCaixa] = useState<CaixaItem[]>([])
  const [vendas, setVendas] = useState<VendaItem[]>([])
  const [itensVenda, setItensVenda] = useState<ItemVenda[]>([])
  const [loading, setLoading] = useState(true)

  const [filtro, setFiltro] = useState<FiltroTipo>('mes')
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mes, setMes] = useState(MES_ATUAL)
  const [custom, setCustom] = useState({ ini: '', fim: '' })
  const [paginaPedidos, setPaginaPedidos] = useState(1)
  const [filtroSegmento, setFiltroSegmento] = useState<string>('todos')
  const [filtroMargemMin, setFiltroMargemMin] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')

  const supabase = createClient()

  const range = useMemo(() => getRange(filtro, ano, mes, custom), [filtro, ano, mes, custom])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: cx }, { data: vd }, { data: iv }] = await Promise.all([
        supabase.from('fin_caixa').select('data_lancamento,tipo,valor,categoria,historico').order('data_lancamento'),
        supabase.from('fin_vendas').select('id,numero,cliente,data_venda,valor_total,valor_liquido,valor_desconto,valor_estofaria,valor_marcenaria,situacao'),
        supabase.from('fin_itens_venda').select('venda_id,descricao,segmento,valor_total,custo_total,margem_valor,margem_percentual'),
      ])
      setCaixa((cx ?? []) as CaixaItem[])
      setVendas((vd ?? []) as VendaItem[])
      setItensVenda((iv ?? []) as ItemVenda[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [])

  const inRange = (d: string | null) => !range || (!!d && d >= range.ini && d <= range.fim)

  const dados = useMemo(() => {
    const cx = caixa.filter(c => inRange(c.data_lancamento))
    const vd = vendas.filter(v => inRange(v.data_venda))

    const faturamentoBruto = vd.reduce((s, v) => s + v.valor_total, 0)
    const descontos = vd.reduce((s, v) => s + v.valor_desconto, 0)
    const receitaLiquida = faturamentoBruto - descontos

    const cmv = cx.filter(c => c.tipo === 'saida' && CATEGORIAS_CUSTO.some(cat => c.categoria?.toLowerCase().includes(cat.toLowerCase())))
      .reduce((s, c) => s + c.valor, 0)
    const lucroBruto = receitaLiquida - cmv
    const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0

    const despTrab = cx.filter(c => c.tipo === 'saida' && CATEGORIAS_MAO_DE_OBRA.some(cat => c.categoria?.toLowerCase().includes(cat.toLowerCase())))
      .reduce((s, c) => s + c.valor, 0)
    const despOper = cx.filter(c => c.tipo === 'saida' && !CATEGORIAS_CUSTO.some(cat => c.categoria?.toLowerCase().includes(cat.toLowerCase())) && !CATEGORIAS_MAO_DE_OBRA.some(cat => c.categoria?.toLowerCase().includes(cat.toLowerCase())))
      .reduce((s, c) => s + c.valor, 0)
    const totalEntradas = cx.filter(c => c.tipo === 'entrada').reduce((s, c) => s + c.valor, 0)
    const totalSaidas = cx.filter(c => c.tipo === 'saida').reduce((s, c) => s + c.valor, 0)
    const resultado = totalEntradas - totalSaidas

    // Estofaria
    const vendaIds = new Set(vd.map(v => v.id))
    const itens = itensVenda.filter(i => vendaIds.has(i.venda_id))
    const estofItens = itens.filter(i => i.segmento === 'estofaria')
    const marcItens = itens.filter(i => i.segmento === 'marcenaria')

    const fatEstof = vd.reduce((s, v) => s + v.valor_estofaria, 0)
    const fatMarc = vd.reduce((s, v) => s + v.valor_marcenaria, 0)
    const cmvEstof = estofItens.reduce((s, i) => s + i.custo_total, 0)
    const cmvMarc = marcItens.reduce((s, i) => s + i.custo_total, 0)
    const margemEstof = fatEstof > 0 ? ((fatEstof - cmvEstof) / fatEstof) * 100 : 0
    const margemMarc = fatMarc > 0 ? ((fatMarc - cmvMarc) / fatMarc) * 100 : 0

    const numVendas = vd.length
    const ticketMedio = numVendas > 0 ? receitaLiquida / numVendas : 0
    const ticketEstof = vd.filter(v => v.valor_estofaria > 0).length
    const ticketMarc = vd.filter(v => v.valor_marcenaria > 0).length
    const ticketMedioEstof = ticketEstof > 0 ? fatEstof / ticketEstof : 0
    const ticketMedioMarc = ticketMarc > 0 ? fatMarc / ticketMarc : 0

    const maiorVenda = vd.length > 0 ? vd.reduce((a, b) => a.valor_liquido > b.valor_liquido ? a : b) : null
    const menorVenda = vd.length > 0 ? vd.reduce((a, b) => a.valor_liquido < b.valor_liquido ? a : b) : null

    // Custos por categoria
    const catMap: Record<string, number> = {}
    for (const c of cx.filter(c => c.tipo === 'saida')) {
      const cat = c.categoria || 'Sem categoria'
      catMap[cat] = (catMap[cat] ?? 0) + c.valor
    }
    const custosPorCat = Object.entries(catMap)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)

    // Mão de obra detalhado
    const maoDeObraMap: Record<string, number> = {}
    for (const c of cx.filter(c => c.tipo === 'saida')) {
      if (CATEGORIAS_MAO_DE_OBRA.some(cat => c.categoria?.toLowerCase().includes(cat.toLowerCase()))) {
        maoDeObraMap[c.categoria || 'Outros'] = (maoDeObraMap[c.categoria || 'Outros'] ?? 0) + c.valor
      }
    }
    const totalMaoDeObra = Object.values(maoDeObraMap).reduce((s, v) => s + v, 0)

    return {
      faturamentoBruto, descontos, receitaLiquida, cmv, lucroBruto, margemBruta,
      despTrab, despOper, resultado, totalEntradas, totalSaidas,
      fatEstof, fatMarc, cmvEstof, cmvMarc, margemEstof, margemMarc,
      numVendas, ticketMedio, ticketMedioEstof, ticketMedioMarc,
      pedidosEstof: ticketEstof, pedidosMarc: ticketMarc,
      maiorVenda, menorVenda, custosPorCat: custosPorCat.slice(0, 15), maoDeObraMap, totalMaoDeObra,
      vendasFiltradas: vd,
    }
  }, [caixa, vendas, itensVenda, range])

  const pedidosFiltrados = useMemo(() => {
    const vd = dados.vendasFiltradas
    let r = vd
    if (filtroSegmento !== 'todos') {
      r = r.filter(v => {
        if (filtroSegmento === 'estofaria') return v.valor_estofaria > 0
        if (filtroSegmento === 'marcenaria') return v.valor_marcenaria > 0
        return true
      })
    }
    if (filtroMargemMin) {
      // custo via itens simplificado — usar valor líquido vs total
      const min = Number(filtroMargemMin)
      r = r.filter(v => {
        const custo = itensVenda.filter(i => i.venda_id === v.id).reduce((s, i) => s + i.custo_total, 0)
        const margem = v.valor_liquido > 0 ? ((v.valor_liquido - custo) / v.valor_liquido) * 100 : 0
        return margem >= min
      })
    }
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      r = r.filter(v => v.cliente?.toLowerCase().includes(b) || v.numero?.includes(b))
    }
    return r
  }, [dados.vendasFiltradas, filtroSegmento, filtroMargemMin, filtroBusca, itensVenda])

  const POR_PAGINA = 20
  const totalPaginas = Math.ceil(pedidosFiltrados.length / POR_PAGINA)
  const pedidosPagina = pedidosFiltrados.slice((paginaPedidos - 1) * POR_PAGINA, paginaPedidos * POR_PAGINA)

  const btnFiltro = (tipo: FiltroTipo, label: string) => (
    <button onClick={() => setFiltro(tipo)}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${filtro === tipo ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
      {label}
    </button>
  )

  const dreRow = (label: string, valor: number, pctBase: number, destaque = false, positivo = true) => (
    <tr className={destaque ? 'bg-[#eef3fb] font-black' : ''}>
      <td className="py-2 pr-4 text-sm">{label}</td>
      <td className={`py-2 pr-4 text-right text-sm font-semibold ${valor < 0 || (!positivo && valor > 0) ? 'text-red-600' : 'text-[#0b1733]'}`}>
        {formatBRL(valor)}
      </td>
      <td className="py-2 text-right text-xs text-slate-500">
        {pctBase > 0 ? `${((valor / pctBase) * 100).toFixed(1)}%` : '-'}
      </td>
    </tr>
  )

  function exportarCSV() {
    const cols = ['Nº Pedido', 'Data', 'Cliente', 'Situação', 'Valor Venda', 'Custo', 'Margem R$', 'Margem %']
    const rows = pedidosFiltrados.map(v => {
      const custo = itensVenda.filter(i => i.venda_id === v.id).reduce((s, i) => s + i.custo_total, 0)
      const margemVal = v.valor_liquido - custo
      const margemPct = v.valor_liquido > 0 ? ((margemVal / v.valor_liquido) * 100).toFixed(1) : '0'
      return [v.numero, v.data_venda ?? '', v.cliente, v.situacao, v.valor_liquido.toFixed(2), custo.toFixed(2), margemVal.toFixed(2), margemPct]
    })
    const csv = [cols, ...rows].map(r => r.join(';')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `margem-pedidos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-[#0b1733]">Indicadores Gerenciais</h1>
        <p className="mt-1 text-sm text-slate-500">DRE simplificado · Margens · Custos · Análise por pedido</p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
          {btnFiltro('mes', 'Mês')}
          {btnFiltro('trimestre', 'Trimestre')}
          {btnFiltro('ano', 'Ano')}
          {btnFiltro('custom', 'Personalizado')}
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
        {filtro === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={custom.ini} onChange={e => setCustom(c => ({ ...c, ini: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
            <span className="text-slate-400">→</span>
            <input type="date" value={custom.fim} onChange={e => setCustom(c => ({ ...c, fim: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : (
        <>
          {/* BLOCO 1 — DRE */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#0b1733]">Resultado do Período (DRE Simplificado)</h2>
            <p className="text-xs text-slate-400 mt-1">Base: lançamentos do caixa Tiny + vendas</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-2 pr-4">Descrição</th>
                    <th className="pb-2 pr-4 text-right">Valor</th>
                    <th className="pb-2 text-right">% do Fat.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dreRow('Faturamento Bruto', dados.faturamentoBruto, dados.faturamentoBruto, true)}
                  {dreRow('(-) Descontos', -dados.descontos, dados.faturamentoBruto)}
                  {dreRow('(=) Receita Líquida', dados.receitaLiquida, dados.faturamentoBruto, true)}
                  {dreRow('(-) CMV', -dados.cmv, dados.faturamentoBruto)}
                  {dreRow('(=) Lucro Bruto', dados.lucroBruto, dados.faturamentoBruto, true)}
                  <tr><td className="py-1" colSpan={3}><div className="text-[10px] text-slate-400 font-semibold">Margem Bruta: {formatPct(dados.margemBruta)}</div></td></tr>
                  {dreRow('(-) Despesas Trabalhistas', -dados.despTrab, dados.faturamentoBruto)}
                  {dreRow('(-) Outras Despesas', -dados.despOper, dados.faturamentoBruto)}
                  {dreRow('(=) Resultado Líquido (Caixa)', dados.resultado, dados.faturamentoBruto, true, dados.resultado >= 0)}
                </tbody>
              </table>
            </div>
          </div>

          {/* BLOCO 2 — Margem por segmento */}
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-[#0b1733]">Estofaria (Cadeiras)</h3>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Faturamento</span>
                  <span className="font-bold text-[#0b1733]">{formatBRL(dados.fatEstof)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">CMV (custo dos itens)</span>
                  <span className="font-bold text-red-600">-{formatBRL(dados.cmvEstof)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="font-semibold">Margem Bruta</span>
                  <span className="font-black text-green-600">{formatBRL(dados.fatEstof - dados.cmvEstof)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Margem %</span>
                  <span className={`text-2xl font-black ${dados.margemEstof < 20 ? 'text-red-600' : dados.margemEstof < 35 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatPct(dados.margemEstof)}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{dados.pedidosEstof} pedidos com estofaria</div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-[#0b1733]">Marcenaria (Móveis)</h3>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Faturamento</span>
                  <span className="font-bold text-[#0b1733]">{formatBRL(dados.fatMarc)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">CMV (custo dos itens)</span>
                  <span className="font-bold text-red-600">-{formatBRL(dados.cmvMarc)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="font-semibold">Margem Bruta</span>
                  <span className="font-black text-green-600">{formatBRL(dados.fatMarc - dados.cmvMarc)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Margem %</span>
                  <span className={`text-2xl font-black ${dados.margemMarc < 20 ? 'text-red-600' : dados.margemMarc < 35 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatPct(dados.margemMarc)}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{dados.pedidosMarc} pedidos com marcenaria</div>
              </div>
            </div>
          </div>

          {/* BLOCO 3 — Ticket médio e volume */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Ticket Médio Total</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(dados.ticketMedio)}</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Ticket Médio Estofaria</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(dados.ticketMedioEstof)}</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Ticket Médio Marcenaria</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(dados.ticketMedioMarc)}</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Total de Pedidos</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{dados.numVendas}</p>
            </div>
            {dados.maiorVenda && (
              <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
                <p className="text-xs font-semibold text-slate-500">Maior Pedido</p>
                <p className="mt-2 text-lg font-black text-green-700">{formatBRL(dados.maiorVenda.valor_liquido)}</p>
                <p className="text-xs text-slate-500 truncate">{dados.maiorVenda.cliente}</p>
              </div>
            )}
            {dados.menorVenda && (
              <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
                <p className="text-xs font-semibold text-slate-500">Menor Pedido</p>
                <p className="mt-2 text-lg font-black text-[#0b1733]">{formatBRL(dados.menorVenda.valor_liquido)}</p>
                <p className="text-xs text-slate-500 truncate">{dados.menorVenda.cliente}</p>
              </div>
            )}
          </div>

          {/* BLOCO 4 — Margem por pedido */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#0b1733]">Margem por Pedido</h2>
              <button onClick={exportarCSV}
                className="rounded-xl bg-[#0b1733] px-4 py-2 text-xs font-bold text-white hover:bg-[#1b4fd6] transition">
                Exportar CSV
              </button>
            </div>
            {/* Filtros */}
            <div className="mt-4 flex flex-wrap gap-3">
              <select value={filtroSegmento} onChange={e => setFiltroSegmento(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]">
                <option value="todos">Todos segmentos</option>
                <option value="estofaria">Estofaria</option>
                <option value="marcenaria">Marcenaria</option>
              </select>
              <input type="number" placeholder="Margem mínima %" value={filtroMargemMin}
                onChange={e => setFiltroMargemMin(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
              <input type="text" placeholder="Buscar cliente ou nº pedido" value={filtroBusca}
                onChange={e => setFiltroBusca(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-2 pr-3">Nº</th>
                    <th className="pb-2 pr-3">Data</th>
                    <th className="pb-2 pr-3">Cliente</th>
                    <th className="pb-2 pr-3 text-right">Venda</th>
                    <th className="pb-2 pr-3 text-right">Custo</th>
                    <th className="pb-2 pr-3 text-right">Margem R$</th>
                    <th className="pb-2 pr-3 text-right">Margem %</th>
                    <th className="pb-2">Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosPagina.map(v => {
                    const custo = itensVenda.filter(i => i.venda_id === v.id).reduce((s, i) => s + i.custo_total, 0)
                    const margemVal = v.valor_liquido - custo
                    const margemPct = v.valor_liquido > 0 ? (margemVal / v.valor_liquido) * 100 : 0
                    return (
                      <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 font-mono text-xs text-slate-500">{v.numero}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">{formatData(v.data_venda)}</td>
                        <td className="py-2 pr-3 font-medium text-[#0b1733] max-w-[180px] truncate">{v.cliente || '—'}</td>
                        <td className="py-2 pr-3 text-right">{formatBRL(v.valor_liquido)}</td>
                        <td className="py-2 pr-3 text-right text-slate-500">{formatBRL(custo)}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${margemVal >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(margemVal)}</td>
                        <td className={`py-2 pr-3 text-right font-black ${margemPct < 20 ? 'text-red-600' : margemPct < 35 ? 'text-orange-600' : 'text-green-700'}`}>{formatPct(margemPct)}</td>
                        <td className="py-2 text-xs">
                          {margemPct < 20 ? <span className="text-red-500">Crítica</span>
                            : margemPct < 35 ? <span className="text-orange-500">Baixa</span>
                            : <span className="text-green-600">OK</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {pedidosPagina.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-sm text-slate-400">Sem pedidos no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">{pedidosFiltrados.length} pedidos</span>
                <div className="flex gap-2">
                  <button disabled={paginaPedidos === 1} onClick={() => setPaginaPedidos(p => p - 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Anterior</button>
                  <span className="text-xs text-slate-500 self-center">{paginaPedidos}/{totalPaginas}</span>
                  <button disabled={paginaPedidos === totalPaginas} onClick={() => setPaginaPedidos(p => p + 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Próxima</button>
                </div>
              </div>
            )}
          </div>

          {/* BLOCO 5 — Custos por categoria */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#0b1733]">Análise de Custos por Categoria</h2>
            <p className="text-xs text-slate-400 mt-1">Top 15 categorias por valor pago no período</p>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={dados.custosPorCat} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="categoria" tick={{ fontSize: 10 }} width={180} />
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  <Bar dataKey="valor" name="Valor Pago" radius={[0, 4, 4, 0]}>
                    {dados.custosPorCat.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? '#1b4fd6' : '#3b6fe0'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BLOCO 6 — Mão de obra */}
          {Object.keys(dados.maoDeObraMap).length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-[#0b1733]">Custo de Mão de Obra</h2>
              <p className="text-xs text-slate-400 mt-1">Total: <span className="font-bold text-[#0b1733]">{formatBRL(dados.totalMaoDeObra)}</span></p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                      <th className="pb-2 pr-4">Categoria</th>
                      <th className="pb-2 pr-4 text-right">Valor do Período</th>
                      <th className="pb-2 pr-4 text-right">% da Receita</th>
                      <th className="pb-2 text-right">% do Total MO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dados.maoDeObraMap).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                      <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-medium">{cat}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{formatBRL(val)}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{dados.receitaLiquida > 0 ? formatPct((val / dados.receitaLiquida) * 100) : '-'}</td>
                        <td className="py-2 text-right text-slate-500">{dados.totalMaoDeObra > 0 ? formatPct((val / dados.totalMaoDeObra) * 100) : '-'}</td>
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
