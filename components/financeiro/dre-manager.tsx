'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL } from '@/lib/financeiro/formatters'

type Linha = {
  label: string
  valor: number
  valorAnt: number
  nivel: number // 0=resultado, 1=grupo, 2=item
  tipo?: 'positivo' | 'negativo' | 'neutro'
}

type DRE = {
  linhas: Linha[]
  receitaBruta: number
  receitaBrutaAnt: number
  resultadoLiquido: number
  resultadoLiquidoAnt: number
  despesasPorCategoria: { nome: string; valor: number }[]
}

function agruparPorCategoria(items: { categoria: string; valor: number }[]) {
  const map: Record<string, number> = {}
  for (const item of items) {
    const key = item.categoria || 'Sem categoria'
    map[key] = (map[key] ?? 0) + item.valor
  }
  return Object.entries(map).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor)
}

function pct(valor: number, base: number): string {
  if (!base) return '—'
  return `${((valor / base) * 100).toFixed(1)}%`
}

export default function DREManager() {
  const supabase = createClient()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [dre, setDre] = useState<DRE | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)

    const mesAnt = mes === 1 ? 12 : mes - 1
    const anoAnt = mes === 1 ? ano - 1 : ano

    const [{ data: bal }, { data: balAnt }] = await Promise.all([
      supabase.from('fin_balancete').select('tipo,grupo,categoria,valor').eq('mes', mes).eq('ano', ano),
      supabase.from('fin_balancete').select('tipo,grupo,categoria,valor').eq('mes', mesAnt).eq('ano', anoAnt),
    ])

    const balancete = (bal ?? []) as { tipo: string; grupo: string; categoria: string; valor: number }[]
    const balanceteAnt = (balAnt ?? []) as { tipo: string; grupo: string; categoria: string; valor: number }[]

    const receitas = balancete.filter(b => b.tipo === 'entrada').map(b => ({ valor: b.valor, categoria: b.categoria }))
    const despesas = balancete.filter(b => b.tipo === 'saida').map(b => ({ valor: b.valor, categoria: b.categoria }))
    const receitasAnt = balanceteAnt.filter(b => b.tipo === 'entrada').map(b => ({ valor: b.valor, categoria: b.categoria }))
    const despesasAnt = balanceteAnt.filter(b => b.tipo === 'saida').map(b => ({ valor: b.valor, categoria: b.categoria }))

    const receitaBruta = receitas.reduce((s, r) => s + r.valor, 0)
    const receitaBrutaAnt = receitasAnt.reduce((s, r) => s + r.valor, 0)
    const totalDespesas = despesas.reduce((s, r) => s + r.valor, 0)
    const totalDespesasAnt = despesasAnt.reduce((s, r) => s + r.valor, 0)
    const resultadoLiquido = receitaBruta - totalDespesas
    const resultadoLiquidoAnt = receitaBrutaAnt - totalDespesasAnt

    const despesasPorCategoria = agruparPorCategoria(despesas)

    const linhas: Linha[] = [
      { label: '(+) RECEITA BRUTA', valor: receitaBruta, valorAnt: receitaBrutaAnt, nivel: 0, tipo: 'positivo' },
      ...agruparPorCategoria(receitas).map(r => ({ label: `     ${r.nome}`, valor: r.valor, valorAnt: receitasAnt.filter(x => x.categoria === r.nome).reduce((s, x) => s + x.valor, 0), nivel: 2 })),
      { label: '(-) TOTAL DE DESPESAS', valor: totalDespesas, valorAnt: totalDespesasAnt, nivel: 0, tipo: 'negativo' },
      ...despesasPorCategoria.map(d => ({ label: `     ${d.nome}`, valor: d.valor, valorAnt: despesasAnt.filter(x => x.categoria === d.nome).reduce((s, x) => s + x.valor, 0), nivel: 2 })),
      { label: '(=) RESULTADO LÍQUIDO', valor: resultadoLiquido, valorAnt: resultadoLiquidoAnt, nivel: 0, tipo: resultadoLiquido >= 0 ? 'positivo' : 'negativo' },
    ]

    setDre({ linhas, receitaBruta, receitaBrutaAnt, resultadoLiquido, resultadoLiquidoAnt, despesasPorCategoria })
    setLoading(false)
  }, [ano, mes])

  useEffect(() => { carregar() }, [carregar])

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const ANOS = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-black text-[#0b1733]">DRE — Demonstrativo de Resultados</h1>
        <div className="flex gap-2">
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={e => setAno(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Receita Bruta', valor: dre?.receitaBruta ?? 0, cor: 'text-[#1b4fd6]' },
          { label: 'Receita (mês ant.)', valor: dre?.receitaBrutaAnt ?? 0, cor: 'text-slate-500' },
          { label: 'Resultado Líquido', valor: dre?.resultadoLiquido ?? 0, cor: (dre?.resultadoLiquido ?? 0) >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Resultado (mês ant.)', valor: dre?.resultadoLiquidoAnt ?? 0, cor: 'text-slate-500' },
        ].map(k => (
          <div key={k.label} className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
            <p className="text-sm font-semibold text-slate-500">{k.label}</p>
            <p className={`mt-4 text-2xl font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
          </div>
        ))}
      </div>

      {/* Tabela DRE */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="p-6">
          <h3 className="text-xl font-black text-[#0b1733]">
            Demonstrativo — {MESES[mes - 1]}/{ano}
          </h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-[#f8fafc]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">Descrição</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500">
                    {MESES[mes - 1]}/{ano}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500">
                    {MESES[(mes === 1 ? 12 : mes - 1) - 1]}/{mes === 1 ? ano - 1 : ano}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500">% Receita</th>
                </tr>
              </thead>
              <tbody>
                {(dre?.linhas ?? []).map((linha, i) => {
                  const isResultado = linha.nivel === 0
                  const isPositivo = linha.tipo === 'positivo'
                  const isNegativo = linha.tipo === 'negativo'
                  return (
                    <tr key={i} className={`border-b border-slate-50 ${isResultado ? 'bg-[#eef3fb]' : 'hover:bg-slate-50'}`}>
                      <td className={`px-6 py-3 ${isResultado ? 'font-black text-[#0b1733]' : 'font-medium text-slate-600'}`}>
                        {linha.label}
                      </td>
                      <td className={`px-6 py-3 text-right tabular-nums ${isResultado ? 'font-black' : 'font-semibold'} ${isPositivo ? 'text-green-600' : isNegativo ? 'text-red-600' : 'text-slate-600'}`}>
                        {formatBRL(linha.valor)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-400">
                        {formatBRL(linha.valorAnt)}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-400 text-xs">
                        {isResultado ? pct(linha.valor, dre?.receitaBruta ?? 0) : pct(linha.valor, dre?.receitaBruta ?? 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Gráfico despesas por categoria */}
      {dre && dre.despesasPorCategoria.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-black text-[#0b1733]">Despesas por Categoria</h3>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={Math.max(200, dre.despesasPorCategoria.length * 40)}>
              <BarChart
                layout="vertical"
                data={dre.despesasPorCategoria}
                margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                <Bar dataKey="valor" name="Despesa" fill="#dc2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
