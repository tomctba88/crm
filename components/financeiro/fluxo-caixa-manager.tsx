'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData } from '@/lib/financeiro/formatters'
import SincronizarButton from './sincronizar-button'

type Lancamento = {
  id: string
  tipo: string
  historico: string
  valor: number
  data_lancamento: string
  categoria: string
  conta_bancaria: string
  documento_referencia: string
}

type ContaAberta = {
  id: string
  historico: string
  valor: number
  data_vencimento: string | null
}

type PeriodoPreset = 'mes' | 'mes_ant' | '3m' | 'ano' | 'custom'

const POR_PAGINA = 30

function rangeForPreset(preset: PeriodoPreset): { ini: string; fim: string } {
  const hoje = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (preset === 'mes') {
    return { ini: fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: fmt(hoje) }
  }
  if (preset === 'mes_ant') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
    return { ini: fmt(ini), fim: fmt(fim) }
  }
  if (preset === '3m') {
    const ini = new Date(hoje); ini.setMonth(hoje.getMonth() - 3)
    return { ini: fmt(ini), fim: fmt(hoje) }
  }
  if (preset === 'ano') {
    return { ini: `${hoje.getFullYear()}-01-01`, fim: fmt(hoje) }
  }
  return { ini: fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: fmt(hoje) }
}

