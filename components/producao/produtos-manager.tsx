'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { calcularQuantidade, ESCALONAMENTO_LABEL } from '@/lib/producao/calcular-materiais'

type TipoProduto = { id: number; nome: string; ativo: boolean }

type Produto = {
  id: number
  nome: string
  descricao: string | null
  tipo_produto_id: number | null
  comprimento_padrao: number | null
  largura_padrao: number | null
  altura_padrao: number | null
  tem_dimensao_variavel: boolean
  ativo: boolean
  producao_tipos_produto: { nome: string } | null
}

type FichaTecnicaItem = {
  id: number
  insumo_id: number
  quantidade_padrao: number
  dimensao_afetada: string
  observacao: string | null
  producao_insumos: { id: number; nome: string; unidade: string }
}

type Insumo = { id: number; nome: string; unidade: string; ativo: boolean }

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'
const btnSecundario = 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'

const ESCALONAMENTOS = [
  { valor: 'fixo', label: 'Fixo (não escala)' },
  { valor: 'comprimento', label: 'Escala com comprimento' },
  { valor: 'largura', label: 'Escala com largura' },
  { valor: 'area', label: 'Escala com área (C×L)' },
]

function fmt(n: number) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

const PRODUTO_VAZIO = {
  nome: '', descricao: '', tipo_produto_id: '' as string,
  tem_dimensao_variavel: false, comprimento_padrao: '', largura_padrao: '', altura_padrao: '',
}

