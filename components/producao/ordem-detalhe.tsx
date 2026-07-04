'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'
import { calcularQuantidade } from '@/lib/producao/calcular-materiais'

type Etapa = { id: number; nome: string; sequencia: number; status: string; responsavel: string | null; data_inicio: string | null; data_conclusao: string | null; observacoes: string | null }
type Ordem = {
  id: number; numero: string; status: string; produto: string | null; responsavel: string | null
  data_prevista: string | null; data_conclusao: string | null; observacoes: string | null; created_at: string
  produto_id: number | null; comprimento_pedido: number | null; largura_pedido: number | null; altura_pedido: number | null
  materiais_calculados: MaterialSnapshot[] | null
  leads: { id: number; nome_cliente: string; nome_empresa: string | null; telefone: string | null; vendedor: string | null; produto_interesse: string | null; valor_orcamento: number | null } | null
  pos_vendas: { id: number; status_pos_venda: string } | null
}

type MaterialSnapshot = { insumo_id: number; nome: string; quantidade_calculada: number }

type ProdutoOpcao = {
  id: number; nome: string; comprimento_padrao: number | null; largura_padrao: number | null
  altura_padrao: number | null; tem_dimensao_variavel: boolean
}

type MaterialCalculado = {
  insumo_id: number
  nome: string
  unidade: string
  quantidade_calculada: number
}

const STATUS_ORDEM = ['AGUARDANDO', 'EM_ANDAMENTO', 'QUALIDADE', 'CONCLUIDO', 'CANCELADO']
const STATUS_ETAPA = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'PULADA']

const COR_STATUS: Record<string, string> = {
  AGUARDANDO: 'bg-amber-100 text-amber-800', EM_ANDAMENTO: 'bg-blue-100 text-blue-800',
  QUALIDADE: 'bg-purple-100 text-purple-800', CONCLUIDO: 'bg-green-100 text-green-800',
  CANCELADO: 'bg-red-100 text-red-800', PENDENTE: 'bg-slate-100 text-slate-600',
  CONCLUIDA: 'bg-green-100 text-green-800', PULADA: 'bg-slate-200 text-slate-500',
}

