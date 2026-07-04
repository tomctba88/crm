'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'

type OrdemResumo = { id: number; numero: string; status: string; produto: string | null; responsavel: string | null; data_prevista: string | null; updated_at: string }
type AlertaEstoque = { insumo_id: number; quantidade_atual: number; ponto_reposicao: number; producao_insumos: { nome: string; unidade: string } | null }

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
  const [alertas, setAlertas] = useState<AlertaEstoque[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const [{ data }, { data: estoque }] = await Promise.all([
        supabase
          .from('producao_ordens')
          .select('id,numero,status,produto,responsavel,data_prevista,updated_at')
          .order('id', { ascending: false }),
        supabase
          .from('producao_estoque_insumos')
          .select('insumo_id,quantidade_atual,ponto_reposicao,producao_insumos(nome,unidade)'),
      ])
      setOrdens(data || [])
      const baixos = ((estoque || []) as unknown as AlertaEstoque[])
        .filter((e) => Number(e.quantidade_atual) < Number(e.ponto_reposicao))
      setAlertas(baixos)
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

      {!loading && alertas.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-orange-800">⚠ Insumos com estoque baixo</h2>
            <Link href="/producao/estoque" className="text-sm font-semibold text-[#1b4fd6] hover:underline">Ir para Estoque →</Link>
          </div>
          <div className="space-y-1.5">
            {alertas.map((a) => (
              <div key={a.insumo_id} className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-2 text-sm">
                <span className="font-semibold text-slate-700">{a.producao_insumos?.nome || `Insumo #${a.insumo_id}`}</span>
                <span className="text-slate-600">
                  atual: <span className="font-bold text-red-600">{Number(a.quantidade_atual).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {a.producao_insumos?.unidade || ''}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  mín: {Number(a.ponto_reposicao).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {a.producao_insumos?.unidade || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