export default function ProdutosManager() {
  const supabase = useMemo(() => createClient(), [])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [contagens, setContagens] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // Modal de produto
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...PRODUTO_VAZIO })

  // Painel ficha técnica
  const [fichaProduto, setFichaProduto] = useState<Produto | null>(null)
  const [ficha, setFicha] = useState<FichaTecnicaItem[]>([])
  const [novoItem, setNovoItem] = useState({ insumo_id: '', quantidade_padrao: '', dimensao_afetada: 'fixo', observacao: '' })

  // Simulador
  const [simC, setSimC] = useState('')
  const [simL, setSimL] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [{ data: prods }, { data: tp }, { data: ins }, { data: fichas }] = await Promise.all([
      supabase.from('producao_produtos').select('*, producao_tipos_produto(nome)').order('nome'),
      supabase.from('producao_tipos_produto').select('*').eq('ativo', true).order('nome'),
      supabase.from('producao_insumos').select('id, nome, unidade, ativo').order('nome'),
      supabase.from('producao_ficha_tecnica').select('produto_id'),
    ])
    setProdutos((prods || []) as unknown as Produto[])
    setTipos(tp || [])
    setInsumos(ins || [])
    const cont: Record<number, number> = {}
    for (const f of fichas || []) cont[(f as { produto_id: number }).produto_id] = (cont[(f as { produto_id: number }).produto_id] || 0) + 1
    setContagens(cont)
    setLoading(false)
  }

  function flash(tipo: 'ok' | 'erro', texto: string) {
    setMsg({ tipo, texto })
    setTimeout(() => setMsg(null), 4000)
  }

  // ---- Modal de produto ---------------------------------------------------
  function abrirNovo() {
    setEditandoId(null)
    setForm({ ...PRODUTO_VAZIO })
    setModalAberto(true)
  }

  function abrirEdicao(p: Produto) {
    setEditandoId(p.id)
    setForm({
      nome: p.nome,
      descricao: p.descricao || '',
      tipo_produto_id: p.tipo_produto_id != null ? String(p.tipo_produto_id) : '',
      tem_dimensao_variavel: p.tem_dimensao_variavel,
      comprimento_padrao: p.comprimento_padrao != null ? String(p.comprimento_padrao) : '',
      largura_padrao: p.largura_padrao != null ? String(p.largura_padrao) : '',
      altura_padrao: p.altura_padrao != null ? String(p.altura_padrao) : '',
    })
    setModalAberto(true)
  }

  async function salvarProduto() {
    if (!form.nome.trim()) { flash('erro', 'Nome é obrigatório.'); return }
    if (form.tem_dimensao_variavel) {
      const c = Number(form.comprimento_padrao)
      const l = Number(form.largura_padrao)
      if (!c || c <= 0 || !l || l <= 0) { flash('erro', 'Comprimento e largura padrão são obrigatórios (> 0) para produtos com dimensão variável.'); return }
    }
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      tipo_produto_id: form.tipo_produto_id ? Number(form.tipo_produto_id) : null,
      tem_dimensao_variavel: form.tem_dimensao_variavel,
      comprimento_padrao: form.tem_dimensao_variavel && form.comprimento_padrao ? Number(form.comprimento_padrao) : null,
      largura_padrao: form.tem_dimensao_variavel && form.largura_padrao ? Number(form.largura_padrao) : null,
      altura_padrao: form.tem_dimensao_variavel && form.altura_padrao ? Number(form.altura_padrao) : null,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editandoId) {
      ({ error } = await supabase.from('producao_produtos').update(payload).eq('id', editandoId))
    } else {
      ({ error } = await supabase.from('producao_produtos').insert(payload))
    }
    if (error) { flash('erro', 'Erro ao salvar produto.'); setSalvando(false); return }
    setModalAberto(false)
    flash('ok', 'Produto salvo!')
    await carregar()
    setSalvando(false)
  }

  async function toggleAtivoProduto(p: Produto) {
    await supabase.from('producao_produtos').update({ ativo: !p.ativo }).eq('id', p.id)
    await carregar()
  }

  // ---- Ficha técnica ------------------------------------------------------
  async function abrirFicha(p: Produto) {
    setFichaProduto(p)
    setSimC(p.comprimento_padrao != null ? String(p.comprimento_padrao) : '')
    setSimL(p.largura_padrao != null ? String(p.largura_padrao) : '')
    setNovoItem({ insumo_id: '', quantidade_padrao: '', dimensao_afetada: p.tem_dimensao_variavel ? 'fixo' : 'fixo', observacao: '' })
    await carregarFicha(p.id)
  }

  async function carregarFicha(produtoId: number) {
    const { data } = await supabase
      .from('producao_ficha_tecnica')
      .select('*, producao_insumos(id, nome, unidade)')
      .eq('produto_id', produtoId)
      .order('id')
    setFicha((data || []) as unknown as FichaTecnicaItem[])
  }

  function fecharFicha() {
    setFichaProduto(null)
    setFicha([])
  }

  async function adicionarItemFicha() {
    if (!fichaProduto) return
    const insumoId = Number(novoItem.insumo_id)
    const qtd = Number(novoItem.quantidade_padrao)
    if (!insumoId) { flash('erro', 'Selecione um insumo.'); return }
    if (!qtd || qtd <= 0) { flash('erro', 'Informe uma quantidade válida.'); return }
    setSalvando(true)
    const { error } = await supabase.from('producao_ficha_tecnica').insert({
      produto_id: fichaProduto.id,
      insumo_id: insumoId,
      quantidade_padrao: qtd,
      dimensao_afetada: fichaProduto.tem_dimensao_variavel ? novoItem.dimensao_afetada : 'fixo',
      observacao: novoItem.observacao.trim() || null,
    })
    if (error) {
      flash('erro', error.code === '23505' ? 'Este insumo já está na ficha.' : 'Erro ao adicionar insumo.')
      setSalvando(false)
      return
    }
    setNovoItem({ insumo_id: '', quantidade_padrao: '', dimensao_afetada: 'fixo', observacao: '' })
    await carregarFicha(fichaProduto.id)
    await carregar()
    setSalvando(false)
  }

  async function removerItemFicha(id: number) {
    if (!fichaProduto) return
    if (!confirm('Remover este insumo da ficha técnica?')) return
    await supabase.from('producao_ficha_tecnica').delete().eq('id', id)
    await carregarFicha(fichaProduto.id)
    await carregar()
  }

  const insumosAtivos = insumos.filter((i) => i.ativo)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0b1733]">Produtos Fabricados</h1>
          <p className="text-sm text-slate-500">Produtos, dimensões padrão e fichas técnicas de insumos</p>
        </div>
        <button onClick={abrirNovo} className={btnPrimario}>+ Novo Produto</button>
      </div>

      {msg && (
        <div className={`rounded-xl border px-4 py-2 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* SEÇÃO A — Lista de produtos */}
      <div className={card}>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : produtos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum produto cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 760 }}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Dimensões Padrão</th>
                  <th className="py-2 pr-3">Variável?</th>
                  <th className="py-2 pr-3">Insumos</th>
                  <th className="py-2 pr-3">Ativo</th>
                  <th className="py-2 pr-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className={`border-b border-slate-100 ${!p.ativo ? 'opacity-50' : ''}`}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-[#0b1733]">{p.nome}</div>
                      {p.descricao && <div className="text-xs text-slate-400">{p.descricao}</div>}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{p.producao_tipos_produto?.nome || '—'}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {p.comprimento_padrao && p.largura_padrao ? `${fmt(p.comprimento_padrao)}m × ${fmt(p.largura_padrao)}m` : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.tem_dimensao_variavel ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>
                        {p.tem_dimensao_variavel ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{contagens[p.id] || 0} insumos</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.ativo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => abrirEdicao(p)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Editar</button>
                        <button onClick={() => abrirFicha(p)} className="rounded-lg bg-[#0b1733] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1b4fd6]">Ficha Técnica</button>
                        <button onClick={() => toggleAtivoProduto(p)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SEÇÃO B — Modal de produto */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalAberto(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-[#0b1733]">{editandoId ? 'Editar Produto' : 'Novo Produto'}</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Nome *</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={`${input} w-full`} placeholder="Ex: Mesa Escritório" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Descrição</label>
                <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className={`${input} w-full resize-none`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Tipo de produto</label>
                <select value={form.tipo_produto_id} onChange={(e) => setForm({ ...form, tipo_produto_id: e.target.value })} className={`${input} w-full`}>
                  <option value="">—</option>
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.tem_dimensao_variavel} onChange={(e) => setForm({ ...form, tem_dimensao_variavel: e.target.checked })} className="h-4 w-4" />
                <span className="text-sm font-semibold text-slate-700">Tem dimensão variável?</span>
              </label>
              {form.tem_dimensao_variavel && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Comprimento (m) *</label>
                      <input type="number" step="0.01" value={form.comprimento_padrao} onChange={(e) => setForm({ ...form, comprimento_padrao: e.target.value })} className={`${input} w-full`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Largura (m) *</label>
                      <input type="number" step="0.01" value={form.largura_padrao} onChange={(e) => setForm({ ...form, largura_padrao: e.target.value })} className={`${input} w-full`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Altura (m)</label>
                      <input type="number" step="0.01" value={form.altura_padrao} onChange={(e) => setForm({ ...form, altura_padrao: e.target.value })} className={`${input} w-full`} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">As dimensões padrão são a referência para calcular variações no pedido.</p>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModalAberto(false)} className={btnSecundario}>Cancelar</button>
              <button onClick={salvarProduto} disabled={salvando} className={btnPrimario}>Salvar Produto</button>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO C — Painel de ficha técnica (drawer lateral) */}
      {fichaProduto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={fecharFicha}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-slate-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={fecharFicha} className="mb-3 text-sm text-slate-400 hover:text-slate-600">← {fichaProduto.nome}</button>
            <h2 className="text-xl font-black text-[#0b1733]">Ficha Técnica</h2>
            <p className="text-sm text-slate-500">{ficha.length} insumo(s) cadastrado(s)</p>
            {fichaProduto.tem_dimensao_variavel && fichaProduto.comprimento_padrao && fichaProduto.largura_padrao && (
              <p className="mt-1 text-sm text-slate-500">Dimensões padrão: {fmt(fichaProduto.comprimento_padrao)}m × {fmt(fichaProduto.largura_padrao)}m</p>
            )}

            {/* Lista de insumos da ficha */}
            <div className={`${card} mt-4`}>
              {ficha.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum insumo na ficha ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                        <th className="py-2 pr-3">Insumo</th>
                        <th className="py-2 pr-3">Un.</th>
                        <th className="py-2 pr-3">Qtd Padrão</th>
                        <th className="py-2 pr-3">Escalonamento</th>
                        <th className="py-2 pr-3">Obs.</th>
                        <th className="py-2 pr-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ficha.map((it) => (
                        <tr key={it.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-medium text-[#0b1733]">{it.producao_insumos.nome}</td>
                          <td className="py-2 pr-3 text-slate-600">{it.producao_insumos.unidade}</td>
                          <td className="py-2 pr-3 text-slate-700">{Number(it.quantidade_padrao).toFixed(3)}</td>
                          <td className="py-2 pr-3 text-slate-600">{ESCALONAMENTO_LABEL[it.dimensao_afetada] || it.dimensao_afetada}</td>
                          <td className="py-2 pr-3 text-slate-500">{it.observacao || '—'}</td>
                          <td className="py-2 pr-3 text-right">
                            <button onClick={() => removerItemFicha(it.id)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remover</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Formulário para adicionar insumo */}
            <div className={`${card} mt-4`}>
              <h3 className="mb-3 text-sm font-bold text-[#0b1733]">Adicionar insumo à ficha</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Insumo *</label>
                  <select value={novoItem.insumo_id} onChange={(e) => setNovoItem({ ...novoItem, insumo_id: e.target.value })} className={`${input} w-full`}>
                    <option value="">Selecione...</option>
                    {insumosAtivos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Quantidade padrão *</label>
                  <input type="number" step="0.001" value={novoItem.quantidade_padrao} onChange={(e) => setNovoItem({ ...novoItem, quantidade_padrao: e.target.value })} className={`${input} w-full`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Escalonamento *</label>
                  <select
                    value={fichaProduto.tem_dimensao_variavel ? novoItem.dimensao_afetada : 'fixo'}
                    onChange={(e) => setNovoItem({ ...novoItem, dimensao_afetada: e.target.value })}
                    disabled={!fichaProduto.tem_dimensao_variavel}
                    className={`${input} w-full disabled:bg-slate-100 disabled:text-slate-400`}
                  >
                    {ESCALONAMENTOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Observação</label>
                  <input value={novoItem.observacao} onChange={(e) => setNovoItem({ ...novoItem, observacao: e.target.value })} className={`${input} w-full`} />
                </div>
              </div>
              <div className="mt-3">
                <button onClick={adicionarItemFicha} disabled={salvando} className={btnPrimario}>Adicionar à Ficha</button>
              </div>
            </div>

            {/* Simulador de variação */}
            {fichaProduto.tem_dimensao_variavel && (
              <div className={`${card} mt-4`}>
                <h3 className="mb-1 text-sm font-bold text-[#0b1733]">Simular pedido com dimensões diferentes</h3>
                <p className="mb-3 text-xs text-slate-500">Padrão: {fmt(fichaProduto.comprimento_padrao || 0)}m × {fmt(fichaProduto.largura_padrao || 0)}m</p>
                <div className="mb-4 flex flex-wrap gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Comprimento (m)</label>
                    <input type="number" step="0.01" value={simC} onChange={(e) => setSimC(e.target.value)} className={`${input} w-28`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Largura (m)</label>
                    <input type="number" step="0.01" value={simL} onChange={(e) => setSimL(e.target.value)} className={`${input} w-28`} />
                  </div>
                </div>
                {ficha.length === 0 ? (
                  <p className="text-sm text-slate-400">Adicione insumos para simular.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                          <th className="py-2 pr-3">Insumo</th>
                          <th className="py-2 pr-3">Qtd Padrão</th>
                          <th className="py-2 pr-3">Qtd Pedido</th>
                          <th className="py-2 pr-3">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ficha.map((it) => {
                          const qtdPedido = calcularQuantidade(
                            it,
                            simC ? Number(simC) : null,
                            simL ? Number(simL) : null,
                            fichaProduto
                          )
                          const dif = +(qtdPedido - Number(it.quantidade_padrao)).toFixed(4)
                          const un = it.producao_insumos.unidade
                          return (
                            <tr key={it.id} className="border-b border-slate-100">
                              <td className="py-2 pr-3 font-medium text-[#0b1733]">{it.producao_insumos.nome}</td>
                              <td className="py-2 pr-3 text-slate-600">{Number(it.quantidade_padrao).toFixed(3)} {un}</td>
                              <td className="py-2 pr-3 font-semibold text-slate-800">{qtdPedido.toFixed(3)} {un}</td>
                              <td className={`py-2 pr-3 font-semibold ${dif > 0 ? 'text-orange-600' : dif < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                {dif > 0 ? '+' : ''}{dif.toFixed(3)} {un}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
