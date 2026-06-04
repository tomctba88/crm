'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL } from '@/lib/financeiro/formatters'

type FluxoItem = {
  tipo: string
  grupo: string
  categoria: string
  periodo_label: string
  data_inicio: string | null
  data_fim: string | null
  valor: number
  mes: number
  ano: number
}

type TituloAberto = {
  id: string
  valor: number
  vencimento: string | null
  historico: string
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANOS = [2024, 2025, 2026, 2027]

export default function FluxoCaixaManager() {
  const supabase = createClient()
  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1)
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [itens, setItens] = useState<FluxoItem[]>([])
  const [titulosReceber, setTitulosReceber] = useState<TituloAberto[]>([])
  const [titulosPagar, setTitulosPagar] = useState<TituloAberto[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'receita' | 'despesa'>('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: fluxo }, { data: cr }, { data: cp }] = await Promise.all([
        supabase.from('fin_fluxo_caixa_import')
          .select('tipo,grupo,categoria,periodo_label,data_inicio,data_fim,valor,mes,ano')
          .eq('mes', mesSel).eq('ano', anoSel)
          .order('data_inicio', { ascending: true }),
        supabase.from('fin_cr_import')
          .select('id,cliente,historico,valor,vencimento')
          .eq('mes', mesSel).eq('ano', anoSel)
          .eq('status', 'aberto'),
        supabase.from('fin_cp_import')
          .select('id,fornecedor,historico,valor,vencimento')
          .eq('mes', mesSel).eq('ano', anoSel)
          .eq('status', 'aberto'),
      ])
      setItens((fluxo ?? []) as FluxoItem[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTitulosReceber((cr ?? []).map((r: any) => ({ id: r.id, valor: r.valor, vencimento: r.vencimento, historico: r.cliente || r.historico })) as TituloAberto[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTitulosPagar((cp ?? []).map((r: any) => ({ id: r.id, valor: r.valor, vencimento: r.vencimento, historico: r.fornecedor || r.historico })) as TituloAberto[])
    } finally {
      setLoading(false)
    }
  }, [mesSel, anoSel])

  useEffect(() => { carregar() }, [carregar])

  const { totalReceitas, totalDespesas, resultado, grafico, porCategoria } = useMemo(() => {
    const totalReceitas = itens.filter(i => i.tipo === 'receita').reduce((s, i) => s + i.valor, 0)
    const totalDespesas = itens.filter(i => i.tipo === 'despesa').reduce((s, i) => s + i.valor, 0)
    const resultado = totalReceitas - totalDespesas

    // Gráfico semanal: agrupa por semana (segunda-feira da semana)
    const getSegunda = (dateStr: string) => {
      const d = new Date(dateStr + 'T00:00:00')
      const dow = d.getDay() // 0=dom,1=seg,...,6=sab
      const diff = dow === 0 ? -6 : 1 - dow
      const seg = new Date(d); seg.setDate(d.getDate() + diff)
      return seg.toISOString().slice(0, 10)
    }
    const periodoMap: Record<string, { entradas: number; saidas: number; label: string }> = {}
    for (const item of itens) {
      if (!item.data_inicio) continue
      const key = getSegunda(item.data_inicio)
      if (!periodoMap[key]) {
        const d = new Date(key + 'T00:00:00')
        periodoMap[key] = {
          entradas: 0, saidas: 0,
          label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        }
      }
      if (item.tipo === 'receita') periodoMap[key].entradas += item.valor
      else periodoMap[key].saidas += item.valor
    }
    const grafico = Object.entries(periodoMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ periodo: v.label, entradas: v.entradas, saidas: v.saidas }))

    // Por categoria
    const filtrados = filtroTipo === 'todos' ? itens : itens.filter(i => i.tipo === filtroTipo)
    const catMap: Record<string, { tipo: string; grupo: string; total: number }> = {}
    for (const item of filtrados) {
      const key = `${item.tipo}||${item.categoria || 'Sem categoria'}`
      if (!catMap[key]) catMap[key] = { tipo: item.tipo, grupo: item.grupo || '', total: 0 }
      catMap[key].total += item.valor
    }
    const porCategoria = Object.entries(catMap)
      .map(([k, v]) => ({ categoria: k.split('||')[1], ...v }))
      .sort((a, b) => b.total - a.total)

    return { totalReceitas, totalDespesas, resultado, grafico, porCategoria }
  }, [itens, filtroTipo])

  const projReceber = titulosReceber.reduce((s, r) => s + r.valor, 0)
  const projPagar = titulosPagar.reduce((s, r) => s + r.valor, 0)
  const semDados = !loading && itens.length === 0
  const periodoLabel = `${MESES[mesSel - 1]}/${anoSel}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-black text-[#0b1733]">Fluxo de Caixa</h1>
        <Link href="/financeiro/importacao"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
          Importar Relatório
        </Link>
      </div>

      {/* Seletor mes/ano */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 mb-3">Período:</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            {MESES.map((m, i) => (
              <button key={m} onClick={() => setMesSel(i + 1)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mesSel === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado importado para {periodoLabel}</p>
          <p className="mt-2 text-sm text-slate-400">Importe o relatório de Fluxo de Caixa do Tiny ERP.</p>
          <Link href="/financeiro/importacao"
            className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <p className="text-sm font-semibold text-slate-500">Total Receitas</p>
              <p className="mt-4 text-2xl font-black text-green-600">{formatBRL(totalReceitas)}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <p className="text-sm font-semibold text-slate-500">Total Despesas</p>
              <p className="mt-4 text-2xl font-black text-red-600">{formatBRL(totalDespesas)}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <p className="text-sm font-semibold text-slate-500">Resultado do Período</p>
              <p className={`mt-4 text-2xl font-black ${resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatBRL(resultado)}</p>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
              <p className="text-sm font-semibold text-slate-500">Saldo Projetado</p>
              <p className={`mt-4 text-2xl font-black ${(resultado + projReceber - projPagar) >= 0 ? 'text-[#1b4fd6]' : 'text-orange-600'}`}>
                {formatBRL(resultado + projReceber - projPagar)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">+ títulos em aberto</p>
            </div>
          </div>

          {/* Gráfico semanal */}
          {grafico.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black text-[#0b1733]">Entradas vs Saídas por Período</h3>
              <p className="text-xs text-slate-400">Semanas do relatório importado — {periodoLabel}</p>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={grafico} margin={{ top: 4, right: 8, left: 8, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                    <Legend verticalAlign="top" />
                    <Bar dataKey="entradas" name="Entradas" fill="#1b4fd6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Saídas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabela por categoria */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-black text-[#0b1733]">Detalhamento por Categoria</h3>
                <p className="text-xs text-slate-400">{periodoLabel}</p>
              </div>
              <div className="flex gap-2">
                {(['todos', 'receita', 'despesa'] as const).map(t => (
                  <button key={t} onClick={() => setFiltroTipo(t)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filtroTipo === t ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {t === 'todos' ? 'Todos' : t === 'receita' ? 'Receitas' : 'Despesas'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f8fafc]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Grupo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Categoria</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {porCategoria.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nenhum dado.</td></tr>
                  ) : porCategoria.map((item, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.tipo === 'receita' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {item.tipo === 'receita' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{item.grupo || '—'}</td>
                      <td className="px-4 py-3 font-medium text-[#0b1733]">{item.categoria}</td>
                      <td className={`px-4 py-3 text-right font-bold ${item.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                        {formatBRL(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Títulos em aberto */}
          {(projReceber > 0 || projPagar > 0) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black text-[#0b1733]">Títulos em Aberto — {periodoLabel}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Contas a receber e pagar com status aberto</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
                  <p className="text-sm font-semibold text-green-700">A Receber (aberto)</p>
                  <p className="mt-2 text-xl font-black text-green-700">{formatBRL(projReceber)}</p>
                  <p className="mt-1 text-xs text-green-600">{titulosReceber.length} título(s)</p>
                </div>
                <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
                  <p className="text-sm font-semibold text-red-700">A Pagar (aberto)</p>
                  <p className="mt-2 text-xl font-black text-red-700">{formatBRL(projPagar)}</p>
                  <p className="mt-1 text-xs text-red-600">{titulosPagar.length} título(s)</p>
                </div>
                <div className={`rounded-2xl border p-4 ${(projReceber - projPagar) >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className={`text-sm font-semibold ${(projReceber - projPagar) >= 0 ? 'text-[#1b4fd6]' : 'text-orange-700'}`}>
                    Saldo Títulos
                  </p>
                  <p className={`mt-2 text-xl font-black ${(projReceber - projPagar) >= 0 ? 'text-[#1b4fd6]' : 'text-orange-700'}`}>
                    {formatBRL(projReceber - projPagar)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
