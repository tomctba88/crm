'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, isVencido } from '@/lib/financeiro/formatters'
import StatusBadge from './status-badge'

type Conta = {
  id: string
  numero_documento: string
  fornecedor: string
  historico: string
  valor: number
  saldo: number
  pago: number
  vencimento: string | null
  data_emissao: string | null
  status: string
}

const STATUS_OPTS = ['todos', 'aberto', 'vencido', 'pago', 'parcial']
const POR_PAGINA = 25
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANOS = [2024, 2025, 2026, 2027]

export default function ContasPagarManager() {
  const supabase = createClient()
  const hoje = new Date()
  const [contas, setContas] = useState<Conta[]>([])
  const [kpiTotais, setKpiTotais] = useState<{ valor: number; pago: number; status: string; vencimento: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroInicio, setFiltroInicio] = useState('')
  const [filtroFim, setFiltroFim] = useState('')
  const [mesSel, setMesSel] = useState(0) // 0 = todos
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [ordenarPor, setOrdenarPor] = useState<'vencimento' | 'valor' | 'fornecedor'>('vencimento')
  const [asc, setAsc] = useState(true)
  const [viewMode, setViewMode] = useState<'tabela' | 'categoria'>('tabela')

  const carregar = useCallback(async () => {
    setLoading(true)
    const hojeStr = new Date().toISOString().slice(0, 10)

    // Função auxiliar para aplicar filtros base
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function aplicarFiltros(q: any) {
      if (filtroStatus === 'vencido') q = q.eq('status', 'aberto').lt('vencimento', hojeStr)
      else if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
      if (filtroFornecedor) q = q.ilike('fornecedor', `%${filtroFornecedor}%`)
      if (filtroInicio) q = q.gte('vencimento', filtroInicio)
      if (filtroFim) q = q.lte('vencimento', filtroFim)
      if (mesSel > 0) q = q.eq('mes', mesSel).eq('ano', anoSel)
      return q
    }

    // Query paginada para a tabela
    let qTabela = aplicarFiltros(
      supabase.from('fin_cp_import').select(
        'id,numero_documento,fornecedor,historico,valor,saldo,pago,vencimento,data_emissao,status',
        { count: 'exact' }
      )
    )
    if (viewMode === 'tabela') {
      qTabela = qTabela.order(ordenarPor, { ascending: asc }).range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
    } else {
      qTabela = qTabela.order('historico').order('vencimento')
    }

    // Query sem paginação para calcular KPIs com precisão
    const qKpi = aplicarFiltros(
      supabase.from('fin_cp_import').select('valor,pago,status,vencimento')
    )

    const [{ data, count }, { data: totais }] = await Promise.all([qTabela, qKpi])
    setContas((data ?? []) as Conta[])
    setTotal(count ?? 0)
    setKpiTotais((totais ?? []) as { valor: number; pago: number; status: string; vencimento: string | null }[])
    setLoading(false)
  }, [filtroStatus, filtroFornecedor, filtroInicio, filtroFim, mesSel, anoSel, ordenarPor, asc, pagina, viewMode])

  useEffect(() => { carregar() }, [carregar])

  function toggleOrdem(col: typeof ordenarPor) {
    if (ordenarPor === col) setAsc(!asc)
    else { setOrdenarPor(col); setAsc(true) }
    setPagina(0)
  }

  const hojeStr = new Date().toISOString().slice(0, 10)
  const em7 = new Date(); em7.setDate(em7.getDate() + 7)
  const em7Str = em7.toISOString().slice(0, 10)
  const em30 = new Date(); em30.setDate(em30.getDate() + 30)
  const em30Str = em30.toISOString().slice(0, 10)

  // KPIs calculados de todos os registros (sem paginação)
  const totalAberto = kpiTotais.filter(c => c.status === 'aberto').reduce((s, c) => s + c.valor, 0)
  const totalVencido = kpiTotais.filter(c => isVencido(c.vencimento, c.status)).reduce((s, c) => s + c.valor, 0)
  const totalPago = kpiTotais.filter(c => c.status === 'pago' || c.status === 'parcial').reduce((s, c) => s + c.pago, 0)
  const vence30 = kpiTotais.filter(c => c.status === 'aberto' && c.vencimento && c.vencimento >= hojeStr && c.vencimento <= em30Str).reduce((s, c) => s + c.valor, 0)

  // Agrupamento por historico (aprox. de categoria) para view categoria
  const porHistorico = contas.reduce<Record<string, { total: number; contas: Conta[] }>>((acc, c) => {
    const cat = c.historico?.split(' ')[0] || 'Outros'
    if (!acc[cat]) acc[cat] = { total: 0, contas: [] }
    acc[cat].total += c.valor
    acc[cat].contas.push(c)
    return acc
  }, {})
  const catOrdenadas = Object.entries(porHistorico).sort((a, b) => b[1].total - a[1].total)

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-black text-[#0b1733]">Contas a Pagar</h1>
        <Link href="/financeiro/importacao"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
          Importar Relatório
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Em Aberto', valor: totalAberto, cor: 'text-red-600' },
          { label: 'Vencido', valor: totalVencido, cor: 'text-red-700' },
          { label: 'Pago', valor: totalPago, cor: 'text-slate-700' },
          { label: 'Vence em 30 dias', valor: vence30, cor: 'text-orange-600' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-xs font-semibold text-slate-500">{k.label}</p>
            <p className={`mt-1 text-lg font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
          </div>
        ))}
      </div>

      {/* Filtro mes/ano + filtros adicionais */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Mês de referência:</span>
          <select value={anoSel} onChange={e => { setAnoSel(Number(e.target.value)); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => { setMesSel(0); setPagina(0) }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mesSel === 0 ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Todos
          </button>
          {MESES.map((m, i) => (
            <button key={m} onClick={() => { setMesSel(i + 1); setPagina(0) }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mesSel === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <input type="date" value={filtroInicio} onChange={e => { setFiltroInicio(e.target.value); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          <input type="date" value={filtroFim} onChange={e => { setFiltroFim(e.target.value); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <input value={filtroFornecedor} onChange={e => { setFiltroFornecedor(e.target.value); setPagina(0) }}
            placeholder="Buscar fornecedor..."
            className="flex-1 min-w-36 rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          <button onClick={() => { setFiltroStatus('todos'); setFiltroFornecedor(''); setFiltroInicio(''); setFiltroFim(''); setPagina(0) }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            Limpar
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setViewMode('tabela')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${viewMode === 'tabela' ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Lista
          </button>
          <button onClick={() => setViewMode('categoria')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${viewMode === 'categoria' ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            Por Histórico
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-3xl bg-slate-200" />
      ) : viewMode === 'tabela' ? (
        <>
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-[#f8fafc]">
                <tr>
                  {[
                    { key: null, label: 'Nº Doc' },
                    { key: 'fornecedor', label: 'Fornecedor' },
                    { key: null, label: 'Histórico' },
                    { key: null, label: 'Emissão' },
                    { key: 'vencimento', label: 'Vencimento' },
                    { key: 'valor', label: 'Valor' },
                    { key: null, label: 'Saldo' },
                    { key: null, label: 'Pago' },
                    { key: null, label: 'Status' },
                  ].map(col => (
                    <th key={col.label} onClick={() => col.key && toggleOrdem(col.key as typeof ordenarPor)}
                      className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 ${col.key ? 'cursor-pointer hover:text-[#1b4fd6]' : ''}`}>
                      {col.label} {col.key === ordenarPor ? (asc ? '↑' : '↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contas.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-slate-400">Nenhum registro encontrado.</td></tr>
                ) : contas.map(c => {
                  const vencido = isVencido(c.vencimento, c.status)
                  return (
                    <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 ${vencido ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_documento || '—'}</td>
                      <td className="px-4 py-3 font-medium text-[#0b1733] max-w-[160px] truncate">{c.fornecedor || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate text-xs">{c.historico || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatData(c.data_emissao)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.vencimento ? formatData(c.vencimento) : '—'}
                        {vencido && <span className="ml-1 text-xs text-red-500 font-semibold">vencido</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{formatBRL(c.valor)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{formatBRL(c.saldo)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-semibold">{c.pago > 0 ? formatBRL(c.pago) : '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={vencido ? 'vencido' : c.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{total} registros</span>
              <div className="flex gap-2">
                <button disabled={pagina === 0} onClick={() => setPagina(p => p - 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40 hover:bg-slate-50">Anterior</button>
                <span className="rounded-xl bg-[#eef3fb] px-4 py-2 text-sm font-semibold">{pagina + 1} / {totalPaginas}</span>
                <button disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40 hover:bg-slate-50">Próxima</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {catOrdenadas.map(([cat, { total: catTotal, contas: catContas }]) => (
            <div key={cat} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between bg-[#eef3fb] px-6 py-4">
                <h3 className="font-black text-[#0b1733] text-sm">{cat}</h3>
                <div className="text-right">
                  <span className="text-lg font-black text-red-700">{formatBRL(catTotal)}</span>
                  <span className="ml-2 text-xs text-slate-500">{catContas.length} título(s)</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {catContas.map(c => {
                      const vencido = isVencido(c.vencimento, c.status)
                      return (
                        <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 ${vencido ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3 font-medium text-[#0b1733] max-w-[200px] truncate">{c.fornecedor || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{c.historico || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {c.vencimento ? formatData(c.vencimento) : '—'}
                            {vencido && <span className="ml-1 text-red-500 font-semibold">vencido</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-red-700">{formatBRL(c.valor)}</td>
                          <td className="px-4 py-3"><StatusBadge status={vencido ? 'vencido' : c.status} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {catOrdenadas.length === 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Nenhum registro encontrado.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
