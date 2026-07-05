'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Pedido = {
  id: number
  numero: string | null
  status_global: string
  prazo_entrega: string | null
  valor_total: number | null
  vendedor: string | null
  clientes: { nome_cliente: string | null; nome_empresa: string | null } | null
}

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'

const STATUS_STYLE: Record<string, string> = {
  RASCUNHO: 'bg-slate-100 text-slate-600',
  VENDIDO: 'bg-blue-100 text-blue-700',
  EM_PRODUCAO: 'bg-amber-100 text-amber-700',
  PRONTO: 'bg-indigo-100 text-indigo-700',
  EM_ENTREGA: 'bg-purple-100 text-purple-700',
  ENTREGUE: 'bg-green-100 text-green-700',
  CANCELADO: 'bg-red-100 text-red-700',
}

function brl(n: number | null) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function dataBR(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

export default function PedidosLista() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const res = await fetch('/api/pedidos')
    const json = await res.json()
    setPedidos(json.pedidos || [])
    setLoading(false)
  }

  async function novoPedido() {
    setCriando(true)
    const res = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const json = await res.json()
    setCriando(false)
    if (json.pedido?.id) router.push(`/pedidos/${json.pedido.id}`)
    else alert(json.error || 'Erro ao criar pedido.')
  }

  const lista = pedidos.filter((p) => {
    if (!filtro.trim()) return true
    const t = filtro.toLowerCase()
    return (
      (p.numero || '').toLowerCase().includes(t) ||
      (p.clientes?.nome_cliente || '').toLowerCase().includes(t) ||
      (p.clientes?.nome_empresa || '').toLowerCase().includes(t) ||
      (p.vendedor || '').toLowerCase().includes(t)
    )
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800">Pedidos</h1>
          <p className="text-sm text-slate-500">Central que liga cliente, venda, produção, frete e financeiro.</p>
        </div>
        <button onClick={novoPedido} disabled={criando} className={btnPrimario}>
          {criando ? 'Criando…' : '+ Novo pedido'}
        </button>
      </div>

      <div className={card}>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por número, cliente ou vendedor…"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Nenhum pedido ainda. Clique em “Novo pedido”.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">Número</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Vendedor</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Prazo</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/pedidos/${p.id}`)}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="py-2 pr-3 font-semibold text-[#1b4fd6]">
                      <Link href={`/pedidos/${p.id}`}>{p.numero || `#${p.id}`}</Link>
                    </td>
                    <td className="py-2 pr-3">{p.clientes?.nome_cliente || p.clientes?.nome_empresa || '—'}</td>
                    <td className="py-2 pr-3 text-slate-500">{p.vendedor || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[p.status_global] || 'bg-slate-100 text-slate-600'}`}>
                        {p.status_global}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{dataBR(p.prazo_entrega)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{brl(p.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
