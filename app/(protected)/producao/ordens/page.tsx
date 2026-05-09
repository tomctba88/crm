'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'

type Ordem = {
  id: number
  numero: string
  status: string
  produto: string | null
  responsavel: string | null
  data_prevista: string | null
  data_conclusao: string | null
  created_at: string
  leads: { nome_cliente: string; nome_empresa: string | null } | null
}

const STATUS_COR: Record<string, string> = {
  AGUARDANDO: 'bg-amber-100 text-amber-800',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-800',
  QUALIDADE: 'bg-purple-100 text-purple-800',
  CONCLUIDO: 'bg-green-100 text-green-800',
  CANCELADO: 'bg-red-100 text-red-800',
}

const STATUS_LISTA = ['Todos', 'AGUARDANDO', 'EM_ANDAMENTO', 'QUALIDADE', 'CONCLUIDO', 'CANCELADO']

function formatDate(v: string | null) {
  if (!v) return '-'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function OrdensPage() {
  const supabase = useMemo(() => createClient(), [])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('producao_ordens')
        .select('id,numero,status,produto,responsavel,data_prevista,data_conclusao,created_at,leads(nome_cliente,nome_empresa)')
        .order('id', { ascending: false })
      setOrdens((data || []) as unknown as Ordem[])
      setLoading(false)
    }
    carregar()
  }, [supabase])

  const hoje = new Date().toISOString().slice(0, 10)

  const filtradas = useMemo(() => {
    return ordens.filter((o) => {
      if (filtroStatus !== 'Todos' && o.status !== filtroStatus) return false
      if (busca) {
        const b = busca.toLowerCase()
        const cliente = (o.leads as any)?.nome_cliente?.toLowerCase() || ''
        const empresa = (o.leads as any)?.nome_empresa?.toLowerCase() || ''
        if (!o.numero.toLowerCase().includes(b) && !cliente.includes(b) && !empresa.includes(b) && !(o.produto || '').toLowerCase().includes(b)) return false
      }
      return true
    })
  }, [ordens, busca, filtroStatus])

  const th = { padding: '11px 12px', textAlign: 'left' as const, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13px', fontWeight: 700 }
  const td = { padding: '11px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-[#0b1733]">Ordens de Produção</h1>
        <p className="text-sm text-slate-500">{loading ? 'Carregando...' : `${filtradas.length} ordem(s) exibida(s)`}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por número, cliente, produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 w-full max-w-sm"
        />
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          {STATUS_LISTA.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
          <thead>
            <tr>
              {['Nº Ordem', 'Cliente', 'Produto', 'Responsável', 'Prazo', 'Status', ''].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((o) => {
              const lead = o.leads as any
              const atrasada = o.data_prevista && o.data_prevista < hoje && o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO'
              return (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td style={td}><span className="font-bold text-[#0b1733]">{o.numero}</span></td>
                  <td style={td}>
                    <div className="font-medium">{lead?.nome_cliente || '-'}</div>
                    {lead?.nome_empresa && <div className="text-xs text-slate-400">{lead.nome_empresa}</div>}
                  </td>
                  <td style={td}>{o.produto || '-'}</td>
                  <td style={td}>{o.responsavel || '-'}</td>
                  <td style={td}>
                    <span className={atrasada ? 'font-semibold text-orange-600' : ''}>{formatDate(o.data_prevista)}</span>
                    {atrasada && <span className="ml-1 text-xs text-orange-500">⚠</span>}
                  </td>
                  <td style={td}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COR[o.status] || 'bg-slate-100 text-slate-600'}`}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={td}>
                    <Link href={`/producao/ordens/${o.id}`} className="rounded-lg bg-[#0b1733] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b4fd6] transition-colors">
                      Abrir
                    </Link>
                  </td>
                </tr>
              )
            })}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={7} style={td} className="text-center text-slate-400">Nenhuma ordem encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
