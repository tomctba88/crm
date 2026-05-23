'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, isVencido, diasParaVencer } from '@/lib/financeiro/formatters'
import SincronizarButton from './sincronizar-button'
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
  totalReceber: number
  totalPagar: number
  recebidoMes: number
  pagoMes: number
  vencidosReceber: number
  vencidosPagar: number
  vence7Receber: number
  vence7Pagar: number
  ultimaSync: string | null
}

function mesAno(data: string) {
  const d = new Date(data + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/')
}

export default function FinanceiroDashboard() {
  const [kpis, setKpis] = useState<KPIs>({
    totalReceber: 0, totalPagar: 0, recebidoMes: 0, pagoMes: 0,
    vencidosReceber: 0, vencidosPagar: 0, vence7Receber: 0, vence7Pagar: 0, ultimaSync: null,
  })
  const [fluxoMensal, setFluxoMensal] = useState<{ mes: string; entradas: number; saidas: number }[]>([])
  const [statusPizza, setStatusPizza] = useState<{ name: string; value: number; color: string }[]>([])
  const [evolucao, setEvolucao] = useState<{ mes: string; recebido: number; pago: number }[]>([])
  const [vencimentos, setVencimentos] = useState<(ContaReceber & { tipoCard: 'receber' } | ContaPagar & { tipoCard: 'pagar' })[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const hoje = new Date()
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
      const em7 = new Date(hoje); em7.setDate(hoje.getDate() + 7)
      const em7Str = em7.toISOString().slice(0, 10)
      const hojeStr = hoje.toISOString().slice(0, 10)

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

      // KPIs
      const totalReceber = cr.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0)
      const totalPagar = cp.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0)
      const recebidoMes = cr.filter(r => r.status === 'recebido' && r.data_recebimento && r.data_recebimento >= inicioMes).reduce((s, r) => s + r.valor, 0)
      const pagoMes = cp.filter(r => r.status === 'pago' && r.data_pagamento && r.data_pagamento >= inicioMes).reduce((s, r) => s + r.valor, 0)
      const vencidosReceber = cr.filter(r => r.data_vencimento && isVencido(r.data_vencimento, r.status)).reduce((s, r) => s + r.valor, 0)
      const vencidosPagar = cp.filter(r => r.data_vencimento && isVencido(r.data_vencimento, r.status)).reduce((s, r) => s + r.valor, 0)
      const vence7Receber = cr.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento >= hojeStr && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0)
      const vence7Pagar = cp.filter(r => r.status === 'aberto' && r.data_vencimento && r.data_vencimento >= hojeStr && r.data_vencimento <= em7Str).reduce((s, r) => s + r.valor, 0)

      setKpis({ totalReceber, totalPagar, recebidoMes, pagoMes, vencidosReceber, vencidosPagar, vence7Receber, vence7Pagar, ultimaSync: integ?.ultimo_sync_em ?? null })

      // Fluxo mensal últimos 6 meses
      const map6: Record<string, { entradas: number; saidas: number }> = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        const key = d.toISOString().slice(0, 7)
        map6[key] = { entradas: 0, saidas: 0 }
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

      // Evolução 12 meses
      const map12: Record<string, { recebido: number; pago: number }> = {}
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        map12[d.toISOString().slice(0, 7)] = { recebido: 0, pago: 0 }
      }
      for (const r of cr) {
        if (r.status === 'recebido' && r.data_recebimento) {
          const k = r.data_recebimento.slice(0, 7)
          if (map12[k]) map12[k].recebido += r.valor
        }
      }
      for (const r of cp) {
        if (r.status === 'pago' && r.data_pagamento) {
          const k = r.data_pagamento.slice(0, 7)
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

  useEffect(() => { carregar() }, [carregar])

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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-200" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Dashboard Financeiro</h1>
          {kpis.ultimaSync && (
            <p className="mt-1 text-xs text-slate-400">
              Última sincronização: {new Date(kpis.ultimaSync).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <SincronizarButton tipo="completo" onSucesso={carregar} />
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cardKpi('Contas a Receber', kpis.totalReceber, 'text-[#1b4fd6]')}
        {cardKpi('Contas a Pagar', kpis.totalPagar, 'text-red-600')}
        {cardKpi('Recebido no Mês', kpis.recebidoMes, 'text-green-600')}
        {cardKpi('Pago no Mês', kpis.pagoMes, 'text-slate-700')}
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
        {/* Fluxo mensal */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-black text-[#0b1733]">Fluxo de Caixa — últimos 6 meses</h3>
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

        {/* Pizza status */}
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
        <h3 className="text-xl font-black text-[#0b1733]">Recebimentos vs Pagamentos — últimos 12 meses</h3>
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
    </div>
  )
}
