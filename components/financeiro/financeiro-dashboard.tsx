'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, isVencido, diasParaVencer } from '@/lib/financeiro/formatters'
import StatusBadge from './status-badge'
import SincronizarButton from './sincronizar-button'

type ContaReceber = {
  id: string; cliente: string; historico: string; valor: number
  valor_recebido: number; data_vencimento: string | null
  data_recebimento: string | null; status: string; categoria: string
}
type ContaPagar = {
  id: string; fornecedor: string; historico: string; valor: number
  valor_pago: number; data_vencimento: string | null
  data_pagamento: string | null; status: string; categoria: string
}
type VendaItem = { data_venda: string | null; valor_liquido: number; valor_estofaria: number; valor_marcenaria: number }
type FiltroTipo = 'todos' | 'mes' | 'ano' | 'custom'

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)

function mesLabel(iso: string) {
  const d = new Date(iso + '-01T00:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/')
}

export default function FinanceiroDashboard() {
  const [contasReceber, setContasReceber] = useState<ContaReceber[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [vendasRaw, setVendasRaw] = useState<VendaItem[]>([])
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('mes')
  const [filtroAno, setFiltroAno] = useState(ANO_ATUAL)
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1)
  const [customInicio, setCustomInicio] = useState('')
  const [customFim, setCustomFim] = useState('')

  const supabase = createClient()

  const range = useMemo((): { ini: string; fim: string } | null => {
    if (filtroTipo === 'todos') return null
    if (filtroTipo === 'mes') {
      const fim = new Date(filtroAno, filtroMes, 0).toISOString().slice(0, 10)
      return { ini: `${filtroAno}-${String(filtroMes).padStart(2, '0')}-01`, fim }
    }
    if (filtroTipo === 'ano') return { ini: `${filtroAno}-01-01`, fim: `${filtroAno}-12-31` }
    if (filtroTipo === 'custom' && customInicio && customFim) return { ini: customInicio, fim: customFim }
    return null
  }, [filtroTipo, filtroAno, filtroMes, customInicio, customFim])

  const filtroLabel = useMemo(() => {
    if (filtroTipo === 'todos') return 'Todo período'
    if (filtroTipo === 'mes') return `${MESES_ABREV[filtroMes - 1]}/${filtroAno}`
    if (filtroTipo === 'ano') return String(filtroAno)
    if (customInicio && customFim) return `${formatData(customInicio)} → ${formatData(customFim)}`
    return 'Personalizado'
  }, [filtroTipo, filtroAno, filtroMes, customInicio, customFim])

  const kpis = useMemo(() => {
    const inVenc = (d: string | null) => !range || (!!d && d >= range.ini && d <= range.fim)
    const inCaixa = (d: string) => !range || (d >= range.ini && d <= range.fim)
    const hoje = new Date().toISOString().slice(0, 10)
    const em7 = new Date(); em7.setDate(new Date().getDate() + 7)
    const em7Str = em7.toISOString().slice(0, 10)

    const crAberto = contasReceber.filter(r => (r.status === 'aberto' || r.status === 'vencido') && inVenc(r.data_vencimento))
    const cpAberto = contasPagar.filter(r => (r.status === 'aberto' || r.status === 'vencido') && inVenc(r.data_vencimento))

    const recebido = contasReceber
      .filter(r => r.status === 'recebido' && inCaixa(r.data_recebimento ?? ''))
      .reduce((s, r) => s + (r.valor_recebido > 0 ? r.valor_recebido : r.valor), 0)
    const pago = contasPagar
      .filter(r => r.status === 'pago' && inCaixa(r.data_pagamento ?? ''))
      .reduce((s, r) => s + (r.valor_pago > 0 ? r.valor_pago : r.valor), 0)

    const inVenda = (d: string | null) => !range || (!!d && d >= range.ini && d <= range.fim)
    const faturamento = vendasRaw
      .filter(v => inVenda(v.data_venda))
      .reduce((s, v) => s + v.valor_liquido, 0)
    const numVendas = vendasRaw.filter(v => inVenda(v.data_venda)).length
    const ticketMedio = numVendas > 0 ? faturamento / numVendas : 0

    return {
      totalReceber: crAberto.reduce((s, r) => s + r.valor, 0),
      totalPagar: cpAberto.reduce((s, r) => s + r.valor, 0),
      recebido,
      pago,
      vencidosReceber: crAberto.filter(r => isVencido(r.data_vencimento, r.status)).reduce((s, r) => s + r.valor, 0),
      vencidosPagar: cpAberto.filter(r => isVencido(r.data_vencimento, r.status)).reduce((s, r) => s + r.valor, 0),
      vence7Receber: crAberto.filter(r => r.data_vencimento && r.data_vencimento >= hoje && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0),
      vence7Pagar: cpAberto.filter(r => r.data_vencimento && r.data_vencimento >= hoje && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0),
      resultado: recebido - pago,
      faturamento,
      ticketMedio,
      numVendas,
    }
  }, [contasReceber, contasPagar, caixaRaw, vendasRaw, range])

  const charts = useMemo(() => {
    const hoje = new Date()
    const meses: string[] = []
    if (filtroTipo === 'todos') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        meses.push(d.toISOString().slice(0, 7))
      }
    } else if (filtroTipo === 'ano') {
      for (let m = 1; m <= 12; m++) meses.push(`${filtroAno}-${String(m).padStart(2, '0')}`)
    } else if (filtroTipo === 'mes') {
      for (let i = -5; i <= 0; i++) {
        const d = new Date(filtroAno, filtroMes - 1 + i, 1)
        meses.push(d.toISOString().slice(0, 7))
      }
    } else if (filtroTipo === 'custom' && customInicio && customFim) {
      let cur = new Date(customInicio + 'T00:00:00')
      const fim = new Date(customFim + 'T00:00:00')
      while (cur <= fim && meses.length < 24) {
        meses.push(cur.toISOString().slice(0, 7))
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
    }

    // Fluxo de caixa real — agrupa por data_recebimento / data_pagamento
    const fluxoMap: Record<string, { entradas: number; saidas: number }> = {}
    meses.forEach(m => { fluxoMap[m] = { entradas: 0, saidas: 0 } })
    for (const r of contasReceber) {
      if (r.status !== 'recebido' || !r.data_recebimento) continue
      const k = r.data_recebimento.slice(0, 7)
      if (fluxoMap[k]) fluxoMap[k].entradas += r.valor_recebido > 0 ? r.valor_recebido : r.valor
    }
    for (const r of contasPagar) {
      if (r.status !== 'pago' || !r.data_pagamento) continue
      const k = r.data_pagamento.slice(0, 7)
      if (fluxoMap[k]) fluxoMap[k].saidas += r.valor_pago > 0 ? r.valor_pago : r.valor
    }

    // Faturamento por segmento
    const vendasMap: Record<string, { estofaria: number; marcenaria: number }> = {}
    meses.forEach(m => { vendasMap[m] = { estofaria: 0, marcenaria: 0 } })
    for (const v of vendasRaw) {
      if (!v.data_venda) continue
      const k = v.data_venda.slice(0, 7)
      if (vendasMap[k]) {
        vendasMap[k].estofaria += v.valor_estofaria
        vendasMap[k].marcenaria += v.valor_marcenaria
      }
    }

    // Pizza contas a receber por status
    const inVenc = (d: string | null) => !range || (!!d && d >= range.ini && d <= range.fim)
    const crFiltradas = contasReceber.filter(r => r.status === 'aberto' && inVenc(r.data_vencimento))
    let emDia = 0, vencidas = 0
    const hoje2 = new Date().toISOString().slice(0, 10)
    for (const r of crFiltradas) {
      if (r.data_vencimento && r.data_vencimento < hoje2) vencidas += r.valor
      else emDia += r.valor
    }
    const statusPizza = [
      { name: 'Em dia', value: emDia, color: '#1b4fd6' },
      { name: 'Vencido', value: vencidas, color: '#dc2626' },
    ].filter(s => s.value > 0)

    // Próximos vencimentos (30 dias)
    const em30Str = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const hojeStr = new Date().toISOString().slice(0, 10)
    const crOpen = contasReceber.filter(r =>
      r.status === 'aberto' && r.data_vencimento &&
      (filtroTipo === 'todos' ? r.data_vencimento <= em30Str : inVenc(r.data_vencimento))
    )
    const cpOpen = contasPagar.filter(r =>
      r.status === 'aberto' && r.data_vencimento &&
      (filtroTipo === 'todos' ? r.data_vencimento <= em30Str : inVenc(r.data_vencimento))
    )
    const vencimentos = [
      ...crOpen.map(r => ({ ...r, tipo: 'receber' as const, nome: r.cliente })),
      ...cpOpen.map(r => ({ ...r, tipo: 'pagar' as const, nome: r.fornecedor })),
    ].sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 15)

    void hojeStr

    return {
      fluxoMensal: meses.map(k => ({ mes: mesLabel(k), ...fluxoMap[k] })),
      vendasMensal: meses.map(k => ({ mes: mesLabel(k), ...vendasMap[k] })),
      statusPizza,
      vencimentos,
    }
  }, [contasReceber, contasPagar, caixaRaw, vendasRaw, filtroTipo, filtroAno, filtroMes, customInicio, customFim, range])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: receber }, { data: pagar }, { data: vendas }, { data: integ }] = await Promise.all([
        supabase.from('fin_contas_receber').select('id,cliente,historico,valor,valor_recebido,data_vencimento,data_recebimento,status,categoria'),
        supabase.from('fin_contas_pagar').select('id,fornecedor,historico,valor,valor_pago,data_vencimento,data_pagamento,status,categoria'),
        supabase.from('fin_vendas').select('data_venda,valor_liquido,valor_estofaria,valor_marcenaria'),
        supabase.from('integracoes_olist').select('ultimo_sync_em').eq('nome', 'olist_tiny').maybeSingle(),
      ])
      setContasReceber((receber ?? []) as ContaReceber[])
      setContasPagar((pagar ?? []) as ContaPagar[])
      setVendasRaw((vendas ?? []) as VendaItem[])
      setUltimaSync(integ?.ultimo_sync_em ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [])

  const cardKpi = (label: string, valor: number, cor?: string, sub?: string) => (
    <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      <p className={`mt-3 text-2xl font-black ${cor ?? 'text-[#0b1733]'}`}>{formatBRL(valor)}</p>
    </div>
  )

  const btnFiltro = (tipo: FiltroTipo, label: string) => (
    <button
      onClick={() => setFiltroTipo(tipo)}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        filtroTipo === tipo ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Dashboard Financeiro</h1>
        </div>
        <SincronizarButton ultimaSync={ultimaSync} onSucesso={carregar} />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
          {btnFiltro('todos', 'Todos')}
          {btnFiltro('mes', 'Mês')}
          {btnFiltro('ano', 'Ano')}
          {btnFiltro('custom', 'Personalizado')}
        </div>

        {filtroTipo === 'mes' && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]">
              {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex flex-wrap gap-1">
              {MESES_ABREV.map((m, i) => (
                <button key={m} onClick={() => setFiltroMes(i + 1)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    filtroMes === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtroTipo === 'ano' && (
          <div className="flex flex-wrap gap-2">
            {ANOS.map(a => (
              <button key={a} onClick={() => setFiltroAno(a)}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                  filtroAno === a ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {a}
              </button>
            ))}
          </div>
        )}

        {filtroTipo === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500">De:</label>
            <input type="date" value={customInicio} onChange={e => setCustomInicio(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
            <label className="text-xs text-slate-500">Até:</label>
            <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
          </div>
        )}

        {filtroTipo !== 'todos' && (
          <p className="text-xs text-slate-400">
            Exibindo: <span className="font-semibold text-[#1b4fd6]">{filtroLabel}</span>
            <span className="ml-1">· A Receber/Pagar por vencimento · Recebido/Pago por data real do caixa</span>
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-200" />)}
          </div>
          <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
        </div>
      ) : (
        <>
          {/* KPIs linha 1 */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cardKpi('A Receber', kpis.totalReceber, 'text-[#1b4fd6]', 'em aberto por vencimento')}
            {cardKpi('A Pagar', kpis.totalPagar, 'text-red-600', 'em aberto por vencimento')}
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Recebido</p>
                  <p className="text-[10px] text-slate-400">data real do caixa Tiny</p>
                </div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 whitespace-nowrap">{filtroLabel}</span>
              </div>
              <p className="mt-3 text-2xl font-black text-green-600">{formatBRL(kpis.recebido)}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Pago</p>
                  <p className="text-[10px] text-slate-400">data real do caixa Tiny</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 whitespace-nowrap">{filtroLabel}</span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-700">{formatBRL(kpis.pago)}</p>
            </div>
          </div>

          {/* KPIs linha 2 — alertas */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <p className="text-xs font-semibold opacity-80">Vencidos a Receber</p>
              <p className="mt-2 text-lg font-black">{formatBRL(kpis.vencidosReceber)}</p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <p className="text-xs font-semibold opacity-80">Vencidos a Pagar</p>
              <p className="mt-2 text-lg font-black">{formatBRL(kpis.vencidosPagar)}</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-700">
              <p className="text-xs font-semibold opacity-80">Vencem em 7 dias (Receber)</p>
              <p className="mt-2 text-lg font-black">{formatBRL(kpis.vence7Receber)}</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-700">
              <p className="text-xs font-semibold opacity-80">Vencem em 7 dias (Pagar)</p>
              <p className="mt-2 text-lg font-black">{formatBRL(kpis.vence7Pagar)}</p>
            </div>
          </div>

          {/* KPIs linha 3 — indicadores gerenciais */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Faturamento do Período</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(kpis.faturamento)}</p>
              <p className="mt-1 text-[10px] text-slate-400">{kpis.numVendas} pedidos/NFs</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Ticket Médio</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(kpis.ticketMedio)}</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Resultado do Período</p>
              <p className={`mt-3 text-2xl font-black ${kpis.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatBRL(kpis.resultado)}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">Recebido - Pago (caixa real)</p>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black text-[#0b1733]">Fluxo de Caixa Real</h3>
              <p className="text-xs text-slate-400">Entradas e saídas do Caixa Tiny</p>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={charts.fluxoMensal} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="entradas" name="Entradas" fill="#1b4fd6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Saídas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black text-[#0b1733]">Contas a Receber por Status</h3>
              <p className="text-xs text-slate-400">Títulos em aberto no período</p>
              <div className="mt-4">
                {charts.statusPizza.length === 0 ? (
                  <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">Sem dados no período</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={charts.statusPizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {charts.statusPizza.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Faturamento por segmento */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#0b1733]">Faturamento por Segmento</h3>
            <p className="text-xs text-slate-400">Estofaria (cadeiras) vs Marcenaria (móveis) — por mês</p>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.vendasMensal} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="estofaria" name="Estofaria" stackId="a" fill="#1b4fd6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="marcenaria" name="Marcenaria" stackId="a" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Próximos vencimentos */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-[#0b1733]">
                {filtroTipo === 'todos' ? 'Próximos Vencimentos — 30 dias' : `Vencimentos em aberto — ${filtroLabel}`}
              </h3>
              <div className="flex gap-3">
                <a href="/financeiro/contas-receber" className="text-xs font-semibold text-[#1b4fd6] hover:underline">Ver receber</a>
                <a href="/financeiro/contas-pagar" className="text-xs font-semibold text-[#1b4fd6] hover:underline">Ver pagar</a>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              {charts.vencimentos.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum vencimento em aberto no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                      <th className="pb-2 pr-4">Tipo</th>
                      <th className="pb-2 pr-4">Cliente / Fornecedor</th>
                      <th className="pb-2 pr-4">Categoria</th>
                      <th className="pb-2 pr-4">Vencimento</th>
                      <th className="pb-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charts.vencimentos.map((v, i) => {
                      const dias = v.data_vencimento ? diasParaVencer(v.data_vencimento) : null
                      return (
                        <tr key={v.id + i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              v.tipo === 'receber' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {v.tipo === 'receber' ? 'Receber' : 'Pagar'}
                            </span>
                          </td>
                          <td className="py-2 pr-4 font-medium text-[#0b1733] max-w-[160px] truncate">{v.nome || '—'}</td>
                          <td className="py-2 pr-4 text-slate-500 text-xs">{v.categoria || '—'}</td>
                          <td className="py-2 pr-4">
                            <span>{v.data_vencimento ? formatData(v.data_vencimento) : '—'}</span>
                            {dias !== null && dias <= 3 && <span className="ml-1 text-xs text-red-500">({dias}d)</span>}
                          </td>
                          <td className="py-2 text-right font-bold text-[#0b1733]">{formatBRL(v.valor)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
