'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'

type OrdemResumo = { id: number; numero: string; status: string; produto: string | null; responsavel: string | null; data_prevista: string | null; updated_at: string }

const STATUS_COR: Record<string, string> = {
  AGUARDANDO: 'bg-amber-100 text-amber-800',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-800',
  QUALIDADE: 'bg-purple-100 text-purple-800',
  CONCLUIDO: 'bg-green-100 text-green-800',
  CANCELADO: 'bg-red-100 text-red-800',
}

export default function ProducaoDashboard() {
  const supabase = useMemo(() => createClient(), [])
  const [ordens, setOrdens] = useState<OrdemResumo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('producao_ordens')
        .select('id,numero,status,produto,responsavel,data_prevista,updated_at')
        .order('id', { ascending: false })
      setOrdens(data || [])
      setLoading(false)
    }
    carregar()
  }, [supabase])

  const contadores = useMemo(() => {
    const c = { AGUARDANDO: 0, EM_ANDAMENTO: 0, QUALIDADE: 0, CONCLUIDO: 0, CANCELADO: 0 }
    ordens.forEach((o) => { if (o.status in c) c[o.status as keyof typeof c]++ })
    return c
  }, [ordens])

  const hoje = new Date().toISOString().slice(0, 10)
  const atrasadas = ordens.filter((o) => o.data_prevista && o.data_prevista < hoje && o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO').length

  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[#0b1733]">Dashboard de Produção</h1>
        <p className="text-sm text-slate-500">Visão geral das ordens de produção</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {([
          { label: 'Aguardando', key: 'AGUARDANDO', cor: 'text-amber-600' },
          { label: 'Em Andamento', key: 'EM_ANDAMENTO', cor: 'text-blue-600' },
          { label: 'Controle de Qualidade', key: 'QUALIDADE', cor: 'text-purple-600' },
          { label: 'Concluídas', key: 'CONCLUIDO', cor: 'text-green-600' },
          { label: 'Canceladas', key: 'CANCELADO', cor: 'text-red-500' },
          { label: 'Atrasadas', key: '_ATRASADAS', cor: 'text-orange-600' },
        ] as const).map((item) => (
          <div key={item.key} className={card}>
            <p className="text-sm font-semibold text-slate-500">{item.label}</p>
            <p className={`mt-3 text-4xl font-black ${item.cor}`}>
              {loading ? '—' : item.key === '_ATRASADAS' ? atrasadas : contadores[item.key]}
            </p>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#0b1733]">Ordens recentes</h2>
          <Link href="/producao/ordens" className="text-sm font-semibold text-[#1b4fd6] hover:underline">Ver todas →</Link>
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : ordens.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma ordem de produção ainda.</p>
        ) : (
          <div className="space-y-2">
            {ordens.slice(0, 8).map((o) => (
              <Link key={o.id} href={`/producao/ordens/${o.id}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:bg-slate-100 transition-colors">
                <div>
                  <span className="text-sm font-bold text-[#0b1733]">{o.numero}</span>
                  {o.produto && <span className="ml-2 text-sm text-slate-500">{o.produto}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {o.data_prevista && o.data_prevista < hoje && o.status !== 'CONCLUIDO' && o.status !== 'CANCELADO' && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">Atrasada</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COR[o.status] || 'bg-slate-100 text-slate-600'}`}>
                    {o.status.replace('_', ' ')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
