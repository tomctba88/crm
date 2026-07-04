'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'

type Insumo = { id: number; nome: string; descricao: string | null; unidade: string; ativo: boolean }
type Estoque = { id: number; insumo_id: number; quantidade_atual: number; ponto_reposicao: number; custo_unitario: number | null }
type Movimento = {
  id: number
  insumo_id: number
  tipo: string
  quantidade: number
  ordem_id: number | null
  observacao: string | null
  created_at: string
  producao_insumos: { nome: string; unidade: string } | null
}

const UNIDADES = ['un', 'm', 'm²', 'kg', 'l', 'cm', 'par']

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada de compra',
  entrada_ajuste: 'Ajuste +',
  saida_ajuste: 'Ajuste −',
  saida_producao: 'Saída (produção)',
}

const TIPO_COR: Record<string, string> = {
  entrada: 'bg-green-100 text-green-800',
  entrada_ajuste: 'bg-emerald-100 text-emerald-800',
  saida_ajuste: 'bg-amber-100 text-amber-800',
  saida_producao: 'bg-blue-100 text-blue-800',
}

function formatDateTime(v: string) {
  const d = new Date(v)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmt(n: number) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'
const btnSecundario = 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'

export default function EstoqueManager() {
  const supabase = useMemo(() => createClient(), [])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [estoques, setEstoques] = useState<Estoque[]>([])
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // Edição inline de insumo
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ nome: '', unidade: 'un', ponto_reposicao: '', custo_unitario: '' })

  // Movimentação
  const [mov, setMov] = useState({ tipo: 'entrada', insumo_id: '', quantidade: '', observacao: '' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [{ data: ins }, { data: est }, { data: movs }] = await Promise.all([
      supabase.from('producao_insumos').select('*').order('nome'),
      supabase.from('producao_estoque_insumos').select('*'),
      supabase.from('producao_movimentos_estoque').select('*, producao_insumos(nome, unidade)').order('id', { ascending: false }).limit(50),
    ])
    setInsumos(ins || [])
    setEstoques(est || [])
    setMovimentos((movs || []) as unknown as Movimento[])
    setLoading(false)
  }

  function estoqueDe(insumoId: number): Estoque | undefined {
    return estoques.find((e) => e.insumo_id === insumoId)
  }

  function flash(tipo: 'ok' | 'erro', texto: string) {
    setMsg({ tipo, texto })
    setTimeout(() => setMsg(null), 4000)
  }

  function iniciarEdicao(ins: Insumo) {
    const est = estoqueDe(ins.id)
    setEditId(ins.id)
    setEditForm({
      nome: ins.nome,
      unidade: ins.unidade,
      ponto_reposicao: est ? String(est.ponto_reposicao) : '0',
      custo_unitario: est?.custo_unitario != null ? String(est.custo_unitario) : '',
    })
  }

  async function salvarEdicao(insumoId: number) {
    if (!editForm.nome.trim()) return
    setSalvando(true)
    await supabase.from('producao_insumos')
      .update({ nome: editForm.nome.trim(), unidade: editForm.unidade, updated_at: new Date().toISOString() })
      .eq('id', insumoId)
    const est = estoqueDe(insumoId)
    const patch = {
      ponto_reposicao: Number(editForm.ponto_reposicao) || 0,
      custo_unitario: editForm.custo_unitario === '' ? null : Number(editForm.custo_unitario),
      updated_at: new Date().toISOString(),
    }
    if (est) {
      await supabase.from('producao_estoque_insumos').update(patch).eq('insumo_id', insumoId)
    } else {
      await supabase.from('producao_estoque_insumos').insert({ insumo_id: insumoId, quantidade_atual: 0, ...patch })
    }
    setEditId(null)
    flash('ok', 'Insumo atualizado!')
    await carregar()
    setSalvando(false)
  }

  async function toggleAtivo(ins: Insumo) {
    await supabase.from('producao_insumos').update({ ativo: !ins.ativo }).eq('id', ins.id)
    await carregar()
  }

  // ---- Movimentação -------------------------------------------------------
  async function registrarMovimento() {
    const insumoId = Number(mov.insumo_id)
    const qtd = Number(mov.quantidade)
    if (!insumoId || !qtd || qtd <= 0) { flash('erro', 'Selecione um insumo e informe uma quantidade válida.'); return }

    const est = estoqueDe(insumoId)
    const atual = est ? Number(est.quantidade_atual) : 0
    const entrada = mov.tipo === 'entrada' || mov.tipo === 'entrada_ajuste'

    if (!entrada && qtd > atual) {
      flash('erro', `Saldo insuficiente. Disponível: ${fmt(atual)}.`)
      return
    }

    setSalvando(true)
    const { data: userData } = await supabase.auth.getUser()

    const { error: movErr } = await supabase.from('producao_movimentos_estoque').insert({
      insumo_id: insumoId,
      tipo: mov.tipo,
      quantidade: qtd,
      observacao: mov.observacao.trim() || null,
      created_by: userData.user?.email || null,
    })
    if (movErr) { flash('erro', 'Erro ao registrar movimento.'); setSalvando(false); return }

    const novoSaldo = entrada ? atual + qtd : atual - qtd
    if (est) {
      await supabase.from('producao_estoque_insumos').update({ quantidade_atual: novoSaldo, updated_at: new Date().toISOString() }).eq('insumo_id', insumoId)
    } else {
      await supabase.from('producao_estoque_insumos').insert({ insumo_id: insumoId, quantidade_atual: novoSaldo })
    }

    setMov({ tipo: 'entrada', insumo_id: '', quantidade: '', observacao: '' })
    flash('ok', 'Movimento registrado!')
    await carregar()
    setSalvando(false)
  }

  const insumosAtivos = insumos.filter((i) => i.ativo)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0b1733]">Estoque de Insumos</h1>
          <p className="text-sm text-slate-500">Saldos, ponto de reposição e movimentações</p>
        </div>
        <a href="/producao/produtos" className={btnSecundario}>+ Cadastrar insumo (Produtos)</a>
      </div>

      {msg && (
        <div className={`rounded-xl border px-4 py-2 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Tabela de insumos */}
      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">Insumos Cadastrados</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : insumos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum insumo cadastrado ainda. Cadastre na aba <a href="/producao/produtos" className="font-semibold text-[#1b4fd6] hover:underline">Produtos</a> (tipo Insumo).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Un.</th>
                  <th className="py-2 pr-3">Saldo Atual</th>
                  <th className="py-2 pr-3">Ponto Reposição</th>
                  <th className="py-2 pr-3">Custo Un.</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((ins) => {
                  const est = estoqueDe(ins.id)
                  const saldo = est ? Number(est.quantidade_atual) : 0
                  const ponto = est ? Number(est.ponto_reposicao) : 0
                  const baixo = saldo < ponto
                  const emEdicao = editId === ins.id
                  return (
                    <tr key={ins.id} className={`border-b border-slate-100 ${!ins.ativo ? 'opacity-50' : ''}`}>
                      {emEdicao ? (
                        <>
                          <td className="py-2 pr-3"><input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className={`${input} w-full`} /></td>
                          <td className="py-2 pr-3">
                            <select value={editForm.unidade} onChange={(e) => setEditForm({ ...editForm, unidade: e.target.value })} className={input}>
                              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-3 text-slate-400">{fmt(saldo)}</td>
                          <td className="py-2 pr-3"><input type="number" step="0.001" value={editForm.ponto_reposicao} onChange={(e) => setEditForm({ ...editForm, ponto_reposicao: e.target.value })} className={`${input} w-24`} /></td>
                          <td className="py-2 pr-3"><input type="number" step="0.0001" value={editForm.custo_unitario} onChange={(e) => setEditForm({ ...editForm, custo_unitario: e.target.value })} className={`${input} w-24`} placeholder="—" /></td>
                          <td className="py-2 pr-3" />
                          <td className="py-2 pr-3">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => salvarEdicao(ins.id)} disabled={salvando} className="rounded-lg bg-green-500 px-2.5 py-1 text-xs font-semibold text-white">Salvar</button>
                              <button onClick={() => setEditId(null)} className="rounded-lg bg-slate-400 px-2.5 py-1 text-xs font-semibold text-white">Cancelar</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-3">
                            <div className="font-semibold text-[#0b1733]">{ins.nome}</div>
                            {ins.descricao && <div className="text-xs text-slate-400">{ins.descricao}</div>}
                          </td>
                          <td className="py-2 pr-3 text-slate-600">{ins.unidade}</td>
                          <td className={`py-2 pr-3 ${baixo ? 'font-bold text-red-600' : 'text-slate-700'}`}>{fmt(saldo)}</td>
                          <td className="py-2 pr-3 text-slate-600">{fmt(ponto)}</td>
                          <td className="py-2 pr-3 text-slate-600">{est?.custo_unitario != null ? Number(est.custo_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                          <td className="py-2 pr-3">
                            {baixo && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">⚠ Repor</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => iniciarEdicao(ins)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Editar</button>
                              <button onClick={() => toggleAtivo(ins)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">{ins.ativo ? 'Desativar' : 'Ativar'}</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SEÇÃO B — Movimentação */}
      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">Registrar Movimentação</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_1fr_140px_1fr]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Tipo de movimento</label>
            <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })} className={`${input} w-full`}>
              <option value="entrada">Entrada de compra</option>
              <option value="entrada_ajuste">Ajuste +</option>
              <option value="saida_ajuste">Ajuste −</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Insumo *</label>
            <select value={mov.insumo_id} onChange={(e) => setMov({ ...mov, insumo_id: e.target.value })} className={`${input} w-full`}>
              <option value="">Selecione...</option>
              {insumosAtivos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Quantidade *</label>
            <input type="number" step="0.001" value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} className={`${input} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Observação</label>
            <input value={mov.observacao} onChange={(e) => setMov({ ...mov, observacao: e.target.value })} className={`${input} w-full`} />
          </div>
        </div>
        <div className="mt-4">
          <button onClick={registrarMovimento} disabled={salvando} className={btnPrimario}>Registrar Movimento</button>
        </div>
      </div>

      {/* SEÇÃO C — Histórico */}
      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">Histórico de Movimentos <span className="text-sm font-normal text-slate-400">(últimos 50)</span></h2>
        {movimentos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum movimento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Insumo</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Quantidade</th>
                  <th className="py-2 pr-3">Ordem</th>
                  <th className="py-2 pr-3">Observação</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => {
                  const entrada = m.tipo === 'entrada' || m.tipo === 'entrada_ajuste'
                  const un = m.producao_insumos?.unidade || ''
                  return (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-600">{formatDateTime(m.created_at)}</td>
                      <td className="py-2 pr-3 font-medium text-[#0b1733]">{m.producao_insumos?.nome || `#${m.insumo_id}`}</td>
                      <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIPO_COR[m.tipo] || 'bg-slate-100 text-slate-600'}`}>{TIPO_LABEL[m.tipo] || m.tipo}</span></td>
                      <td className={`py-2 pr-3 font-semibold ${entrada ? 'text-green-700' : 'text-red-600'}`}>{entrada ? '+' : '−'}{fmt(m.quantidade)} {un}</td>
                      <td className="py-2 pr-3">{m.ordem_id ? <Link href={`/producao/ordens/${m.ordem_id}`} className="font-semibold text-[#1b4fd6] hover:underline">Ordem #{m.ordem_id}</Link> : '—'}</td>
                      <td className="py-2 pr-3 text-slate-500">{m.observacao || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
