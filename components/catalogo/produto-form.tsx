'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CAMPOS_TINY } from '@/lib/catalogo/mapear'

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 w-full'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'
const btnSecundario = 'rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'

type ProducaoLink = { id: number; nome: string; sku: string | null }

export default function ProdutoForm({ produtoId }: { produtoId?: number }) {
  const router = useRouter()
  const novo = !produtoId

  const [raw, setRaw] = useState<Record<string, unknown>>({})
  const [abaAtiva, setAbaAtiva] = useState(CAMPOS_TINY[0].aba)
  const [loading, setLoading] = useState(!novo)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [producao, setProducao] = useState<ProducaoLink | null>(null)

  useEffect(() => {
    if (novo) return
    ;(async () => {
      const res = await fetch(`/api/produtos-catalogo/${produtoId}`)
      const json = await res.json()
      if (json.produto) {
        setRaw((json.produto.raw as Record<string, unknown>) || {})
        const pp = json.produto.producao_produtos
        if (pp) setProducao(Array.isArray(pp) ? pp[0] : pp)
      }
      setLoading(false)
    })()
  }, [produtoId, novo])

  function flash(tipo: 'ok' | 'erro', texto: string) {
    setMsg({ tipo, texto })
    setTimeout(() => setMsg(null), 3500)
  }

  function setCampo(key: string, valor: string) {
    setRaw((r) => ({ ...r, [key]: valor }))
  }

  async function salvar() {
    setSalvando(true)
    try {
      if (novo) {
        const res = await fetch('/api/produtos-catalogo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        router.push(`/catalogo/${json.id}`)
      } else {
        const res = await fetch(`/api/produtos-catalogo/${produtoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        flash('ok', 'Produto salvo.')
      }
    } catch (err) {
      flash('erro', (err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando produto…</p>

  const grupo = CAMPOS_TINY.find((g) => g.aba === abaAtiva) || CAMPOS_TINY[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/catalogo" className={btnSecundario}>← Voltar</Link>
          <div>
            <h1 className="text-xl font-black text-slate-800">
              {novo ? 'Novo produto' : String(raw['Descrição'] || 'Produto')}
            </h1>
            <p className="text-sm text-slate-500">
              {novo ? 'Cadastro manual' : `SKU: ${raw['Código (SKU)'] || '—'}`}
              {producao && (
                <>
                  {' · '}
                  <Link href="/producao/produtos" className="text-[#1b4fd6] font-semibold">
                    ⚙ Ligado à Produção: {producao.nome}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <button onClick={salvar} disabled={salvando} className={btnPrimario}>
          {salvando ? 'Salvando…' : 'Salvar produto'}
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-2 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Abas */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {CAMPOS_TINY.map((g) => {
          const ativo = g.aba === abaAtiva
          return (
            <button
              key={g.aba}
              onClick={() => setAbaAtiva(g.aba)}
              className={[
                'px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors',
                ativo
                  ? 'bg-white border-slate-200 text-[#1b4fd6] -mb-px'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {g.aba}
            </button>
          )
        })}
      </nav>

      {/* Campos da aba ativa */}
      <div className={card}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {grupo.campos.map((c) => (
            <div key={c.key} className={c.tipo === 'area' ? 'md:col-span-2' : ''}>
              <label className="mb-1 block text-xs font-semibold text-slate-500">{c.label}</label>
              {c.tipo === 'area' ? (
                <textarea
                  value={String(raw[c.key] ?? '')}
                  onChange={(e) => setCampo(c.key, e.target.value)}
                  rows={3}
                  className={input}
                />
              ) : (
                <input
                  type={c.tipo === 'numero' ? 'number' : 'text'}
                  step={c.tipo === 'numero' ? 'any' : undefined}
                  value={String(raw[c.key] ?? '')}
                  onChange={(e) => setCampo(c.key, e.target.value)}
                  className={input}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
