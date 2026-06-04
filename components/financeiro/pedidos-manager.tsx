'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData } from '@/lib/financeiro/formatters'

type Pedido = {
  id: string
  data_venda: string | null
  numero: string
  valor_total: number
  taxas: number
  tarifas: number
  valor_liquido: number
  forma_recebimento: string
  meio_recebimento: string
  num_parcelas: string
  prazo_medio: number
  situacao: string
  mes: number
  ano: number
}

type Recebimento = {
  id: string
  cliente: string
  juros: number
  taxas: number
  acrescimos: number
  descontos: number
  valor_original: number
  valor_recebido: number
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANOS = [2024, 2025, 2026, 2027]
const CORES = ['#1b4fd6', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899']

export default function PedidosManager() {
  const supabase = createClient()
  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1)
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'pedidos' | 'recebimentos'>('pedidos')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ped }, { data: rec }] = await Promise.all([
        supabase.from('fin_pedidos_import').select('*').eq('mes', mesSel).eq('ano', anoSel).order('data_venda', { ascending: false }),
        supabase.from('fin_recebimentos_import').select('*').eq('mes', mesSel).eq('ano', anoSel).order('valor_recebido', { ascending: false }),
      ])
      setPedidos((ped ?? []) as Pedido[])
      setRecebimentos((rec ?? []) as Recebimento[])
    } finally {
      setLoading(false)
    }
  }, [mesSel, anoSel])

  useEffect(() => { carregar() }, [carregar])

  const analise = useMemo(() => {
    const totalBruto = pedidos.reduce((s, p) => s + p.valor_total, 0)
    const totalLiquido = pedidos.reduce((s, p) => s + p.valor_liquido, 0)
    const totalTaxas = pedidos.reduce((s, p) => s + p.taxas + p.tarifas, 0)
    const ticketMedio = pedidos.length > 0 ? totalBruto / pedidos.length : 0

    // Por forma de pagamento
    const formaMap: Record<string, { total: number; count: number; taxas: number }> = {}
    for (const p of pedidos) {
      const forma = p.forma_recebimento || 'Não informado'
      if (!formaMap[forma]) formaMap[forma] = { total: 0, count: 0, taxas: 0 }
      formaMap[forma].total += p.valor_total
      formaMap[forma].count++
      formaMap[forma].taxas += p.taxas + p.tarifas
    }
    const porForma = Object.entries(formaMap)
      .map(([forma, v]) => ({ forma, ...v }))
      .sort((a, b) => b.total - a.total)

    // Por situação
    const situacaoMap: Record<string, number> = {}
    for (const p of pedidos) {
      const sit = p.situacao || 'Sem status'
      situacaoMap[sit] = (situacaoMap[sit] || 0) + p.valor_total
    }
    const porSituacao = Object.entries(situacaoMap)
      .map(([situacao, total]) => ({ situacao, total }))
      .sort((a, b) => b.total - a.total)

    // Recebimentos
    const totalOriginal = recebimentos.reduce((s, r) => s + r.valor_original, 0)
    const totalRecebido = recebimentos.reduce((s, r) => s + r.valor_recebido, 0)
    const totalJuros = recebimentos.reduce((s, r) => s + r.juros, 0)
    const totalTaxasRec = recebimentos.reduce((s, r) => s + r.taxas, 0)
    const totalDescontos = recebimentos.reduce((s, r) => s + r.descontos, 0)
    const eficiencia = totalOriginal > 0 ? (totalRecebido / totalOriginal) * 100 : 0

    return {
      totalBruto, totalLiquido, totalTaxas, ticketMedio,
      porForma, porSituacao,
      totalOriginal, totalRecebido, totalJuros, totalTaxasRec, totalDescontos, eficiencia,
    }
  }, [pedidos, recebimentos])

  const semDados = !loading && pedidos.length === 0 && recebimentos.length === 0
  const periodoLabel = `${MESES[mesSel - 1]}/${anoSel}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Pedidos & Recebimentos</h1>
          <p className="text-sm text-slate-500 mt-1">Análise de pedidos por forma de pagamento e recebimentos do período</p>
        </div>
        <Link href="/financeiro/importacao"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
          Importar Relatório
        </Link>
      </div>

      {/* Seletor mes/ano */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {MESES.map((m, i) => (
            <button key={m} onClick={() => setMesSel(i + 1)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mesSel === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2">
        {(['pedidos', 'recebimentos'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${aba === a ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {a === 'pedidos' ? `Pedidos/NFs (${pedidos.length})` : `Recebimentos (${recebimentos.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado importado para {periodoLabel}</p>
          <p className="mt-2 text-sm text-slate-400">Importe o Relatório Financeiro de Vendas e o Relatório de Recebimentos.</p>
          <Link href="/financeiro/importacao"
            className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : aba === 'pedidos' ? (
        <>
          {/* KPIs de Pedidos */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Faturamento Bruto', valor: analise.totalBruto, cor: 'text-[#0b1733]' },
              { label: 'Valor Líquido', valor: analise.totalLiquido, cor: 'text-green-600', sub: 'após taxas e tarifas' },
              { label: 'Taxas & Tarifas', valor: analise.totalTaxas, cor: 'text-red-600', sub: 'Mercado Pago, etc.' },
              { label: 'Ticket Médio', valor: analise.ticketMedio, cor: 'text-[#1b4fd6]', sub: `${pedidos.length} pedidos` },
            ].map(k => (
              <div key={k.label} className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                <p className="text-sm font-semibold text-slate-500">{k.label}</p>
                {k.sub && <p className="text-[10px] text-slate-400">{k.sub}</p>}
                <p className={`mt-3 text-2xl font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
              </div>
            ))}
          </div>

          {/* Gráfico por forma de pagamento */}
          {analise.porForma.length > 0 && (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-xl font-black text-[#0b1733]">Por Forma de Pagamento</h3>
                <p className="text-xs text-slate-400">{periodoLabel}</p>
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analise.porForma} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="forma" width={120} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                      <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                        {analise.porForma.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-xl font-black text-[#0b1733]">Resumo por Forma</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500">
                        <th className="pb-2 text-left">Forma</th>
                        <th className="pb-2 text-right">Pedidos</th>
                        <th className="pb-2 text-right">Total</th>
                        <th className="pb-2 text-right">Taxas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analise.porForma.map((f, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 font-medium text-[#0b1733] max-w-[160px]">
                            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: CORES[i % CORES.length] }} />
                            {f.forma}
                          </td>
                          <td className="py-2 text-right text-slate-500">{f.count}</td>
                          <td className="py-2 text-right font-bold">{formatBRL(f.total)}</td>
                          <td className="py-2 text-right text-red-500 text-xs">{f.taxas > 0 ? `-${formatBRL(f.taxas)}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Por situação */}
          {analise.porSituacao.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black text-[#0b1733]">Por Status de Entrega</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                {analise.porSituacao.map((s, i) => (
                  <div key={i} className="rounded-2xl bg-[#eef3fb] px-4 py-3 border border-blue-100">
                    <p className="text-xs font-semibold text-slate-500">{s.situacao}</p>
                    <p className="mt-1 text-lg font-black text-[#0b1733]">{formatBRL(s.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de pedidos */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-6 pb-4">
              <h3 className="text-xl font-black text-[#0b1733]">Lista de Pedidos</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f8fafc]">
                  <tr>
                    {['Data', 'Nº Pedido', 'Forma Pgto', 'Parcelas', 'Prazo Médio', 'Valor Bruto', 'Taxas', 'Valor Líquido', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pedidos.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-400">Nenhum pedido encontrado.</td></tr>
                  ) : pedidos.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{p.data_venda ? formatData(p.data_venda) : '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1b4fd6]">#{p.numero}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[140px] truncate">{p.forma_recebimento || '—'}</td>
                      <td className="px-4 py-3 text-xs text-center text-slate-500">{p.num_parcelas || '—'}</td>
                      <td className="px-4 py-3 text-xs text-center text-slate-500">{p.prazo_medio > 0 ? `${p.prazo_medio}d` : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#0b1733]">{formatBRL(p.valor_total)}</td>
                      <td className="px-4 py-3 text-right text-xs text-red-500">{(p.taxas + p.tarifas) > 0 ? `-${formatBRL(p.taxas + p.tarifas)}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">{formatBRL(p.valor_liquido)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          p.situacao === 'Entregue' ? 'bg-green-100 text-green-700' :
                          p.situacao === 'Enviado' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>{p.situacao || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* KPIs de Recebimentos */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { label: 'Valor Original', valor: analise.totalOriginal, cor: 'text-[#0b1733]', sub: `${recebimentos.length} clientes` },
              { label: 'Valor Recebido', valor: analise.totalRecebido, cor: 'text-green-600', sub: `${analise.eficiencia.toFixed(1)}% de eficiência` },
              { label: 'Diferença', valor: analise.totalOriginal - analise.totalRecebido, cor: 'text-orange-600', sub: 'original - recebido' },
              { label: 'Juros Recebidos', valor: analise.totalJuros, cor: 'text-[#1b4fd6]', sub: 'cobrados do cliente' },
              { label: 'Taxas Cobradas', valor: analise.totalTaxasRec, cor: 'text-red-500', sub: 'descontadas do recebimento' },
              { label: 'Descontos Dados', valor: analise.totalDescontos, cor: 'text-slate-600', sub: 'concedidos aos clientes' },
            ].map(k => (
              <div key={k.label} className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                <p className="text-sm font-semibold text-slate-500">{k.label}</p>
                {k.sub && <p className="text-[10px] text-slate-400">{k.sub}</p>}
                <p className={`mt-3 text-2xl font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
              </div>
            ))}
          </div>

          {/* Tabela de recebimentos */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-6 pb-4">
              <h3 className="text-xl font-black text-[#0b1733]">Recebimentos por Cliente</h3>
              <p className="text-xs text-slate-400">{periodoLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f8fafc]">
                  <tr>
                    {['Cliente', 'Valor Original', 'Recebido', 'Juros', 'Taxas', 'Descontos', 'Diferença'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recebimentos.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">Nenhum recebimento encontrado.</td></tr>
                  ) : recebimentos.map(r => {
                    const diff = r.valor_recebido - r.valor_original
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-[#0b1733] max-w-[220px] truncate">{r.cliente}</td>
                        <td className="px-4 py-3 text-right">{formatBRL(r.valor_original)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatBRL(r.valor_recebido)}</td>
                        <td className="px-4 py-3 text-right text-[#1b4fd6] text-xs">{r.juros > 0 ? `+${formatBRL(r.juros)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-red-500 text-xs">{r.taxas > 0 ? `-${formatBRL(r.taxas)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">{r.descontos > 0 ? `-${formatBRL(r.descontos)}` : '—'}</td>
                        <td className={`px-4 py-3 text-right font-semibold text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {diff !== 0 ? (diff > 0 ? '+' : '') + formatBRL(diff) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
