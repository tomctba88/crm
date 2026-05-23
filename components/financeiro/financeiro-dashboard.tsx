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

type KPIs = {
  totalReceber: number; totalPagar: number
  vencidosReceber: number; vencidosPagar: number
  vence7Receber: number; vence7Pagar: number
  ultimaSync: string | null
}

type Periodo = 'mes' | 'ano' | '2023' | '2024' | '2025' | '2026' | 'tudo' | 'custom'

function mesAno(data: string) {
  const d = new Date(data + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/')
}

function getPeriodoRange(periodo: Periodo, customInicio: string, customFim: string) {
  const hoje = new Date()
  if (periodo === 'mes') return {
    ini: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10),
    fim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
  if (periodo === 'ano') return { ini: `${hoje.getFullYear()}-01-01`, fim: `${hoje.getFullYear()}-12-31` }
  if (['2023', '2024', '2025', '2026'].includes(periodo)) return { ini: `${periodo}-01-01`, fim: `${periodo}-12-31` }
  if (periodo === 'custom' && customInicio && customFim) return { ini: customInicio, fim: customFim }
  return null // tudo
}

function periodoLabel(periodo: Periodo, customInicio: string, customFim: string): string {
  if (periodo === 'mes') return 'Este mês'
  if (periodo === 'ano') return `${new Date().getFullYear()}`
  if (periodo === 'tudo') return 'Todo período'
  if (periodo === 'custom') return customInicio && customFim ? `${customInicio.slice(0, 7)} → ${customFim.slice(0, 7)}` : 'Personalizado'
  return periodo
}

export default function FinanceiroDashboard() {
  const [kpis, setKpis] = useState<KPIs>({
    totalReceber: 0, totalPagar: 0,
    vencidosReceber: 0, vencidosPagar: 0,
    vence7Receber: 0, vence7Pagar: 0, ultimaSync: null,
  })
  const [contasReceber, setContasReceber] = useState<ContaReceber[]>([])
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([])
  const [fluxoMensal, setFluxoMensal] = useState<{ mes: string; entradas: number; saidas: number }[]>([])
  const [statusPizza, setStatusPizza] = useState<{ name: string; value: number; color: string }[]>([])
  const [evolucao, setEvolucao] = useState<{ mes: string; recebido: number; pago: number }[]>([])
  const [vencimentos, setVencimentos] = useState<(ContaReceber & { tipoCard: 'receber' } | ContaPagar & { tipoCard: 'pagar' })[]>([])
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)

  // Filtro de período
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [customInicio, setCustomInicio] = useState('')
  const [customFim, setCustomFim] = useState('')

  const supabase = createClient()

  // Valores filtrados por período (recomputados quando período ou dados mudam)
  // Filtra por data_vencimento: a API Tiny v2 não expõe data de recebimento/pagamento
  // real, então o filtro por período usa a data de vencimento como referência.
  // Para novos pagamentos detectados no sync, data_recebimento/data_pagamento passa
  // a ter a data real — nesse caso ambos os campos ficam no mesmo período.
  const { recebidoFiltrado, pagoFiltrado } = useMemo(() => {
    const range = getPeriodoRange(periodo, customInicio, customFim)
    const recebidoFiltrado = contasReceber
      .filter(r => {
        if (r.status !== 'recebido') return false
        if (!range) return true
        // Usa data_recebimento quando disponível (sync detectou pagamento real),
        // senão usa data_vencimento como referência de competência
        const dataRef = r.data_recebimento ?? r.data_vencimento
        return dataRef && dataRef >= range.ini && dataRef <= range.fim
      })
      .reduce((s, r) => s + r.valor, 0)
    const pagoFiltrado = contasPagar
      .filter(r => {
        if (r.status !== 'pago') return false
        if (!range) return true
        const dataRef = r.data_pagamento ?? r.data_vencimento
        return dataRef && dataRef >= range.ini && dataRef <= range.fim
      })
      .reduce((s, r) => s + r.valor, 0)
    return { recebidoFiltrado, pagoFiltrado }
  }, [contasReceber, contasPagar, periodo, customInicio, customFim])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const hoje = new Date()
      const hojeStr = hoje.toISOString().slice(0, 10)
      const em7 = new Date(hoje); em7.setDate(hoje.getDate() + 7)
      const em7Str = em7.toISOString().slice(0, 10)

      const [
        { data: receber },
        { data: pagar },
        { data: fluxo },
        { data: integ },
      ] = await Promise.all([
        supabase.from('fin_contas_receber').select('*'),
        supabase.from('fin_contas_pagar').select('*'),
        supabase.from('fin_fluxo_caixa').select('data_lancamento,tipo,valor').order('data_lancamento'),
        supabase.from('integracoes_olist').select('ultimo_sync_em').eq('nome', 'olist_tiny').maybeSingle(),
      ])

      const cr = (receber ?? []) as ContaReceber[]
      const cp = (pagar ?? []) as ContaPagar[]
      const fc = (fluxo ?? []) as FluxoItem[]

      setContasReceber(cr)
      setContasPagar(cp)

      // KPIs fixos (independentes do período)
      const totalReceber = cr.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0)
      const totalPagar = cp.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0)
      const vencidosReceber = cr.filter(r => r.data_vencimento && isVencido(r.data_vencimento, r.status)).reduce((s, r) => s + r.valor, 0)
      const vencidosPagar = cp.filter(r => r.data_vencimento && isVencido(r.data_vencimento, r.status)).reduce((s, r) => s + r.valor, 0)
      const vence7Receber = cr.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento >= hojeStr && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0)
      const vence7Pagar = cp.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento >= hojeStr && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0)

      setKpis({ totalReceber, totalPagar, vencidosReceber, vencidosPagar, vence7Receber, vence7Pagar, ultimaSync: integ?.ultimo_sync_em ?? null })

      // Fluxo mensal últimos 24 meses
      const map6: Record<string, { entradas: number; saidas: number }> = {}
      for (let i = 23; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        map6[d.toISOString().slice(0, 7)] = { entradas: 0, saidas: 0 }
      }
      for (const f of fc) {
        const k = f.data_lancamento.slice(0, 7)
        if (map6[k]) {
          if (f.tipo === 'entrada') map6[k].entradas += f.valor
          else map6[k].saidas += f.valor
        }
      }
      setFluxoMensal(Object.entries(map6).map(([k, v]) => ({ mes: mesAno(k + '-01'), ...v })))

      // Pizza status receber
      const stMap = { aberto: 0, recebido: 0, vencido: 0, cancelado: 0 }
      for (const r of cr) {
        const st = isVencido(r.data_vencimento ?? '', r.status) ? 'vencido' : r.status as keyof typeof stMap
        stMap[st as keyof typeof stMap] = (stMap[st as keyof typeof stMap] ?? 0) + r.valor
      }
      setStatusPizza([
        { name: 'Aberto', value: stMap.aberto, color: '#1b4fd6' },
        { name: 'Recebido', value: stMap.recebido, color: '#16a34a' },
        { name: 'Vencido', value: stMap.vencido, color: '#dc2626' },
        { name: 'Cancelado', value: stMap.cancelado, color: '#94a3b8' },
      ].filter(s => s.value > 0))

      // Evolução 24 meses — usa data_vencimento para contas sem data de recebimento real
      const map12: Record<string, { recebido: number; pago: number }> = {}
      for (let i = 23; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        map12[d.toISOString().slice(0, 7)] = { recebido: 0, pago: 0 }
      }
      for (const r of cr) {
        if (r.status === 'recebido') {
          const k = (r.data_recebimento ?? r.data_vencimento ?? '').slice(0, 7)
          if (map12[k]) map12[k].recebido += r.valor
        }
      }
      for (const r of cp) {
        if (r.status === 'pago') {
          const k = (r.data_pagamento ?? r.data_vencimento ?? '').slice(0, 7)
          if (map12[k]) map12[k].pago += r.valor
        }
      }
      setEvolucao(Object.entries(map12).map(([k, v]) => ({ mes: mesAno(k + '-01'), ...v })))

      // Próximos vencimentos 30 dias
      const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30)
      const em30Str = em30.toISOString().slice(0, 10)
      const proxRec = cr.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento <= em30Str).map(r => ({ ...r, tipoCard: 'receber' as const }))
      const proxPag = cp.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento <= em30Str).map(r => ({ ...r, tipoCard: 'pagar' as const }))
      const todos = [...proxRec, ...proxPag].sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 20)
      setVencimentos(todos as typeof vencimentos)
    } finally {
      setLoading(false)
    }
  }, [])

  const sincronizarERecarregar = useCallback(async () => {
    setSincronizando(true)
    try {
      await fetch('/api/financeiro/sincronizar', { method: 'POST' })
    } catch { /* falha silenciosa */ }
    finally { setSincronizando(false) }
    await carregar()
  }, [carregar])

  // Carrega dados ao entrar, SEM sincronizar automaticamente
  useEffect(() => { carregar() }, [])

  const cardKpi = (label: string, valor: number, cor?: string) => (
    <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-4 text-2xl font-black ${cor ?? 'text-[#0b1733]'}`}>{formatBRL(valor)}</p>
    </div>
  )

  const cardAlerta = (label: string, valor: number, cor: string) => (
    <div className={`rounded-2xl p-4 border ${cor}`}>
      <p className="text-xs font-semibold opacity-80">{label}</p>
      <p className="mt-2 text-lg font-black">{formatBRL(valor)}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Dashboard Financeiro</h1>
          <p className="mt-1 text-xs text-slate-400">
            {sincronizando
              ? '⟳ Sincronizando com Tiny...'
              : kpis.ultimaSync
                ? `Última sincronização: ${new Date(kpis.ultimaSync).toLocaleString('pt-BR')}`
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
        {cardKpi('Contas a Receber', kpis.totalReceber, 'text-[#1b4fd6]')}
        {cardKpi('Contas a Pagar', kpis.totalPagar, 'text-red-600')}

        {/* Card Recebido com filtro de período */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">Recebido</p>
              {periodo !== 'tudo' && <p className="text-[10px] text-slate-400">por vencimento</p>}
            </div>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 whitespace-nowrap">
              {periodoLabel(periodo, customInicio, customFim)}
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-green-600">{formatBRL(recebidoFiltrado)}</p>
        </div>

        {/* Card Pago com filtro de período */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">Pago</p>
              {periodo !== 'tudo' && <p className="text-[10px] text-slate-400">por vencimento</p>}
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 whitespace-nowrap">
              {periodoLabel(periodo, customInicio, customFim)}
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-700">{formatBRL(pagoFiltrado)}</p>
        </div>
      </div>

      {/* Seletor de período — menu suspenso */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-slate-500">Período (Recebido / Pago):</label>
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value as Periodo)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b1733] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
        >
          <option value="mes">Este mês</option>
          <option value="ano">{new Date().getFullYear()}</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="tudo">Todo período</option>
          <option value="custom">Personalizado</option>
        </select>
        {periodo === 'custom' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">De:</label>
              <input
                type="date"
                value={customInicio}
                onChange={e => setCustomInicio(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Até:</label>
              <input
                type="date"
                value={customFim}
                onChange={e => setCustomFim(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
              />
            </div>
          </>
        )}
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
          <h3 className="text-xl font-black text-[#0b1733]">Fluxo por Vencimento — últimos 24 meses</h3>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={fluxoMensal} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
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
            {statusPizza.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusPizza} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {statusPizza.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Evolução 12 meses */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-[#0b1733]">Recebimentos vs Pagamentos — últimos 24 meses</h3>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={evolucao} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="recebido" name="Recebido" stroke="#1b4fd6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pago" name="Pago" stroke="#dc2626" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Próximos vencimentos */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-[#0b1733]">Próximos Vencimentos — 30 dias</h3>
          <div className="flex gap-3">
            <a href="/financeiro/contas-receber" className="text-xs font-semibold text-[#1b4fd6] hover:underline">Ver receber</a>
            <a href="/financeiro/contas-pagar" className="text-xs font-semibold text-[#1b4fd6] hover:underline">Ver pagar</a>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          {vencimentos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum vencimento nos próximos 30 dias.</p>
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
                {vencimentos.map((v, i) => {
                  const nome = v.tipoCard === 'receber'
                    ? (v as ContaReceber & { tipoCard: 'receber' }).cliente
                    : (v as ContaPagar & { tipoCard: 'pagar' }).fornecedor
                  const dias = v.data_vencimento ? diasParaVencer(v.data_vencimento) : null
                  return (
                    <tr key={v.id + i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${v.tipoCard === 'receber' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
                      <td className="py-2">
                        <StatusBadge status={v.status} tipo={v.tipoCard} />
                      </td>
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