function mesAno(data: string) {
  const d = new Date(data + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/')
}

function semana(data: string) {
  const d = new Date(data + 'T00:00:00')
  const week = Math.ceil(d.getDate() / 7)
  return `S${week} ${d.toLocaleDateString('pt-BR', { month: 'short' })}`
}

export default function FluxoCaixaManager() {
  const supabase = createClient()
  const [preset, setPreset] = useState<PeriodoPreset>('mes')
  const [ini, setIni] = useState(rangeForPreset('mes').ini)
  const [fim, setFim] = useState(rangeForPreset('mes').fim)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [grafico, setGrafico] = useState<{ periodo: string; entradas: number; saidas: number }[]>([])
  const [projecaoReceber, setProjecaoReceber] = useState<ContaAberta[]>([])
  const [projecaoPagar, setProjecaoPagar] = useState<ContaAberta[]>([])
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from('fin_caixa').select('*', { count: 'exact' })
        .gte('data_lancamento', ini).lte('data_lancamento', fim)
        .order('data_lancamento', { ascending: false })
        .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
      if (filtroTipo !== 'todos') query = query.eq('tipo', filtroTipo)

      const [{ data: items, count }, { data: cr }, { data: cp }, { data: integ }] = await Promise.all([
        query,
        supabase.from('fin_contas_receber').select('id,historico,valor,data_vencimento')
          .eq('status', 'aberto').gte('data_vencimento', ini).lte('data_vencimento', fim),
        supabase.from('fin_contas_pagar').select('id,historico,valor,data_vencimento')
          .eq('status', 'aberto').gte('data_vencimento', ini).lte('data_vencimento', fim),
        supabase.from('integracoes_olist').select('ultimo_sync_em').eq('nome', 'olist_tiny').maybeSingle(),
      ])

      setLancamentos((items ?? []) as Lancamento[])
      setTotal(count ?? 0)
      setProjecaoReceber((cr ?? []) as ContaAberta[])
      setProjecaoPagar((cp ?? []) as ContaAberta[])
      setUltimaSync(integ?.ultimo_sync_em ?? null)

      // Gráfico — todos os lançamentos do período sem paginação
      const { data: todos } = await supabase.from('fin_caixa').select('data_lancamento,tipo,valor')
        .gte('data_lancamento', ini).lte('data_lancamento', fim).order('data_lancamento')

      const diasPeriodo = (new Date(fim).getTime() - new Date(ini).getTime()) / (1000 * 60 * 60 * 24)
      const usarSemana = diasPeriodo <= 62

      const map: Record<string, { entradas: number; saidas: number }> = {}
      for (const f of (todos ?? []) as { data_lancamento: string; tipo: string; valor: number }[]) {
        const key = usarSemana ? semana(f.data_lancamento) : mesAno(f.data_lancamento)
        if (!map[key]) map[key] = { entradas: 0, saidas: 0 }
        if (f.tipo === 'entrada') map[key].entradas += f.valor
        else map[key].saidas += f.valor
      }
      setGrafico(Object.entries(map).map(([k, v]) => ({ periodo: k, ...v })))
    } finally {
      setLoading(false)
    }
  }, [ini, fim, pagina, filtroTipo])

  useEffect(() => { carregar() }, [carregar])

  function aplicarPreset(p: PeriodoPreset) {
    setPreset(p)
    if (p !== 'custom') {
      const r = rangeForPreset(p)
      setIni(r.ini)
      setFim(r.fim)
      setPagina(0)
    }
  }

  const totalEntradas = lancamentos.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0)
  const totalSaidas = lancamentos.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0)
  const saldo = totalEntradas - totalSaidas
  const projReceber = projecaoReceber.reduce((s, r) => s + r.valor, 0)
  const projPagar = projecaoPagar.reduce((s, r) => s + r.valor, 0)
  const saldoProj = saldo + projReceber - projPagar
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  const PRESETS: { key: PeriodoPreset; label: string }[] = [
    { key: 'mes', label: 'Este mês' },
    { key: 'mes_ant', label: 'Mês anterior' },
    { key: '3m', label: 'Últimos 3 meses' },
    { key: 'ano', label: 'Este ano' },
    { key: 'custom', label: 'Personalizado' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-black text-[#0b1733]">Fluxo de Caixa</h1>
        <SincronizarButton escopo="caixa" ultimaSync={ultimaSync} onSucesso={carregar} />
      </div>

      {/* Seletor de período */}
      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => aplicarPreset(p.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${preset === p.key ? 'bg-[#1b4fd6] text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex gap-2 items-center ml-2">
            <input type="date" value={ini} onChange={e => { setIni(e.target.value); setPagina(0) }}
              className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
            <span className="text-slate-400 text-sm">até</span>
            <input type="date" value={fim} onChange={e => { setFim(e.target.value); setPagina(0) }}
              className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Entradas', valor: totalEntradas, cor: 'text-green-600' },
          { label: 'Total Saídas', valor: totalSaidas, cor: 'text-red-600' },
          { label: 'Saldo Realizado', valor: saldo, cor: saldo >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Saldo Projetado', valor: saldoProj, cor: saldoProj >= 0 ? 'text-[#1b4fd6]' : 'text-orange-600' },
        ].map(k => (
          <div key={k.label} className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
            <p className="text-sm font-semibold text-slate-500">{k.label}</p>
            <p className={`mt-4 text-2xl font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-[#0b1733]">Entradas vs Saídas</h3>
        <p className="text-xs text-slate-400">Lançamentos reais do Caixa Tiny</p>
        <div className="mt-4">
          {grafico.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
              {loading ? 'Carregando...' : 'Sem dados no período.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={grafico} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                <Legend />
                <Bar dataKey="entradas" name="Entradas" fill="#1b4fd6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tabela de lançamentos */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-6">
          <h3 className="text-xl font-black text-[#0b1733]">Lançamentos</h3>
          <div className="flex gap-2">
            {['todos', 'entrada', 'saida'].map(t => (
              <button key={t} onClick={() => { setFiltroTipo(t); setPagina(0) }}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filtroTipo === t ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {t === 'todos' ? 'Todos' : t === 'entrada' ? 'Entradas' : 'Saídas'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-[#f8fafc]">
                <tr>
                  {['Data', 'Tipo', 'Histórico', 'Categoria', 'Conta Bancária', 'Valor'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lancamentos.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">Nenhum lançamento no período.</td></tr>
                ) : lancamentos.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">{formatData(l.data_lancamento)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {l.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{l.historico || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{l.categoria || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{l.conta_bancaria || '—'}</td>
                    <td className={`px-4 py-3 text-right font-bold ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatBRL(l.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-slate-500">{total} lançamentos</span>
            <div className="flex gap-2">
              <button disabled={pagina === 0} onClick={() => setPagina(p => p - 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40 hover:bg-slate-50">Anterior</button>
              <span className="rounded-xl bg-[#eef3fb] px-4 py-2 text-sm font-semibold">{pagina + 1} / {totalPaginas}</span>
              <button disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40 hover:bg-slate-50">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* Projeção */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-[#0b1733]">Projeção — Títulos em aberto no período</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-700">A receber (em aberto)</p>
            <p className="mt-2 text-xl font-black text-green-700">{formatBRL(projReceber)}</p>
            <p className="mt-1 text-xs text-green-600">{projecaoReceber.length} títulos</p>
          </div>
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">A pagar (em aberto)</p>
            <p className="mt-2 text-xl font-black text-red-700">{formatBRL(projPagar)}</p>
            <p className="mt-1 text-xs text-red-600">{projecaoPagar.length} títulos</p>
          </div>
          <div className={`rounded-2xl p-4 ${saldoProj >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
            <p className={`text-sm font-semibold ${saldoProj >= 0 ? 'text-[#1b4fd6]' : 'text-orange-700'}`}>Saldo projetado</p>
            <p className={`mt-2 text-xl font-black ${saldoProj >= 0 ? 'text-[#1b4fd6]' : 'text-orange-700'}`}>{formatBRL(saldoProj)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
