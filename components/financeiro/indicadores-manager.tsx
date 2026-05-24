'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatPct } from '@/lib/financeiro/formatters'
import { CATEGORIAS_CUSTO, CATEGORIAS_MAO_DE_OBRA } from '@/lib/tiny/categorias'

type BalanceteItem = {
  tipo: string; grupo: string; categoria: string; valor: number
}
type VendaImportItem = {
  cliente: string; cnpj_cpf: string; valor: number; frete: number
  custo: number; valor_lucro: number; percentual_lucro: number; total: number
}

type FiltroTipo = 'mes' | 'trimestre' | 'ano'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const MES_ATUAL = new Date().getMonth() + 1

function getMesesAno(tipo: FiltroTipo, ano: number, mes: number): number[] {
  if (tipo === 'mes') return [mes]
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3)
    const ini = (q - 1) * 3 + 1
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
  const [vendasImport, setVendasImport] = useState<VendaImportItem[]>([])
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
    const [{ data: bal }, { data: vd }] = await Promise.all([
      supabase.from('fin_balancete').select('tipo,grupo,categoria,valor').eq('ano', ano).in('mes', meses),
      supabase.from('fin_vendas_import').select('cliente,cnpj_cpf,valor,frete,custo,valor_lucro,percentual_lucro,total').eq('ano', ano).in('mes', meses),
    ])
    setBalancete((bal ?? []) as BalanceteItem[])
    setVendasImport((vd ?? []) as VendaImportItem[])
    setPaginaClientes(1)
    setLoading(false)
  }, [filtro, ano, mes])

  useEffect(() => { carregar() }, [carregar])

  const dados = useMemo(() => {
    const bal = balancete
    const vd = vendasImport

    const totalEntradas = bal.filter(b => b.tipo === 'entrada').reduce((s, b) => s + b.valor, 0)
    const totalSaidas = bal.filter(b => b.tipo === 'saida').reduce((s, b) => s + b.valor, 0)
    const resultado = totalEntradas - totalSaidas

    const faturamentoBruto = vd.reduce((s, v) => s + v.valor, 0)
    const cmv = bal.filter(b => b.tipo === 'saida' && matchesCat(b.categoria, CATEGORIAS_CUSTO)).reduce((s, b) => s + b.valor, 0)
    const lucroBruto = vd.reduce((s, v) => s + v.valor_lucro, 0)
    const margemBruta = faturamentoBruto > 0 ? (lucroBruto / faturamentoBruto) * 100 : 0

    const despTrab = bal.filter(b => b.tipo === 'saida' && matchesCat(b.categoria, CATEGORIAS_MAO_DE_OBRA)).reduce((s, b) => s + b.valor, 0)
    const despOper = bal.filter(b => b.tipo === 'saida' && !matchesCat(b.categoria, CATEGORIAS_CUSTO) && !matchesCat(b.categoria, CATEGORIAS_MAO_DE_OBRA)).reduce((s, b) => s + b.valor, 0)

    const numClientes = vd.length
    const ticketMedio = numClientes > 0 ? faturamentoBruto / numClientes : 0
    const maiorCliente = vd.length > 0 ? vd.reduce((a, b) => a.valor > b.valor ? a : b) : null
    const menorCliente = vd.length > 0 ? vd.reduce((a, b) => a.valor < b.valor ? a : b) : null

    const catMap: Record<string, number> = {}
    for (const b of bal.filter(b => b.tipo === 'saida')) {
      catMap[b.categoria || 'Sem categoria'] = (catMap[b.categoria || 'Sem categoria'] ?? 0) + b.valor
    }
    const custosPorCat = Object.entries(catMap)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)

    const maoDeObraMap: Record<string, number> = {}
    for (const b of bal.filter(b => b.tipo === 'saida')) {
      if (matchesCat(b.categoria, CATEGORIAS_MAO_DE_OBRA)) {
        maoDeObraMap[b.categoria || 'Outros'] = (maoDeObraMap[b.categoria || 'Outros'] ?? 0) + b.valor
      }
    }
    const totalMaoDeObra = Object.values(maoDeObraMap).reduce((s, v) => s + v, 0)

    return {
      faturamentoBruto, cmv, lucroBruto, margemBruta,
      despTrab, despOper, resultado, totalEntradas, totalSaidas,
      numClientes, ticketMedio, maiorCliente, menorCliente,
      custosPorCat: custosPorCat.slice(0, 15), maoDeObraMap, totalMaoDeObra,
    }
  }, [balancete, vendasImport])

  const clientesFiltrados = useMemo(() => {
    let r = [...vendasImport].sort((a, b) => b.valor - a.valor)
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      r = r.filter(v => v.cliente?.toLowerCase().includes(b) || v.cnpj_cpf?.includes(b))
    }
    return r
  }, [vendasImport, filtroBusca])

  const POR_PAGINA = 20
  const totalPaginas = Math.ceil(clientesFiltrados.length / POR_PAGINA)
  const clientesPagina = clientesFiltrados.slice((paginaClientes - 1) * POR_PAGINA, paginaClientes * POR_PAGINA)

  const semDados = !loading && balancete.length === 0 && vendasImport.length === 0

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
    const cols = ['Cliente', 'CNPJ/CPF', 'Faturamento', 'Custo', 'Lucro R$', 'Margem %']
    const rows = clientesFiltrados.map(v => [
      v.cliente, v.cnpj_cpf, v.valor.toFixed(2), v.custo.toFixed(2),
      v.valor_lucro.toFixed(2), v.percentual_lucro.toFixed(1),
    ])
    const csv = [cols, ...rows].map(r => r.join(';')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `margem-clientes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const periodoLabel = filtro === 'mes'
    ? `${MESES[mes - 1]}/${ano}`
    : filtro === 'trimestre'
      ? `T${Math.ceil(mes / 3)}/${ano}`
      : `${ano}`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-[#0b1733]">Indicadores Gerenciais</h1>
        <p className="mt-1 text-sm text-slate-500">DRE simplificado · Margens · Custos · Análise por cliente</p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
          {btnFiltro('mes', 'Mês')}
          {btnFiltro('trimestre', 'Trimestre')}
          {btnFiltro('ano', 'Ano')}
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
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado importado para {periodoLabel}</p>
          <p className="mt-2 text-sm text-slate-400">Importe os relatórios do Tiny ERP para visualizar os indicadores.</p>
          <Link href="/financeiro/importacao"
            className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Base: relatórios importados do Tiny ERP ·{' '}
            <span className="font-semibold text-[#1b4fd6]">{periodoLabel}</span>
            {' '}·{' '}
            <Link href="/financeiro/importacao" className="underline hover:text-[#1b4fd6]">Reimportar</Link>
          </p>

          {/* BLOCO 1 — DRE */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#0b1733]">Resultado do Período (DRE Simplificado)</h2>
            <p className="text-xs text-slate-400 mt-1">Base: balancete importado do Tiny</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-2 pr-4">Descrição</th>
                    <th className="pb-2 pr-4 text-right">Valor</th>
                    <th className="pb-2 text-right">% das Entradas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dreRow('Total de Entradas', dados.totalEntradas, dados.totalEntradas, true)}
                  {dreRow('(-) CMV', -dados.cmv, dados.totalEntradas)}
                  {dreRow('(=) Lucro Bruto', dados.totalEntradas - dados.cmv, dados.totalEntradas, true)}
                  <tr><td className="py-1" colSpan={3}><div className="text-[10px] text-slate-400 font-semibold">Margem Bruta (vendas): {formatPct(dados.margemBruta)}</div></td></tr>
                  {dreRow('(-) Despesas Trabalhistas', -dados.despTrab, dados.totalEntradas)}
                  {dreRow('(-) Outras Despesas', -dados.despOper, dados.totalEntradas)}
                  {dreRow('(=) Resultado Líquido', dados.resultado, dados.totalEntradas, true, dados.resultado >= 0)}
                </tbody>
              </table>
            </div>
          </div>

          {/* BLOCO 2 — KPIs de vendas */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Faturamento (Vendas)</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(dados.faturamentoBruto)}</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Lucro Bruto (Vendas)</p>
              <p className="mt-3 text-2xl font-black text-green-700">{formatBRL(dados.lucroBruto)}</p>
              <p className="text-xs text-slate-400 mt-1">Margem: {formatPct(dados.margemBruta)}</p>
            </div>
            <div className="rounded-3xl bg-[#eef3fb] p-6 border border-blue-100">
              <p className="text-xs font-semibold text-slate-500">Ticket Médio por Cliente</p>
              <p className="mt-3 text-2xl font-black text-[#0b1733]">{formatBRL(dados.ticketMedio)}</p>
              <p className="text-xs text-slate-400 mt-1">{dados.numClientes} clientes</p>
            </div>
            <div className={`rounded-3xl p-6 border ${dados.resultado >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-xs font-semibold text-slate-500">Resultado Caixa</p>
              <p className={`mt-3 text-2xl font-black ${dados.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatBRL(dados.resultado)}</p>
            </div>
          </div>

          {/* BLOCO 3 — Margem por cliente */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#0b1733]">Margem por Cliente</h2>
              <button onClick={exportarCSV}
                className="rounded-xl bg-[#0b1733] px-4 py-2 text-xs font-bold text-white hover:bg-[#1b4fd6] transition">
                Exportar CSV
              </button>
            </div>
            <div className="mt-4">
              <input type="text" placeholder="Buscar cliente ou CNPJ" value={filtroBusca}
                onChange={e => { setFiltroBusca(e.target.value); setPaginaClientes(1) }}
                className="w-full max-w-sm rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]" />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-2 pr-3">Cliente</th>
                    <th className="pb-2 pr-3 text-right">Faturamento</th>
                    <th className="pb-2 pr-3 text-right">Custo</th>
                    <th className="pb-2 pr-3 text-right">Lucro R$</th>
                    <th className="pb-2 text-right">Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesPagina.map((v, i) => {
                    const mp = v.valor > 0 ? (v.valor_lucro / v.valor) * 100 : 0
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-3 font-medium text-[#0b1733] max-w-[220px]">
                          <p className="truncate">{v.cliente || '—'}</p>
                          {v.cnpj_cpf && <p className="text-[10px] text-slate-400 font-mono">{v.cnpj_cpf}</p>}
                        </td>
                        <td className="py-2 pr-3 text-right">{formatBRL(v.valor)}</td>
                        <td className="py-2 pr-3 text-right text-slate-500">{formatBRL(v.custo)}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${v.valor_lucro >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(v.valor_lucro)}</td>
                        <td className={`py-2 text-right font-black ${mp < 20 ? 'text-red-600' : mp < 35 ? 'text-orange-600' : 'text-green-700'}`}>{formatPct(mp)}</td>
                      </tr>
                    )
                  })}
                  {clientesPagina.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">Sem clientes encontrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPaginas > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">{clientesFiltrados.length} clientes</span>
                <div className="flex gap-2">
                  <button disabled={paginaClientes === 1} onClick={() => setPaginaClientes(p => p - 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Anterior</button>
                  <span className="text-xs text-slate-500 self-center">{paginaClientes}/{totalPaginas}</span>
                  <button disabled={paginaClientes === totalPaginas} onClick={() => setPaginaClientes(p => p + 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Próxima</button>
                </div>
              </div>
            )}
          </div>

          {/* BLOCO 4 — Custos por categoria */}
          {dados.custosPorCat.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-[#0b1733]">Análise de Custos por Categoria</h2>
              <p className="text-xs text-slate-400 mt-1">Top 15 categorias do balancete (saídas)</p>
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={dados.custosPorCat} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
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

          {/* BLOCO 5 — Mão de obra */}
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
                      <th className="pb-2 pr-4 text-right">% das Entradas</th>
                      <th className="pb-2 text-right">% do Total MO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dados.maoDeObraMap).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                      <tr key={cat} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-medium">{cat}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{formatBRL(val)}</td>
                        <td className="py-2 pr-4 text-right text-slate-500">{dados.totalEntradas > 0 ? formatPct((val / dados.totalEntradas) * 100) : '-'}</td>
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
