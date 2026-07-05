'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Cliente = { nome_cliente: string | null; nome_empresa: string | null; telefone: string | null; uf: string | null }
type Pedido = {
  id: number
  numero: string | null
  cliente_id: number | null
  lead_id: number | null
  vendedor: string | null
  status_global: string
  uf: string | null
  cidade: string | null
  prazo_entrega: string | null
  valor_produtos: number | null
  valor_frete: number | null
  valor_desconto: number | null
  valor_total: number | null
  observacoes: string | null
  clientes: Cliente | null
}
type Item = {
  id: number
  produto_id: number | null
  descricao: string | null
  quantidade: number
  valor_tabela: number
  valor_unitario: number
  desconto_pct: number
  subtotal: number
  producao_produtos: { nome: string; sku: string | null } | null
}
type Ordem = { id: number; numero: string; status: string; data_prevista: string | null }
type ProdutoBusca = { id: number; nome: string; sku: string | null; preco: number }

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'
const btnSecundario = 'rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'

const STATUS = ['RASCUNHO', 'VENDIDO', 'EM_PRODUCAO', 'PRONTO', 'EM_ENTREGA', 'ENTREGUE', 'CANCELADO']

function brl(n: number | null | undefined) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PedidoDetalhe({ pedidoId }: { pedidoId: number }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // form do cabeçalho
  const [vendedor, setVendedor] = useState('')
  const [uf, setUf] = useState('')
  const [cidade, setCidade] = useState('')
  const [prazo, setPrazo] = useState('')
  const [frete, setFrete] = useState('')
  const [descontoPedido, setDescontoPedido] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // busca de cliente
  const [buscaCliente, setBuscaCliente] = useState('')
  const [resultCliente, setResultCliente] = useState<{ id: number; nome_cliente: string; nome_empresa: string | null; uf: string | null }[]>([])

  // busca de produto
  const [buscaProd, setBuscaProd] = useState('')
  const [resultProd, setResultProd] = useState<ProdutoBusca[]>([])

  useEffect(() => {
    carregar()
  }, [pedidoId])

  function preencherForm(p: Pedido) {
    setVendedor(p.vendedor || '')
    setUf(p.uf || '')
    setCidade(p.cidade || '')
    setPrazo(p.prazo_entrega || '')
    setFrete(p.valor_frete != null ? String(p.valor_frete) : '')
    setDescontoPedido(p.valor_desconto != null ? String(p.valor_desconto) : '')
    setObservacoes(p.observacoes || '')
  }

  async function carregar() {
    setLoading(true)
    const res = await fetch(`/api/pedidos/${pedidoId}`)
    const json = await res.json()
    if (json.pedido) {
      setPedido(json.pedido)
      setItens(json.itens || [])
      setOrdens(json.ordens || [])
      preencherForm(json.pedido)
    }
    setLoading(false)
  }

  function flash(tipo: 'ok' | 'erro', texto: string) {
    setMsg({ tipo, texto })
    setTimeout(() => setMsg(null), 3500)
  }

  async function patchPedido(patch: Record<string, unknown>) {
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const json = await res.json()
    if (json.pedido) setPedido(json.pedido)
    return json
  }

  async function salvarCabecalho() {
    setSalvando(true)
    const json = await patchPedido({
      vendedor: vendedor || null,
      uf: uf || null,
      cidade: cidade || null,
      prazo_entrega: prazo || null,
      valor_frete: Number(frete) || 0,
      valor_desconto: Number(descontoPedido) || 0,
      observacoes: observacoes || null,
    })
    setSalvando(false)
    if (json.error) flash('erro', json.error)
    else flash('ok', 'Dados salvos.')
  }

  async function mudarStatus(novo: string) {
    const json = await patchPedido({ status_global: novo })
    if (json.error) flash('erro', json.error)
  }

  // ---- cliente ----
  async function buscarCliente(q: string) {
    setBuscaCliente(q)
    if (q.trim().length < 2) return setResultCliente([])
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    setResultCliente(json.clientes || [])
  }
  async function selecionarCliente(c: { id: number; uf: string | null }) {
    const patch: Record<string, unknown> = { cliente_id: c.id }
    if (c.uf && !uf) {
      patch.uf = c.uf
      setUf(c.uf)
    }
    await patchPedido(patch)
    await carregar()
    setBuscaCliente('')
    setResultCliente([])
  }

  // ---- produtos / itens ----
  async function buscarProduto(q: string) {
    setBuscaProd(q)
    const res = await fetch(`/api/pedidos/produtos?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    setResultProd(json.produtos || [])
  }
  async function adicionarItem(prod: ProdutoBusca) {
    const res = await fetch(`/api/pedidos/${pedidoId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produto_id: prod.id, quantidade: 1 }),
    })
    const json = await res.json()
    if (json.itens) {
      setItens(json.itens)
      await recarregarPedido()
    } else flash('erro', json.error || 'Erro ao adicionar item.')
    setBuscaProd('')
    setResultProd([])
  }
  async function atualizarItem(itemId: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/pedidos/${pedidoId}/itens`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, ...patch }),
    })
    const json = await res.json()
    if (json.itens) {
      setItens(json.itens)
      await recarregarPedido()
    } else flash('erro', json.error || 'Erro ao atualizar item.')
  }
  async function removerItem(itemId: number) {
    const res = await fetch(`/api/pedidos/${pedidoId}/itens?item_id=${itemId}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.itens) {
      setItens(json.itens)
      await recarregarPedido()
    }
  }
  async function recarregarPedido() {
    const res = await fetch(`/api/pedidos/${pedidoId}`)
    const json = await res.json()
    if (json.pedido) setPedido(json.pedido)
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando pedido…</p>
  if (!pedido) return <p className="text-sm text-red-500">Pedido não encontrado.</p>

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/pedidos" className={btnSecundario}>← Voltar</Link>
          <div>
            <h1 className="text-xl font-black text-slate-800">{pedido.numero || `Pedido #${pedido.id}`}</h1>
            <p className="text-sm text-slate-500">{pedido.clientes?.nome_cliente || pedido.clientes?.nome_empresa || 'Sem cliente'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Status</label>
          <select value={pedido.status_global} onChange={(e) => mudarStatus(e.target.value)} className={input}>
            {STATUS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-2 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Cliente + dados de entrega */}
        <div className={`${card} lg:col-span-1`}>
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-400">Cliente & Entrega</h2>

          {pedido.cliente_id ? (
            <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <div className="font-semibold text-slate-800">{pedido.clientes?.nome_cliente || pedido.clientes?.nome_empresa}</div>
              {pedido.clientes?.telefone && <div className="text-slate-500">{pedido.clientes.telefone}</div>}
            </div>
          ) : (
            <div className="relative mb-3">
              <input
                value={buscaCliente}
                onChange={(e) => buscarCliente(e.target.value)}
                placeholder="Buscar cliente…"
                className={`${input} w-full`}
              />
              {resultCliente.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                  {resultCliente.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selecionarCliente(c)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {c.nome_cliente} {c.nome_empresa ? <span className="text-slate-400">· {c.nome_empresa}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-500">Vendedor</label>
            <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={`${input} w-full`} />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500">UF</label>
                <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} className={`${input} w-full`} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500">Cidade</label>
                <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={`${input} w-full`} />
              </div>
            </div>
            <label className="text-xs font-semibold text-slate-500">Prazo de entrega</label>
            <input type="date" value={prazo || ''} onChange={(e) => setPrazo(e.target.value)} className={`${input} w-full`} />
            <label className="text-xs font-semibold text-slate-500">Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className={`${input} w-full`} />
            <button onClick={salvarCabecalho} disabled={salvando} className={`${btnPrimario} mt-1`}>
              {salvando ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        </div>

        {/* Itens + totais */}
        <div className={`${card} lg:col-span-2`}>
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-400">Itens do pedido</h2>

          {/* adicionar produto */}
          <div className="relative mb-3">
            <input
              value={buscaProd}
              onFocus={() => buscarProduto(buscaProd)}
              onChange={(e) => buscarProduto(e.target.value)}
              placeholder="Adicionar produto (busca no cadastro de Produção)…"
              className={`${input} w-full`}
            />
            {resultProd.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {resultProd.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => adicionarItem(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>{p.nome} {p.sku ? <span className="text-slate-400">· {p.sku}</span> : null}</span>
                    <span className="font-semibold text-green-700">{brl(p.preco)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {itens.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum item. Busque um produto acima para adicionar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                    <th className="py-2 pr-2">Produto</th>
                    <th className="py-2 pr-2 text-right">Tabela</th>
                    <th className="py-2 pr-2 text-center">Qtd</th>
                    <th className="py-2 pr-2 text-center">Desc.%</th>
                    <th className="py-2 pr-2 text-right">Unit.</th>
                    <th className="py-2 pr-2 text-right">Subtotal</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100">
                      <td className="py-2 pr-2">{it.producao_produtos?.nome || it.descricao || '—'}</td>
                      <td className="py-2 pr-2 text-right text-slate-500">{brl(it.valor_tabela)}</td>
                      <td className="py-2 pr-2 text-center">
                        <input
                          type="number"
                          min={0}
                          step="1"
                          defaultValue={it.quantidade}
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v !== Number(it.quantidade)) atualizarItem(it.id, { quantidade: v })
                          }}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          defaultValue={it.desconto_pct}
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v !== Number(it.desconto_pct)) atualizarItem(it.id, { desconto_pct: v })
                          }}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-2 text-right">{brl(it.valor_unitario)}</td>
                      <td className="py-2 pr-2 text-right font-semibold">{brl(it.subtotal)}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => removerItem(it.id)} className="text-xs font-semibold text-red-500 hover:underline">
                          remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totais */}
          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Produtos</dt><dd className="font-semibold">{brl(pedido.valor_produtos)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Desconto do pedido</dt><dd className="font-semibold text-red-600">- {brl(pedido.valor_desconto)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Frete</dt><dd className="font-semibold">{brl(pedido.valor_frete)}</dd></div>
              <div className="mt-1 flex justify-between rounded-xl bg-[#0b1733] px-3 py-2 text-white">
                <dt className="font-bold">Total</dt><dd className="text-lg font-black">{brl(pedido.valor_total)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Produção vinculada */}
      <div className={card}>
        <h2 className="mb-3 text-sm font-bold uppercase text-slate-400">Produção vinculada</h2>
        {ordens.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma ordem de produção vinculada a este pedido.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ordens.map((o) => (
              <Link
                key={o.id}
                href={`/producao/ordens/${o.id}`}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="font-semibold text-[#1b4fd6]">{o.numero}</span>
                <span className="ml-2 text-xs text-slate-500">{o.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