function formatDate(v: string | null) {
  if (!v) return '-'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function OrdemDetalhe({ ordemId }: { ordemId: number }) {
  const supabase = useMemo(() => createClient(), [])
  const [ordem, setOrdem] = useState<Ordem | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ responsavel: '', data_prevista: '', observacoes: '', produto_id: '', comprimento_pedido: '', largura_pedido: '', altura_pedido: '' })
  const [msg, setMsg] = useState('')
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([])
  const [materiais, setMateriais] = useState<MaterialCalculado[]>([])
  const [baixando, setBaixando] = useState(false)

  async function carregar() {
    const { data: ordemData } = await supabase
      .from('producao_ordens')
      .select('id,numero,status,produto,responsavel,data_prevista,data_conclusao,observacoes,created_at,produto_id,comprimento_pedido,largura_pedido,altura_pedido,materiais_calculados,leads(id,nome_cliente,nome_empresa,telefone,vendedor,produto_interesse,valor_orcamento),pos_vendas(id,status_pos_venda)')
      .eq('id', ordemId)
      .single()

    const { data: etapasData } = await supabase
      .from('producao_etapas')
      .select('id,nome,sequencia,status,responsavel,data_inicio,data_conclusao,observacoes')
      .eq('ordem_id', ordemId)
      .order('sequencia')

    const { data: produtosData } = await supabase
      .from('producao_produtos')
      .select('id,nome,comprimento_padrao,largura_padrao,altura_padrao,tem_dimensao_variavel')
      .eq('ativo', true)
      .order('nome')

    const ordemTyped = ordemData as unknown as Ordem
    setOrdem(ordemTyped)
    setEtapas(etapasData || [])
    setProdutos((produtosData || []) as ProdutoOpcao[])

    // Calcula materiais da ordem a partir da ficha técnica do produto vinculado
    if (ordemTyped?.produto_id) {
      const { data: ficha } = await supabase
        .from('producao_ficha_tecnica')
        .select('*, producao_insumos(nome, unidade), producao_produtos(nome, comprimento_padrao, largura_padrao, tem_dimensao_variavel)')
        .eq('produto_id', ordemTyped.produto_id)

      const calc: MaterialCalculado[] = (ficha || []).map((item: any) => ({
        insumo_id: item.insumo_id,
        nome: item.producao_insumos?.nome || `#${item.insumo_id}`,
        unidade: item.producao_insumos?.unidade || '',
        quantidade_calculada: calcularQuantidade(
          item,
          ordemTyped.comprimento_pedido,
          ordemTyped.largura_pedido,
          item.producao_produtos || { comprimento_padrao: null, largura_padrao: null, tem_dimensao_variavel: false }
        ),
      }))
      setMateriais(calc)
    } else {
      setMateriais([])
    }

    if (ordemData) {
      setForm({
        responsavel: ordemData.responsavel || '',
        data_prevista: ordemData.data_prevista || '',
        observacoes: ordemData.observacoes || '',
        produto_id: ordemTyped.produto_id != null ? String(ordemTyped.produto_id) : '',
        comprimento_pedido: ordemTyped.comprimento_pedido != null ? String(ordemTyped.comprimento_pedido) : '',
        largura_pedido: ordemTyped.largura_pedido != null ? String(ordemTyped.largura_pedido) : '',
        altura_pedido: ordemTyped.altura_pedido != null ? String(ordemTyped.altura_pedido) : '',
      })
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [ordemId])

  async function atualizarStatus(novoStatus: string) {
    setSalvando(true)
    setMsg('')
    const res = await fetch(`/api/producao/ordens/${ordemId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    })
    if (res.ok) { setMsg('Status atualizado!'); await carregar() }
    else { setMsg('Erro ao atualizar status.') }
    setSalvando(false)
  }

  async function atualizarEtapa(etapaId: number, novoStatus: string) {
    setSalvando(true)
    const res = await fetch(`/api/producao/ordens/${ordemId}/etapas/${etapaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    })
    if (res.ok) await carregar()
    setSalvando(false)
  }

  const produtoSelecionado = produtos.find((p) => String(p.id) === form.produto_id) || null

  async function salvarEdicao() {
    setSalvando(true)
    const temDim = produtoSelecionado?.tem_dimensao_variavel
    await supabase.from('producao_ordens').update({
      responsavel: form.responsavel,
      data_prevista: form.data_prevista || null,
      observacoes: form.observacoes,
      produto_id: form.produto_id ? Number(form.produto_id) : null,
      comprimento_pedido: temDim && form.comprimento_pedido ? Number(form.comprimento_pedido) : null,
      largura_pedido: temDim && form.largura_pedido ? Number(form.largura_pedido) : null,
      altura_pedido: temDim && form.altura_pedido ? Number(form.altura_pedido) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', ordemId)
    setEditando(false)
    setMsg('Ordem atualizada!')
    await carregar()
    setSalvando(false)
  }

  function selecionarProduto(idStr: string) {
    const p = produtos.find((x) => String(x.id) === idStr) || null
    setForm((f) => ({
      ...f,
      produto_id: idStr,
      comprimento_pedido: p?.tem_dimensao_variavel && p.comprimento_padrao != null ? String(p.comprimento_padrao) : '',
      largura_pedido: p?.tem_dimensao_variavel && p.largura_padrao != null ? String(p.largura_padrao) : '',
      altura_pedido: p?.tem_dimensao_variavel && p.altura_padrao != null ? String(p.altura_padrao) : '',
    }))
  }

  async function baixarEstoque() {
    if (!ordem || materiais.length === 0) return
    if (!confirm(`Deseja baixar ${materiais.length} insumo(s) do estoque? Esta ação não pode ser desfeita.`)) return
    setBaixando(true)
    setMsg('')
    const res = await fetch(`/api/producao/ordens/${ordemId}/baixar-estoque`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materiais: materiais.map((m) => ({ insumo_id: m.insumo_id, quantidade: m.quantidade_calculada, nome: m.nome })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setMsg('Estoque baixado com sucesso!')
      await carregar()
    } else if (json.insuficientes) {
      const lista = json.insuficientes
        .map((i: any) => `• ${i.nome}: precisa ${Number(i.precisa).toFixed(3)}, disponível ${Number(i.disponivel).toFixed(3)}`)
        .join('\n')
      setMsg(`⚠ Saldo insuficiente:\n${lista}`)
    } else {
      setMsg(json.error || 'Erro ao baixar estoque.')
    }
    setBaixando(false)
  }

  if (loading) return <div className="p-8 text-slate-400">Carregando...</div>
  if (!ordem) return <div className="p-8 text-red-500">Ordem não encontrada.</div>

  const lead = ordem.leads as any
  const posVenda = ordem.pos_vendas as any
  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
  const progresso = etapas.length ? Math.round((etapas.filter(e => e.status === 'CONCLUIDA' || e.status === 'PULADA').length / etapas.length) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/producao/ordens" className="text-sm text-slate-400 hover:text-slate-600">← Ordens</Link>
            <h1 className="text-2xl font-black text-[#0b1733]">{ordem.numero}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${COR_STATUS[ordem.status] || ''}`}>
              {ordem.status.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{ordem.produto || 'Produto não informado'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setEditando(!editando)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {editando ? 'Cancelar' : 'Editar'}
          </button>
        </div>
      </div>

      {msg && <div className={`whitespace-pre-line rounded-xl border px-4 py-2 text-sm ${msg.startsWith('⚠') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>{msg}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Etapas */}
          <div className={card}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0b1733]">Etapas de Produção</h2>
              <span className="text-sm font-semibold text-slate-500">{progresso}% concluído</span>
            </div>
            <div className="mb-4 h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-[#1b4fd6] transition-all" style={{ width: `${progresso}%` }} />
            </div>
            {etapas.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma etapa cadastrada para esta ordem.</p>
            ) : (
              <div className="space-y-2">
                {etapas.map((etapa, idx) => (
                  <div key={etapa.id} className={`rounded-xl border p-4 ${etapa.status === 'CONCLUIDA' ? 'border-green-200 bg-green-50' : etapa.status === 'PULADA' ? 'border-slate-200 bg-slate-50 opacity-60' : etapa.status === 'EM_ANDAMENTO' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{idx + 1}</span>
                        <span className={`text-sm font-semibold ${etapa.status === 'CONCLUIDA' ? 'line-through text-slate-400' : 'text-[#0b1733]'}`}>{etapa.nome}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_STATUS[etapa.status] || ''}`}>{etapa.status.replace('_', ' ')}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {STATUS_ETAPA.filter((s) => s !== etapa.status).map((s) => (
                          <button
                            key={s}
                            onClick={() => atualizarEtapa(etapa.id, s)}
                            disabled={salvando}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {s.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(etapa.data_inicio || etapa.data_conclusao) && (
                      <div className="mt-2 flex gap-4 text-xs text-slate-500">
                        {etapa.data_inicio && <span>Início: {formatDate(etapa.data_inicio)}</span>}
                        {etapa.data_conclusao && <span>Conclusão: {formatDate(etapa.data_conclusao)}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Atualizar status da ordem */}
          <div className={card}>
            <h2 className="mb-4 text-lg font-bold text-[#0b1733]">Status da Ordem</h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDEM.map((s) => (
                <button
                  key={s}
                  onClick={() => atualizarStatus(s)}
                  disabled={salvando || ordem.status === s}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${ordem.status === s ? 'bg-[#0b1733] text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Info da ordem */}
          <div className={card}>
            <h2 className="mb-3 text-base font-bold text-[#0b1733]">Detalhes</h2>
            {editando ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Responsável</label>
                  <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Prazo previsto</label>
                  <input type="date" value={form.data_prevista} onChange={(e) => setForm({ ...form, data_prevista: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Observações</label>
                  <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Produto fabricado</label>
                  <select value={form.produto_id} onChange={(e) => selecionarProduto(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                    <option value="">—</option>
                    {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                {produtoSelecionado?.tem_dimensao_variavel && (
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Compr. (m)</label>
                      <input type="number" step="0.01" value={form.comprimento_pedido} onChange={(e) => setForm({ ...form, comprimento_pedido: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Largura (m)</label>
                      <input type="number" step="0.01" value={form.largura_pedido} onChange={(e) => setForm({ ...form, largura_pedido: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Altura (m)</label>
                      <input type="number" step="0.01" value={form.altura_pedido} onChange={(e) => setForm({ ...form, altura_pedido: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                  </div>
                )}
                <button onClick={salvarEdicao} disabled={salvando} className="w-full rounded-xl bg-[#0b1733] py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-60">
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Responsável</dt><dd className="font-semibold">{ordem.responsavel || '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Prazo</dt><dd className="font-semibold">{formatDate(ordem.data_prevista)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Criada em</dt><dd className="font-semibold">{formatDate(ordem.created_at)}</dd></div>
                {posVenda && <div className="flex justify-between"><dt className="text-slate-500">Pós-vendas</dt><dd className="font-semibold">{posVenda.status_pos_venda}</dd></div>}
                {ordem.observacoes && <div><dt className="text-slate-500">Observações</dt><dd className="mt-1 text-slate-700">{ordem.observacoes}</dd></div>}
              </dl>
            )}
          </div>

          {/* Cliente */}
          {lead && (
            <div className={card}>
              <h2 className="mb-3 text-base font-bold text-[#0b1733]">Cliente</h2>
              <dl className="space-y-2 text-sm">
                <div><dt className="text-slate-500">Nome</dt><dd className="font-semibold">{lead.nome_cliente}</dd></div>
                {lead.nome_empresa && <div><dt className="text-slate-500">Empresa</dt><dd>{lead.nome_empresa}</dd></div>}
                {lead.telefone && <div><dt className="text-slate-500">Telefone</dt><dd>{lead.telefone}</dd></div>}
                {lead.vendedor && <div><dt className="text-slate-500">Vendedor</dt><dd>{lead.vendedor}</dd></div>}
                {lead.valor_orcamento && <div><dt className="text-slate-500">Valor orçamento</dt><dd className="font-semibold text-green-700">{Number(lead.valor_orcamento).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>}
              </dl>
              <Link href={`/leads`} className="mt-3 block text-xs font-semibold text-[#1b4fd6] hover:underline">Ver lead no CRM →</Link>
            </div>
          )}

          {/* Materiais da Ordem */}
          {ordem.produto_id && (
            <div className={card}>
              <h2 className="mb-3 text-base font-bold text-[#0b1733]">Materiais da Ordem</h2>
              {(() => {
                const prod = produtos.find((p) => p.id === ordem.produto_id)
                const temDim = prod?.tem_dimensao_variavel
                return (
                  <>
                    {prod && <p className="text-sm text-slate-700"><span className="text-slate-500">Produto:</span> {prod.nome}</p>}
                    {temDim && ordem.comprimento_pedido && ordem.largura_pedido && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Dimensões: {Number(ordem.comprimento_pedido).toLocaleString('pt-BR')}m × {Number(ordem.largura_pedido).toLocaleString('pt-BR')}m
                        {prod.comprimento_padrao && prod.largura_padrao && (
                          <span className="text-slate-400"> (padrão: {Number(prod.comprimento_padrao).toLocaleString('pt-BR')}m × {Number(prod.largura_padrao).toLocaleString('pt-BR')}m)</span>
                        )}
                      </p>
                    )}
                  </>
                )
              })()}

              {materiais.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">Nenhum insumo na ficha técnica deste produto.</p>
              ) : (
                <table className="mt-3 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                      <th className="py-1.5 pr-2">Insumo</th>
                      <th className="py-1.5 pr-2 text-right">Qtd</th>
                      <th className="py-1.5">Un.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.map((m) => (
                      <tr key={m.insumo_id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 font-medium text-[#0b1733]">{m.nome}</td>
                        <td className="py-1.5 pr-2 text-right text-slate-700">{m.quantidade_calculada.toFixed(3)}</td>
                        <td className="py-1.5 text-slate-500">{m.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {ordem.materiais_calculados ? (
                <p className="mt-3 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs font-semibold text-green-700">✓ Estoque baixado para esta ordem</p>
              ) : ordem.status !== 'CONCLUIDO' && materiais.length > 0 ? (
                <button onClick={baixarEstoque} disabled={baixando}
                  className="mt-3 w-full rounded-xl bg-[#0b1733] py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-60">
                  {baixando ? 'Baixando...' : 'Baixar Estoque desta Ordem'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
