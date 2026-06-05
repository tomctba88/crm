'use client'

import { useState } from 'react'
import { formatBRL } from '@/lib/financeiro/formatters'

export type Lancamento = {
  id: string | number
  data_inicio: string | null
  periodo_label: string
  grupo: string
  valor: number
}

type Props = {
  categoria: string
  lancamentos: Lancamento[]
  contas: string[] // categorias de destino possíveis (todas as contas de saída)
  onClose: () => void
  onMoved: () => void // dispara recarga no componente pai
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}

export default function LancamentosDrawer({ categoria, lancamentos, contas, onClose, onMoved }: Props) {
  const [movendo, setMovendo] = useState<string | number | null>(null)
  const [erro, setErro] = useState('')

  const total = lancamentos.reduce((s, l) => s + l.valor, 0)
  const destinos = contas.filter(c => c !== categoria).sort((a, b) => a.localeCompare(b))

  async function mover(id: string | number, novaCategoria: string) {
    if (!novaCategoria || novaCategoria === categoria) return
    setMovendo(id)
    setErro('')
    try {
      const res = await fetch('/api/financeiro/lancamentos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, categoria: novaCategoria }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro ao mover.'); setMovendo(null); return }
      onMoved()
    } catch {
      setErro('Erro de conexão.')
      setMovendo(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Painel */}
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-6">
          <div>
            <p className="text-xs font-semibold text-slate-400">Lançamentos da conta</p>
            <h2 className="text-xl font-black text-[#0b1733]">{categoria}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {lancamentos.length} lançamento(s) · Total <span className="font-bold text-[#0b1733]">{formatBRL(total)}</span>
            </p>
          </div>
          <button onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            Fechar
          </button>
        </div>

        {erro && <p className="bg-red-50 px-6 py-2 text-sm font-semibold text-red-600">{erro}</p>}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-6">
          {lancamentos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum lançamento nesta conta.</p>
          ) : (
            <div className="space-y-3">
              {lancamentos
                .slice()
                .sort((a, b) => b.valor - a.valor)
                .map(l => (
                  <div key={l.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0b1733]">{l.periodo_label || '—'}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatData(l.data_inicio)}{l.grupo ? ` · ${l.grupo}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-black text-red-600">{formatBRL(l.valor)}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-slate-400 shrink-0">Mover para:</span>
                      <select
                        defaultValue=""
                        disabled={movendo === l.id}
                        onChange={e => mover(l.id, e.target.value)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6] disabled:opacity-50"
                      >
                        <option value="" disabled>{movendo === l.id ? 'Movendo…' : 'Selecionar conta…'}</option>
                        {destinos.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
