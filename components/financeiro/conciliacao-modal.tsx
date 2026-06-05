'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatBRL } from '@/lib/financeiro/formatters'

type Proposta = {
  id: string | number
  de: string
  para: string
  valor: number
  historico: string
  contato: string
  status: 'unico' | 'ambiguo' | 'sem'
  mudou: boolean
  opcoes: string[]
}

type Props = {
  mes: number
  ano: number
  onClose: () => void
  onApplied: () => void
}

export default function ConciliacaoModal({ mes, ano, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [marcados, setMarcados] = useState<Set<string | number>>(new Set())
  const [escolhaAmbig, setEscolhaAmbig] = useState<Record<string, string>>({})
  const [aplicando, setAplicando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const res = await fetch('/api/financeiro/conciliar-categorias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'preview', mes, ano }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro ao gerar propostas.'); setLoading(false); return }
      const ps = (data.propostas ?? []) as Proposta[]
      setPropostas(ps)
      // marca por padrão as correções inequívocas que mudam de categoria
      setMarcados(new Set(ps.filter(p => p.status === 'unico' && p.mudou).map(p => p.id)))
      setLoading(false)
    } catch {
      setErro('Erro de conexão.'); setLoading(false)
    }
  }, [mes, ano])

  useEffect(() => { carregar() }, [carregar])

  const correcoes = propostas.filter(p => p.status === 'unico' && p.mudou)
  const ambiguas = propostas.filter(p => p.status === 'ambiguo')
  const semMatch = propostas.filter(p => p.status === 'sem')
  const semMudanca = propostas.filter(p => p.status === 'unico' && !p.mudou).length

  function toggle(id: string | number) {
    setMarcados(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  async function aplicar() {
    const itens: { id: string | number; categoria: string }[] = []
    for (const p of correcoes) if (marcados.has(p.id)) itens.push({ id: p.id, categoria: p.para })
    for (const p of ambiguas) {
      const escolha = escolhaAmbig[String(p.id)]
      if (escolha) itens.push({ id: p.id, categoria: escolha })
    }
    if (!itens.length) { onClose(); return }
    setAplicando(true)
    try {
      const res = await fetch('/api/financeiro/conciliar-categorias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'apply', itens }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro ao aplicar.'); setAplicando(false); return }
      onApplied()
    } catch {
      setErro('Erro de conexão.'); setAplicando(false)
    }
  }

  const totalSelecionado = marcados.size + Object.values(escolhaAmbig).filter(Boolean).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-6">
          <div>
            <h2 className="text-xl font-black text-[#0b1733]">Corrigir categorias via Contas a Pagar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cruza os lançamentos do fluxo com os títulos pagos e propõe a categoria correta.
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">Fechar</button>
        </div>

        {erro && <p className="bg-red-50 px-6 py-3 text-sm font-semibold text-red-600">{erro}</p>}

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                <span className="font-bold text-green-700">{correcoes.length}</span> correção(ões) sugerida(s) ·{' '}
                <span className="font-bold text-orange-600">{ambiguas.length}</span> ambígua(s) ·{' '}
                <span className="font-bold text-slate-400">{semMatch.length}</span> sem correspondência ·{' '}
                {semMudanca} já corretos
              </p>

              {/* Correções inequívocas */}
              {correcoes.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-[#0b1733]">Correções sugeridas</p>
                    <button
                      onClick={() => setMarcados(marcados.size === correcoes.length ? new Set() : new Set(correcoes.map(p => p.id)))}
                      className="text-xs font-semibold text-[#1b4fd6] hover:underline"
                    >
                      {marcados.size === correcoes.length ? 'Desmarcar todas' : 'Marcar todas'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {correcoes.map(p => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                        <input type="checkbox" checked={marcados.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[#1b4fd6]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-slate-500">{p.historico || '—'}{p.contato ? ` · ${p.contato}` : ''}</p>
                          <p className="text-sm">
                            <span className="font-semibold text-red-600 line-through">{p.de}</span>
                            <span className="mx-2 text-slate-400">→</span>
                            <span className="font-bold text-green-700">{p.para}</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-black text-[#0b1733]">{formatBRL(p.valor)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Ambíguas */}
              {ambiguas.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold text-orange-700">Ambíguas — escolha a conta correta</p>
                  <div className="space-y-2">
                    {ambiguas.map(p => (
                      <div key={p.id} className="rounded-xl border border-orange-200 bg-orange-50/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-xs text-slate-600">{p.historico || '—'}{p.contato ? ` · ${p.contato}` : ''} (atual: {p.de})</p>
                          <span className="shrink-0 text-sm font-bold text-[#0b1733]">{formatBRL(p.valor)}</span>
                        </div>
                        <select
                          value={escolhaAmbig[String(p.id)] ?? ''}
                          onChange={e => setEscolhaAmbig(prev => ({ ...prev, [String(p.id)]: e.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
                        >
                          <option value="">Não alterar</option>
                          {p.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {correcoes.length === 0 && ambiguas.length === 0 && (
                <p className="text-sm text-slate-400">Nenhuma correção a propor para este período.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-6">
          <span className="text-xs text-slate-500">{totalSelecionado} alteração(ões) selecionada(s)</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button onClick={aplicar} disabled={aplicando || loading || totalSelecionado === 0}
              className="rounded-xl bg-[#0b1733] px-5 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition disabled:opacity-40">
              {aplicando ? 'Aplicando…' : `Aplicar ${totalSelecionado}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
