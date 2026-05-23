'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, isVencido, diasParaVencer } from '@/lib/financeiro/formatters'
import StatusBadge from './status-badge'

type ContaReceber = {
  id: string; cliente: string; descricao: string; valor: number
  valor_recebido: number; data_vencimento: string | null; data_recebimento: string | null; status: string
}
type ContaPagar = {
  id: string; fornecedor: string; descricao: string; valor: number
  valor_pago: number; data_vencimento: string | null; data_pagamento: string | null; status: string
}
type FluxoItem = { data_lancamento: string; tipo: string; valor: number }
type FiltroTipo = 'todos' | 'mes' | 'ano' | 'custom'
type VencItem = (ContaReceber & { tipoCard: 'receber' }) | (ContaPagar & { tipoCard: 'pagar' })

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)

function mesAno(data: string) {
  const d = new Date(data + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/')
}

export default function FinanceiroDashboard() {
  const [contasReceber, setContasReceber] = useState<ContaReceber[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [fluxoRaw, setFluxoRaw] = useState<FluxoItem[]>([])
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)

  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
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
    if (customInicio && customFim) return `${customInicio.slice(0, 7)} → ${customFim.slice(0, 7)}`
    return 'Personalizado'
  }, [filtroTipo, filtroAno, filtroMes, customInicio, customFim])

  const kpis = useMemo(() => {
    const inR = (d: string | null) => !range || (!!d && d >= range.ini && d <= range.fim)
    const hoje = new Date().toISOString().slice(0, 10)
    const em7 = new Date(); em7.setDate(new Date().getDate() + 7)
    const em7Str = em7.toISOString().slice(0, 10)

    const crP = contasReceber.filter(r => inR(r.data_vencimento))
    const cpP = contasPagar.filter(r => inR(r.data_vencimento))

    return {
      totalReceber: crP.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0),
      totalPagar: cpP.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0),
      recebido: contasReceber.filter(r => r.status === 'recebido' && inR(r.data_recebimento ?? r.data_vencimento)).reduce((s, r) => s + r.valor, 0),
      pago: contasPagar.filter(r => r.status === 'pago' && inR(r.data_pagamento ?? r.data_vencimento)).reduce((s, r) => s + r.valor, 0),
      vencidosReceber: crP.filter(r => isVencido(r.data_vencimento ?? '', r.status)).reduce((s, r) => s + r.valor, 0),
      vencidosPagar: cpP.filter(r => isVencido(r.data_vencimento ?? '', r.status)).reduce((s, r) => s + r.valor, 0),
      vence7Receber: crP.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento >= hoje && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0),
      vence7Pagar: cpP.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento >= hoje && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0),
    }
  }, [contasReceber, contasPagar, range])

  const charts = useMemo(() => {
    const inR = (d: string | null) => !range || (!!d && d >= range.ini && d <= range.fim)
    const hoje = new Date()

    // Meses a mostrar nos gráficos
    const meses: string[] = []
    if (filtroTipo === 'todos') {
      for (let i = 23; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        meses.push(d.toISOString().slice(0, 7))
      }
    } else if (filtroTipo === 'ano') {
      for (let m = 1; m <= 12; m++)
        meses.push(`${filtroAno}-${String(m).padStart(2, '0')}`)
    } else if (filtroTipo === 'mes') {
      for (let i = -5; i <= 6; i++) {
        const d = new Date(filtroAno, filtroMes - 1 + i, 1)
        meses.push(d.toISOString().slice(0, 7))
      }
    } else if (filtroTipo === 'custom' && customInicio && customFim) {
      let cur = new Date(customInicio + 'T00:00:00')
      const fim = new Date(customFim + 'T00:00:00')
      while (cur <= fim && meses.length < 60) {
        meses.push(cur.toISOString().slice(0, 7))
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
    }

    // Fluxo de caixa
    const fluxoMap: Record<string, { entradas: number; saidas: number }> = {}
    meses.forEach(m => { fluxoMap[m] = { entradas: 0, saidas: 0 } })
    for (const f of fluxoRaw) {
      const k = f.data_lancamento.slice(0, 7)
      if (fluxoMap[k]) {
        if (f.tipo === 'entrada') fluxoMap[k].entradas += f.valor
        else fluxoMap[k].saidas += f.valor
      }
    }

    // Evolução recebimentos vs pagamentos
    const evolMap: Record<string, { recebido: number; pago: number }> = {}
    meses.forEach(m => { evolMap[m] = { recebido: 0, pago: 0 } })
    for (const r of contasReceber) {
      if (r.status === 'recebido') {
        const k = (r.data_recebimento ?? r.data_vencimento ?? '').slice(0, 7)
        if (evolMap[k]) evolMap[k].recebido += r.valor
      }
    }
    for (const r of contasPagar) {
      if (r.status === 'pago') {
        const k = (r.data_pagamento ?? r.data_vencimento ?? '').slice(0, 7)
        if (evolMap[k]) evolMap[k].pago += r.valor
      }
    }

    // Pizza status filtrada por período
    const crP = contasReceber.filter(r => inR(r.data_vencimento))
    const stMap = { aberto: 0, recebido: 0, vencido: 0, cancelado: 0 }
    for (const r of crP) {
      const st = isVencido(r.data_vencimento ?? '', r.status) ? 'vencido' : r.status as keyof typeof stMap
      stMap[st as keyof typeof stMap] = (stMap[st as keyof typeof stMap] ?? 0) + r.valor
    }
    const statusPizza = [
      { name: 'Aberto', value: stMap.aberto, color: '#1b4fd6' },
      { name: 'Recebido', value: stMap.recebido, color: '#16a34a' },
      { name: 'Vencido', value: stMap.vencido, color: '#dc2626' },
      { name: 'Cancelado', value: stMap.cancelado, color: '#94a3b8' },
    ].filter(s => s.value > 0)

    // Vencimentos em aberto
    const em30 = new Date(); em30.setDate(em30.getDate() + 30)
    const em30Str = em30.toISOString().slice(0, 10)
    const crOpen = contasReceber.filter(r =>
      r.status === 'aberto' && (filtroTipo === 'todos' ? r.data_vencimento && r.data_vencimento <= em30Str : inR(r.data_vencimento))
    )
    const cpOpen = contasPagar.filter(r =>
      r.status === 'aberto' && (filtroTipo === 'todos' ? r.data_vencimento && r.data_vencimento <= em30Str : inR(r.data_vencimento))
    )
    const vencimentos: VencItem[] = [
      ...crOpen.map(r => ({ ...r, tipoCard: 'receber' as const })),
      ...cpOpen.map(r => ({ ...r, tipoCard: 'pagar' as const })),
    ].sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 20)

    return {
      fluxoMensal: meses.map(k => ({ mes: mesAno(k + '-01'), ...fluxoMap[k] })),
      evolucao: meses.map(k => ({ mes: mesAno(k + '-01'), ...evolMap[k] })),
      statusPizza,
      vencimentos,
    }
  }, [contasReceber, contasPagar, fluxoRaw, filtroTipo, filtroAno, filtroMes, customInicio, customFim, range])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: receber }, { data: pagar }, { data: fluxo }, { data: integ }] = await Promise.all([
        supabase.from('fin_contas_receber').select('*'),
        supabase.from('fin_contas_pagar').select('*'),
        supabase.from('fin_fluxo_caixa').select('data_lancamento,tipo,valor').order('data_lancamento'),
        supabase.from('integracoes_olist').select('ultimo_sync_em').eq('nome', 'olist_tiny').maybeSingle(),
      ])
      setContasReceber((receber ?? []) as ContaReceber[])
      setContasPagar((pagar ?? []) as ContaPagar[])
      setFluxoRaw((fluxo ?? []) as FluxoItem[])
      setUltimaSync(integ?.ultimo_sync_em ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  const sincronizarERecarregar = useCallback(async () => {
    setSincronizando(true)
    try { await fetch('/api/financeiro/sincronizar', { method: 'POST' }) } catch { /* silencia */ }
    finally { setSincronizando(false) }
    await carregar()
  }, [carregar])

  useEffect(() => { carregar() }, [])

  const cardKpi = (label: string, valor: number, cor?: string, sub?: string) => (
    <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      <p className={`mt-3 text-2xl font-black ${cor ?? 'text-[#0b1733]'}`}>{formatBRL(valor)}</p>
    </div>
  )

  const cardAlerta = (label: string, valor: number, cor: string) => (
    <div className={`rounded-2xl p-4 border ${cor}`}>
      <p className="text-xs font-semibold opacity-80">{label}</p>
      <p className="mt-2 text-lg font-black">{formatBRL(valor)}</p>
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
          <p className="mt-1 text-xs text-slate-400">
            {sincronizando ? '⟳ Sincronizando com Tiny...'
              : ultimaSync ? `Última sincronização: ${new Date(ultimaSync).toLocaleString('pt-BR')}`
              : 'Nunca sincronizado'}
          </p>
        </div>
        <button
          onClick={sincronizarERecarregar}
          disabled={sincronizando}
          className="rounded-2xl bg-[#0b1733] px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-[#1b4fd6] disabled:opacity-50"
        >
          {sincronizando ? '⟳ Sincronizando...' : 'Sincronizar com Tiny'}
        </button>
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
            <select
              value={filtroAno}
              onChange={e => setFiltroAno(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
            >
              {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex flex-wrap gap-1">
              {MESES_ABREV.map((m, i) => (
                <button
                  key={m}
                  onClick={() => setFiltroMes(i + 1)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    filtroMes === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtroTipo === 'ano' && (
          <div className="flex flex-wrap gap-2">
            {ANOS.map(a => (
              <button
                key={a}
                onClick={() => setFiltroAno(a)}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                  filtroAno === a ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
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
            <span className="ml-1">· A Receber/Pagar por vencimento · Recebido/Pago por data real</span>
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
      {/* KPIs principais */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cardKpi('A Receber', kpis.totalReceber, 'text-[#1b4fd6]',
          filtroTipo !== 'todos' ? `${filtroLabel} · em aberto` : undefined)}
        {cardKpi('A Pagar', kpis.totalPagar, 'text-red-600',
          filtroTipo !== 'todos' ? `${filtroLabel} · em aberto` : undefined)}

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">Recebido</p>
              {filtroTipo !== 'todos' && <p className="text-[10px] text-slate-400">por data de recebimento</p>}
            </div>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 whitespace-nowrap">
              {filtroLabel}
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-green-600">{formatBRL(kpis.recebido)}</p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">Pago</p>
              {filtroTipo !== 'todos' && <p className="text-[10px] text-slate-400">por data de pagamento</p>}
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 whitespace-nowrap">
              {filtroLabel}
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-700">{formatBRL(kpis.pago)}</p>
        </div>
      </div>

      {/* Alertas */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cardAlerta('Vencidos a Receber', kpis.vencidosReceber, 'border-red-200 bg-red-50 text-red-700')}
        {cardAlerta('Vencidos a Pagar', kpis.vencidosPagar, 'border-red-200 bg-red-50 text-red-700')}
        {cardAlerta('Vencem em 7 dias (Receber)', kpis.vence7Receber, 'border-orange-200 bg-orange-50 text-orange-700')}
        {cardAlerta('Vencem em 7 dias (Pagar)', kpis.vence7Pagar, 'border-orange-200 bg-orange-50 text-orange-700')}
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-black text-[#0b1733]">Fluxo de Caixa por Vencimento</h3>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.fluxoMensal} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
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

      {/* Evolução */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-[#0b1733]">Recebimentos vs Pagamentos</h3>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts.evolucao} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="recebido" name="Recebido" stroke="#1b4fd6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pago" name="Pago" stroke="#dc2626" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vencimentos */}
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
                  <th className="pb-2 pr-4">Descrição</th>
                  <th className="pb-2 pr-4">Vencimento</th>
                  <th className="pb-2 pr-4 text-right">Valor</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {charts.vencimentos.map((v, i) => {
                  const nome = v.tipoCard === 'receber'
                    ? (v as ContaReceber & { tipoCard: 'receber' }).cliente
                    : (v as ContaPagar & { tipoCard: 'pagar' }).fornecedor
                  const dias = v.data_vencimento ? diasParaVencer(v.data_vencimento) : null
                  return (
                    <tr key={v.id + i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          v.tipoCard === 'receber' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {v.tipoCard === 'receber' ? 'Receber' : 'Pagar'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-medium text-[#0b1733]">{nome || '—'}</td>
                      <td className="py-2 pr-4 text-slate-500">{v.descricao || '—'}</td>
                      <td className="py-2 pr-4">
                        <span>{v.data_vencimento ? formatData(v.data_vencimento) : '—'}</span>
                        {dias !== null && dias <= 3 && <span className="ml-1 text-xs text-red-500">({dias}d)</span>}
                      </td>
                      <td className="py-2 pr-4 text-right font-bold text-[#0b1733]">{formatBRL(v.valor)}</td>
                      <td className="py-2"><StatusBadge status={v.status} tipo={v.tipoCard} /></td>
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
