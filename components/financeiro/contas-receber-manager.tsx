'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, isVencido } from '@/lib/financeiro/formatters'
import StatusBadge from './status-badge'

type Conta = {
  id: string
  numero_banco: string
  numero_documento: string
  cliente: string
  historico: string
  valor: number
  saldo: number
  recebido: number
  vencimento: string | null
  data_emissao: string | null
  status: string
}

const STATUS_OPTS = ['todos', 'aberto', 'vencido', 'recebido', 'parcial']
const POR_PAGINA = 25
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANOS = [2024, 2025, 2026, 2027]

export default function ContasReceberManager() {
  const supabase = createClient()
  const hoje = new Date()
  const [contas, setContas] = useState<Conta[]>([])
  const [kpiTotais, setKpiTotais] = useState<{ valor: number; saldo: number; recebido: number; status: string; vencimento: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroInicio, setFiltroInicio] = useState('')
  const [filtroFim, setFiltroFim] = useState('')
  const [mesSel, setMesSel] = useState(0) // 0 = todos
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [ordenarPor, setOrdenarPor] = useState<'vencimento' | 'valor' | 'cliente'>('vencimento')
  const [asc, setAsc] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const hojeStr = new Date().toISOString().slice(0, 10)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function aplicarFiltros(q: any) {
      if (filtroStatus === 'vencido') q = q.eq('status', 'aberto').lt('vencimento', hojeStr)
      else if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
      if (filtroCliente) q = q.ilike('cliente', `%${filtroCliente}%`)
      if (filtroInicio) q = q.gte('vencimento', filtroInicio)
      if (filtroFim) q = q.lte('vencimento', filtroFim)
      if (mesSel > 0) q = q.eq('mes', mesSel).eq('ano', anoSel)
      return q
    }

    const qTabela = aplicarFiltros(
      supabase.from('fin_cr_import').select(
        'id,numero_banco,numero_documento,cliente,historico,valor,saldo,recebido,vencimento,data_emissao,status',
        { count: 'exact' }
      )
    ).order(ordenarPor, { ascending: asc }).range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)

    const qKpi = aplicarFiltros(
      supabase.from('fin_cr_import').select('valor,saldo,recebido,status,vencimento')
    )

    const [{ data, count }, { data: totais }] = await Promise.all([qTabela, qKpi])
    setContas((data ?? []) as Conta[])
    setTotal(count ?? 0)
    setKpiTotais((totais ?? []) as { valor: number; saldo: number; recebido: number; status: string; vencimento: string | null }[])
    setLoading(false)
  }, [filtroStatus, filtroCliente, filtroInicio, filtroFim, mesSel, anoSel, ordenarPor, asc, pagina])

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
  // "Em aberto/vencido" usa SALDO (o que falta receber) e ignora títulos fantasma
  // (saldo 0) e placeholders de R$0,01.
  const emAberto = (c: { status: string; saldo: number; valor: number }) =>
    c.status === 'aberto' && c.saldo >= 0.01 && c.valor >= 1
  const totalAberto = kpiTotais.filter(emAberto).reduce((s, c) => s + c.saldo, 0)
  const totalVencido = kpiTotais.filter(c => emAberto(c) && isVencido(c.vencimento, c.status)).reduce((s, c) => s + c.saldo, 0)
  const totalRecebido = kpiTotais.filter(c => c.status === 'recebido' || c.status === 'parcial').reduce((s, c) => s + c.recebido, 0)
  const vence7 = kpiTotais.filter(c => emAberto(c) && c.vencimento && c.vencimento >= hojeStr && c.vencimento <= em7Str).reduce((s, c) => s + c.saldo, 0)
  const vence30 = kpiTotais.filter(c => emAberto(c) && c.vencimento && c.vencimento >= hojeStr && c.vencimento <= em30Str).reduce((s, c) => s + c.saldo, 0)

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-black text-[#0b1733]">Contas a Receber</h1>
        <Link href="/financeiro/importacao"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
          Importar Relatório
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Em Aberto', valor: totalAberto, cor: 'text-[#1b4fd6]' },
          { label: 'Vencido', valor: totalVencido, cor: 'text-red-600' },
          { label: 'Recebido', valor: totalRecebido, cor: 'text-green-600' },
          { label: 'Vence em 30 dias', valor: vence30, cor: 'text-orange-600' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-xs font-semibold text-slate-500">{k.label}</p>
            <p className={`mt-1 text-lg font-black ${k.cor}`}>{formatBRL(k.valor)}</p>
          </div>
        ))}
      </div>

      {/* Filtro mes/ano */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
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

        {/* Filtros adicionais */}
        <div className="flex flex-wrap gap-3">
          <input type="date" value={filtroInicio} onChange={e => { setFiltroInicio(e.target.value); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          <input type="date" value={filtroFim} onChange={e => { setFiltroFim(e.target.value); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }}
            className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <input value={filtroCliente} onChange={e => { setFiltroCliente(e.target.value); setPagina(0) }}
            placeholder="Buscar cliente..."
            className="flex-1 min-w-36 rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
          <button onClick={() => { setFiltroStatus('todos'); setFiltroCliente(''); setFiltroInicio(''); setFiltroFim(''); setPagina(0) }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-[#f8fafc]">
              <tr>
                {[
                  { key: null, label: 'Nº Doc' },
                  { key: 'cliente', label: 'Cliente' },
                  { key: null, label: 'Histórico' },
                  { key: null, label: 'Emissão' },
                  { key: 'vencimento', label: 'Vencimento' },
                  { key: 'valor', label: 'Valor' },
                  { key: null, label: 'Saldo' },
                  { key: null, label: 'Recebido' },
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
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_documento || c.numero_banco || '—'}</td>
                    <td className="px-4 py-3 font-medium text-[#0b1733] max-w-[160px] truncate">{c.cliente || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate text-xs">{c.historico || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatData(c.data_emissao)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.vencimento ? formatData(c.vencimento) : '—'}
                      {vencido && <span className="ml-1 text-xs text-red-500 font-semibold">vencido</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#0b1733]">{formatBRL(c.valor)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatBRL(c.saldo)}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">{c.recebido > 0 ? formatBRL(c.recebido) : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={vencido ? 'vencido' : c.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
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
    </div>
  )
}
