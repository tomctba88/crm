'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { formatCurrency, formatNumero, num } from '@/lib/producao/indicadores'

/**
 * Itens da ordem: modelo + cor do revestimento + quantidade.
 *
 * É o que transforma a OP de "uma coisa só" em produção mensurável — sem item
 * preenchido, a OP não aparece no volume, na curva ABC nem na taxa de refugo.
 */

type Item = {
  id: number
  produto_id: number | null
  descricao: string | null
  revestimento_id: number | null
  qtd_planejada: number | string
  qtd_produzida: number | string
  qtd_perdida: number | string
  valor_unitario: number | string
  custo_unitario: number | string
  producao_revestimentos: { nome: string; cor: string; material: string } | null
}

type Produto = { id: number; nome: string; sku: string | null; preco: number | null; preco_custo: number | null }
type Revestimento = { id: number; nome: string; cor: string }

const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const th = 'px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500'
const td = 'px-2 py-2 text-sm text-slate-700'

export default function OrdemItens({ ordemId, temPedido }: { ordemId: number; temPedido: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [itens, setItens] = useState<Item[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [revestimentos, setRevestimentos] = useState<Revestimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState({ produto_id: '', descricao: '', revestimento_id: '', qtd_planejada: '1' })

  const carregar = useCallback(async () => {
    const [i, p, r] = await Promise.all([
      supabase.from('producao_ordem_itens')
        .select('*, producao_revestimentos(nome,cor,material)')
        .eq('ordem_id', ordemId).order('id'),
      supabase.from('producao_produtos').select('id,nome,sku,preco,preco_custo').eq('ativo', true).order('nome'),
      supabase.from('producao_revestimentos').select('id,nome,cor').eq('ativo', true).order('nome'),
    ])
    setItens((i.data || []) as unknown as Item[])
    setProdutos((p.data || []) as Produto[])
    setRevestimentos((r.data || []) as Revestimento[])
    setCarregando(false)
  }, [supabase, ordemId])

  useEffect(() => { carregar() }, [carregar])

  async function chamar(metodo: string, corpo: unknown, url = `/api/producao/ordens/${ordemId}/itens`) {
    setSalvando(true); setMsg('')
    const resp = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: metodo === 'DELETE' ? undefined : JSON.stringify(corpo),
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) setMsg(`⚠ ${json.error || 'Não foi possível salvar.'}`)
    else await carregar()
    setSalvando(false)
    return resp.ok
  }

  async function adicionar() {
    if (!novo.produto_id && !novo.descricao.trim()) {
      setMsg('⚠ Escolha um produto ou digite o modelo.')
      return
    }
    const ok = await chamar('POST', {
      produto_id: novo.produto_id || null,
      descricao: novo.descricao.trim() || null,
      revestimento_id: novo.revestimento_id || null,
      qtd_planejada: Number(novo.qtd_planejada) || 1,
    })
    if (ok) setNovo({ produto_id: '', descricao: '', revestimento_id: '', qtd_planejada: '1' })
  }

  const totalPlanejado = itens.reduce((s, i) => s + num(i.qtd_planejada), 0)
  const totalProduzido = itens.reduce((s, i) => s + num(i.qtd_produzida), 0)
  const totalPerdido = itens.reduce((s, i) => s + num(i.qtd_perdida), 0)
  const totalValor = itens.reduce((s, i) => s + num(i.qtd_planejada) * num(i.valor_unitario), 0)

  return (
    <div className={card}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0b1733]">Itens da Ordem</h2>
          <p className="text-xs text-slate-500">
            Modelo, cor do revestimento e quantidade — é o que alimenta os indicadores
          </p>
        </div>
        {temPedido && (
          <button onClick={() => chamar('POST', { sincronizar: true })} disabled={salvando}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Puxar do pedido
          </button>
        )}
      </div>

      {msg && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      {carregando ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">Nenhum item nesta ordem ainda.</p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>Modelo</th><th className={th}>Revestimento</th>
                <th className={th}>Planejado</th><th className={th}>Produzido</th>
                <th className={th}>Perdido</th><th className={th}>Valor un.</th><th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className={`${td} font-semibold`}>{item.descricao || `Item #${item.id}`}</td>
                  <td className={td}>
                    <select
                      value={item.revestimento_id ?? ''}
                      onChange={(e) => chamar('PATCH', { id: item.id, revestimento_id: e.target.value ? Number(e.target.value) : null })}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="">— definir cor —</option>
                      {revestimentos.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.cor}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <CampoNumero valor={num(item.qtd_planejada)}
                      onSalvar={(v) => chamar('PATCH', { id: item.id, qtd_planejada: v })} />
                  </td>
                  <td className={td}>
                    <CampoNumero valor={num(item.qtd_produzida)}
                      onSalvar={(v) => chamar('PATCH', { id: item.id, qtd_produzida: v })} />
                  </td>
                  <td className={`${td} tabular-nums ${num(item.qtd_perdida) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                    {formatNumero(num(item.qtd_perdida), 0)}
                  </td>
                  <td className={`${td} tabular-nums`}>{formatCurrency(num(item.valor_unitario))}</td>
                  <td className={td}>
                    <button
                      onClick={() => {
                        if (confirm('Excluir este item da ordem?')) {
                          chamar('DELETE', null, `/api/producao/ordens/${ordemId}/itens?itemId=${item.id}`)
                        }
                      }}
                      className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-200"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td className={`${td} font-bold`} colSpan={2}>
                  Total <span className="font-normal text-slate-400">· {formatCurrency(totalValor)}</span>
                </td>
                <td className={`${td} font-bold tabular-nums`}>{formatNumero(totalPlanejado, 0)}</td>
                <td className={`${td} font-bold tabular-nums`}>{formatNumero(totalProduzido, 0)}</td>
                <td className={`${td} font-bold tabular-nums ${totalPerdido > 0 ? 'text-red-600' : ''}`}>
                  {formatNumero(totalPerdido, 0)}
                </td>
                <td className={td} colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
        <select value={novo.produto_id}
          onChange={(e) => setNovo({ ...novo, produto_id: e.target.value })}
          className={`${input} lg:col-span-2`}>
          <option value="">Produto do catálogo...</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.sku ? `${p.sku} — ` : ''}{p.nome}</option>)}
        </select>
        <input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          placeholder="ou digite o modelo" className={input} />
        <select value={novo.revestimento_id} onChange={(e) => setNovo({ ...novo, revestimento_id: e.target.value })}
          className={input}>
          <option value="">Revestimento...</option>
          {revestimentos.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.cor}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="number" min="1" step="1" value={novo.qtd_planejada}
            onChange={(e) => setNovo({ ...novo, qtd_planejada: e.target.value })}
            className={`${input} w-20`} />
          <button onClick={adicionar} disabled={salvando}
            className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
            Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Campo numérico que só grava no blur — evita um PATCH por tecla digitada. */
function CampoNumero({ valor, onSalvar }: { valor: number; onSalvar: (v: number) => void }) {
  return (
    <input
      type="number" min="0" step="1" defaultValue={valor} key={valor}
      onBlur={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v >= 0 && v !== valor) onSalvar(v)
      }}
      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums outline-none focus:border-blue-500"
    />
  )
}
