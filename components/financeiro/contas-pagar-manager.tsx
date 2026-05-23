'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatData, isVencido } from '@/lib/financeiro/formatters'
import StatusBadge from './status-badge'
import SincronizarButton from './sincronizar-button'

type Conta = {
  id: string
  numero_documento: string
  fornecedor: string
  descricao: string
  valor: number
  valor_pago: number
  data_vencimento: string | null
  data_pagamento: string | null
  status: string
  categoria: string
  conta_bancaria: string
  observacoes: string
  origem: string
}

const STATUS_OPTS = ['todos', 'aberto', 'pago', 'vencido', 'cancelado']
const POR_PAGINA = 20

export default function ContasPagarManager() {
  const supabase = createClient()
  const [contas, setContas] = useState<Conta[]>([])
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroInicio, setFiltroInicio] = useState('')
  const [filtroFim, setFiltroFim] = useState('')
  const [ordenarPor, setOrdenarPor] = useState<'data_vencimento' | 'valor' | 'fornecedor'>('data_vencimento')
  const [asc, setAsc] = useState(true)
  const [modalPagar, setModalPagar] = useState<Conta | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<Conta | null>(null)
  const [formPagar, setFormPagar] = useState({ data_pagamento: '', valor_pago: '' })
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('fin_contas_pagar').select('*', { count: 'exact' })
    if (filtroStatus !== 'todos' && filtroStatus !== 'vencido') q = q.eq('status', filtroStatus)
    if (filtroFornecedor) q = q.ilike('fornecedor', `%${filtroFornecedor}%`)
    if (filtroInicio) q = q.gte('data_vencimento', filtroInicio)
    if (filtroFim) q = q.lte('data_vencimento', filtroFim)
    q = q.order(ordenarPor, { ascending: asc }).range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1)
    const { data, count } = await q
    let rows = (data ?? []) as Conta[]
    if (filtroStatus === 'vencido') rows = rows.filter(r => isVencido(r.data_vencimento ?? '', r.status))
    setContas(rows)
    setTotal(count ?? 0)
    setLoading(false)
  }, [filtroStatus, filtroFornecedor, filtroInicio, filtroFim, ordenarPor, asc, pagina])

  useEffect(() => { carregar() }, [carregar])

  function toggleOrdem(col: typeof ordenarPor) {
    if (ordenarPor === col) setAsc(!asc)
    else { setOrdenarPor(col); setAsc(true) }
    setPagina(0)
  }

  async function marcarPago() {
    if (!modalPagar) return
    setSalvando(true)
    await supabase.from('fin_contas_pagar').update({
      status: 'pago',
      data_pagamento: formPagar.data_pagamento || null,
      valor_pago: Number(formPagar.valor_pago) || modalPagar.valor,
      updated_at: new Date().toISOString(),
    }).eq('id', modalPagar.id)
    setSalvando(false)
    setModalPagar(null)
    carregar()
  }

  const totalFiltrado = contas.reduce((s, r) => s + r.valor, 0)
  const totalPago = contas.filter(r => r.status === 'pago').reduce((s, r) => s + r.valor_pago, 0)
  const totalAberto = contas.filter(r => r.status === 'aberto').reduce((s, r) => s + r.valor, 0)
  const totalVencido = contas.filter(r => isVencido(r.data_vencimento ?? '', r.status)).reduce((s, r) => s + r.valor, 0)
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-black text-[#0b1733]">Contas a Pagar</h1>
        <SincronizarButton tipo="pagar" onSucesso={carregar} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        <input type="date" value={filtroInicio} onChange={e => { setFiltroInicio(e.target.value); setPagina(0) }}
          className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
        <input type="date" value={filtroFim} onChange={e => { setFiltroFim(e.target.value); setPagina(0) }}
          className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
        <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(0) }}
          className="rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]">
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <input value={filtroFornecedor} onChange={e => { setFiltroFornecedor(e.target.value); setPagina(0) }}
          placeholder="Buscar fornecedor..."
          className="flex-1 rounded-xl border border-slate-200 bg-[#eef3fb] px-3 py-2 text-sm outline-none focus:border-[#1b4fd6]" />
        <button onClick={() => { setFiltroStatus('todos'); setFiltroFornecedor(''); setFiltroInicio(''); setFiltroFim(''); setPagina(0) }}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
          Limpar
        </button>
      </div>

      {/* Mini KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Total filtrado', valor: totalFiltrado },
          { label: 'Pago', valor: totalPago, cor: 'text-green-600' },
          { label: 'Em aberto', valor: totalAberto, cor: 'text-red-600' },
          { label: 'Vencido', valor: totalVencido, cor: 'text-red-700' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-xs font-semibold text-slate-500">{k.label}</p>
            <p className={`mt-1 text-lg font-black ${k.cor ?? 'text-[#0b1733]'}`}>{formatBRL(k.valor)}</p>
          </div>
        ))}
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
                  { key: 'numero_documento', label: 'Nº Doc' },
                  { key: 'fornecedor', label: 'Fornecedor' },
                  { key: null, label: 'Descrição' },
                  { key: 'data_vencimento', label: 'Vencimento' },
                  { key: 'valor', label: 'Valor' },
                  { key: null, label: 'Pago' },
                  { key: null, label: 'Status' },
                  { key: null, label: 'Origem' },
                  { key: null, label: 'Ações' },
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
              ) : contas.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_documento || '—'}</td>
                  <td className="px-4 py-3 font-medium text-[#0b1733]">{c.fornecedor || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{c.descricao || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.data_vencimento ? formatData(c.data_vencimento) : '—'}
                    {isVencido(c.data_vencimento ?? '', c.status) && <span className="ml-1 text-xs text-red-500">vencido</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#0b1733]">{formatBRL(c.valor)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{c.valor_pago > 0 ? formatBRL(c.valor_pago) : '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={isVencido(c.data_vencimento ?? '', c.status) ? 'vencido' : c.status} tipo="pagar" /></td>
                  <td className="px-4 py-3 text-xs text-slate-400">{c.origem}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {c.status === 'aberto' && (
                        <button onClick={() => { setModalPagar(c); setFormPagar({ data_pagamento: '', valor_pago: String(c.valor) }) }}
                          className="rounded-lg bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-100">
                          Pagar
                        </button>
                      )}
                      <button onClick={() => setModalDetalhe(c)}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">
                        Detalhes
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{total} registros</span>
          <div className="flex gap-2">
            <button disabled={pagina === 0} onClick={() => setPagina(p => p - 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Anterior</button>
            <span className="rounded-xl bg-[#eef3fb] px-4 py-2 text-sm font-semibold">{pagina + 1} / {totalPaginas}</span>
            <button disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}

      {/* Modal Marcar Pago */}
      {modalPagar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-[#0b1733]">Marcar como Pago</h3>
            <p className="mt-1 text-sm text-slate-500">{modalPagar.fornecedor} — {formatBRL(modalPagar.valor)}</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-[#0b1733]">Data de pagamento</label>
                <input type="date" value={formPagar.data_pagamento} onChange={e => setFormPagar(f => ({ ...f, data_pagamento: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-[#eef3fb] px-4 py-3 text-sm outline-none focus:border-[#1b4fd6]" />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#0b1733]">Valor pago</label>
                <input type="number" step="0.01" value={formPagar.valor_pago} onChange={e => setFormPagar(f => ({ ...f, valor_pago: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-[#eef3fb] px-4 py-3 text-sm outline-none focus:border-[#1b4fd6]" />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={marcarPago} disabled={salvando} className="flex-1 h-12 rounded-2xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] font-extrabold text-white disabled:opacity-70">
                {salvando ? 'Salvando...' : 'Confirmar'}
              </button>
              <button onClick={() => setModalPagar(null)} className="flex-1 h-12 rounded-2xl border border-slate-200 font-semibold text-slate-600">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes */}
      {modalDetalhe && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-[#0b1733]">Detalhes da Conta</h3>
              <button onClick={() => setModalDetalhe(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="mt-6 space-y-4">
              {[
                ['Nº Documento', modalDetalhe.numero_documento],
                ['Fornecedor', modalDetalhe.fornecedor],
                ['Descrição', modalDetalhe.descricao],
                ['Valor', formatBRL(modalDetalhe.valor)],
                ['Valor Pago', formatBRL(modalDetalhe.valor_pago)],
                ['Vencimento', modalDetalhe.data_vencimento ? formatData(modalDetalhe.data_vencimento) : '—'],
                ['Pagamento', modalDetalhe.data_pagamento ? formatData(modalDetalhe.data_pagamento) : '—'],
                ['Status', modalDetalhe.status],
                ['Categoria', modalDetalhe.categoria || '—'],
                ['Conta Bancária', modalDetalhe.conta_bancaria || '—'],
                ['Origem', modalDetalhe.origem],
                ['Observações', modalDetalhe.observacoes || '—'],
              ].map(([label, val]) => (
                <div key={label} className="rounded-2xl bg-[#eef3fb] p-3">
                  <p className="text-xs font-semibold text-slate-500">{label}</p>
                  <p className="mt-0.5 font-bold text-[#0b1733]">{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
