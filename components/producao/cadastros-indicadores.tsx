'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

/**
 * Cadastros que alimentam os indicadores de produção:
 *   Revestimentos  → a "cor" dos relatórios de volume e o custo do material
 *   Estofadores    → a pessoa dos relatórios de produtividade
 *   Motivos        → o eixo do Pareto de perdas
 */

type Revestimento = {
  id: number
  codigo: string | null
  nome: string
  material: string
  cor: string
  fornecedor: string | null
  custo_metro: number | string | null
  insumo_id: number | null
  ativo: boolean
}

type Funcionario = {
  id: number
  nome: string
  funcao: string
  email: string | null
  jornada_horas: number | string
  ativo: boolean
}

type Motivo = { id: number; nome: string; categoria: string; ativo: boolean }
type Insumo = { id: number; nome: string; unidade: string }

const MATERIAIS = ['tecido', 'courino', 'couro', 'tela', 'outro']
const CATEGORIAS_MOTIVO = ['material', 'processo', 'maquina', 'fornecedor', 'projeto']

const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btnPrimario = 'rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50'
const th = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500'
const td = 'px-3 py-2 text-sm text-slate-700'

export default function CadastrosIndicadores({ secao }: { secao: 'revestimentos' | 'estofadores' | 'motivos' }) {
  if (secao === 'revestimentos') return <Revestimentos />
  if (secao === 'estofadores') return <Estofadores />
  return <Motivos />
}

/* ========================================================================== */

function Revestimentos() {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<Revestimento[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({
    codigo: '', nome: '', material: 'tecido', cor: '',
    fornecedor: '', custo_metro: '', insumo_id: '',
  })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [{ data: r }, { data: i }] = await Promise.all([
      supabase.from('producao_revestimentos').select('*').order('nome'),
      supabase.from('producao_insumos').select('id, nome, unidade').eq('ativo', true).order('nome'),
    ])
    setLista(r || [])
    setInsumos(i || [])
  }

  async function adicionar() {
    if (!form.nome.trim() || !form.cor.trim()) {
      setErro('Nome e cor são obrigatórios.')
      return
    }
    setSalvando(true)
    setErro('')
    const { error } = await supabase.from('producao_revestimentos').insert({
      codigo: form.codigo.trim() || null,
      nome: form.nome.trim(),
      material: form.material,
      cor: form.cor.trim(),
      fornecedor: form.fornecedor.trim() || null,
      custo_metro: form.custo_metro ? Number(form.custo_metro) : null,
      insumo_id: form.insumo_id ? Number(form.insumo_id) : null,
    })
    if (error) setErro(error.message)
    else {
      setForm({ codigo: '', nome: '', material: 'tecido', cor: '', fornecedor: '', custo_metro: '', insumo_id: '' })
      await carregar()
    }
    setSalvando(false)
  }

  async function toggleAtivo(r: Revestimento) {
    await supabase.from('producao_revestimentos')
      .update({ ativo: !r.ativo, updated_at: new Date().toISOString() }).eq('id', r.id)
    await carregar()
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Novo revestimento</h2>
        <p className="mb-4 text-xs text-slate-500">
          É daqui que sai a coluna &quot;cor&quot; dos relatórios. Ligue ao insumo quando o tecido
          também for controlado no estoque — assim a perda de material dá baixa sozinha.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome (ex: Courino Soft)" className={input} />
          <input value={form.cor} onChange={(e) => setForm({ ...form, cor: e.target.value })}
            placeholder="Cor (ex: Preto)" className={input} />
          <select value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} className={input}>
            {MATERIAIS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            placeholder="Código do fornecedor" className={input} />
          <input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            placeholder="Fornecedor" className={input} />
          <input value={form.custo_metro} onChange={(e) => setForm({ ...form, custo_metro: e.target.value })}
            type="number" step="0.01" placeholder="Custo por metro (R$)" className={input} />
          <select value={form.insumo_id} onChange={(e) => setForm({ ...form, insumo_id: e.target.value })} className={input}>
            <option value="">Sem insumo vinculado</option>
            {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
          </select>
          <button onClick={adicionar} disabled={salvando} className={btnPrimario}>Adicionar</button>
        </div>

        {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">
          Revestimentos <span className="font-normal text-slate-400">({lista.length})</span>
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum revestimento cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Nome</th><th className={th}>Cor</th><th className={th}>Material</th>
                  <th className={th}>Código</th><th className={th}>Fornecedor</th>
                  <th className={th}>Custo/m</th><th className={th}>Estoque</th><th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 ${!r.ativo ? 'opacity-45' : ''}`}>
                    <td className={`${td} font-semibold`}>{r.nome}</td>
                    <td className={td}>{r.cor}</td>
                    <td className={td}>{r.material}</td>
                    <td className={td}>{r.codigo || '—'}</td>
                    <td className={td}>{r.fornecedor || '—'}</td>
                    <td className={td}>
                      {r.custo_metro ? Number(r.custo_metro).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                    </td>
                    <td className={td}>
                      {r.insumo_id
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">vinculado</span>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className={td}>
                      <button onClick={() => toggleAtivo(r)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white ${r.ativo ? 'bg-amber-500' : 'bg-green-500'}`}>
                        {r.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================================== */

function Estofadores() {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<Funcionario[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({ nome: '', funcao: 'Estofador', email: '', jornada_horas: '8' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase.from('producao_funcionarios').select('*').order('nome')
    setLista(data || [])
  }

  async function adicionar() {
    if (!form.nome.trim()) { setErro('Informe o nome.'); return }
    setSalvando(true)
    setErro('')
    const { error } = await supabase.from('producao_funcionarios').insert({
      nome: form.nome.trim(),
      funcao: form.funcao.trim() || 'Estofador',
      email: form.email.trim() || null,
      jornada_horas: Number(form.jornada_horas) || 8,
    })
    if (error) setErro(error.message)
    else {
      setForm({ nome: '', funcao: 'Estofador', email: '', jornada_horas: '8' })
      await carregar()
    }
    setSalvando(false)
  }

  async function salvarJornada(id: number, horas: number) {
    await supabase.from('producao_funcionarios')
      .update({ jornada_horas: horas, updated_at: new Date().toISOString() }).eq('id', id)
    await carregar()
  }

  async function toggleAtivo(f: Funcionario) {
    await supabase.from('producao_funcionarios')
      .update({ ativo: !f.ativo, updated_at: new Date().toISOString() }).eq('id', f.id)
    await carregar()
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Novo estofador</h2>
        <p className="mb-4 text-xs text-slate-500">
          A jornada padrão é o denominador da taxa de ocupação: quanto da hora disponível
          virou peça. O e-mail só é necessário para quem for apontar no tablet.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome" className={`${input} lg:col-span-2`} />
          <input value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })}
            placeholder="Função" className={input} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="E-mail (opcional)" className={input} />
          <div className="flex gap-2">
            <input value={form.jornada_horas} onChange={(e) => setForm({ ...form, jornada_horas: e.target.value })}
              type="number" step="0.5" placeholder="Jornada" className={`${input} w-24`} />
            <button onClick={adicionar} disabled={salvando} className={`${btnPrimario} flex-1`}>Adicionar</button>
          </div>
        </div>

        {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">
          Equipe <span className="font-normal text-slate-400">({lista.filter((f) => f.ativo).length} ativos)</span>
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum funcionário cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Nome</th><th className={th}>Função</th>
                  <th className={th}>E-mail</th><th className={th}>Jornada (h/dia)</th><th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} className={`border-b border-slate-100 ${!f.ativo ? 'opacity-45' : ''}`}>
                    <td className={`${td} font-semibold`}>{f.nome}</td>
                    <td className={td}>{f.funcao}</td>
                    <td className={td}>{f.email || '—'}</td>
                    <td className={td}>
                      <input
                        defaultValue={String(f.jornada_horas)}
                        type="number" step="0.5"
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v > 0 && v !== Number(f.jornada_horas)) salvarJornada(f.id, v)
                        }}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className={td}>
                      <button onClick={() => toggleAtivo(f)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white ${f.ativo ? 'bg-amber-500' : 'bg-green-500'}`}>
                        {f.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================================== */

function Motivos() {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<Motivo[]>([])
  const [form, setForm] = useState({ nome: '', categoria: 'processo' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase.from('producao_motivos_perda').select('*').order('categoria').order('nome')
    setLista(data || [])
  }

  async function adicionar() {
    if (!form.nome.trim()) { setErro('Informe o motivo.'); return }
    setSalvando(true)
    setErro('')
    const { error } = await supabase.from('producao_motivos_perda')
      .insert({ nome: form.nome.trim(), categoria: form.categoria })
    if (error) setErro(error.message)
    else { setForm({ nome: '', categoria: 'processo' }); await carregar() }
    setSalvando(false)
  }

  async function toggleAtivo(m: Motivo) {
    await supabase.from('producao_motivos_perda').update({ ativo: !m.ativo }).eq('id', m.id)
    await carregar()
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Novo motivo de perda</h2>
        <p className="mb-4 text-xs text-slate-500">
          A categoria separa o que é culpa do processo do que é culpa do material ou do
          fornecedor — é o que diz onde agir depois de olhar o Pareto.
        </p>
        <div className="flex flex-wrap gap-3">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            placeholder="Descrição do motivo" className={`${input} min-w-[260px] flex-1`} />
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className={input}>
            {CATEGORIAS_MOTIVO.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={adicionar} disabled={salvando} className={btnPrimario}>Adicionar</button>
        </div>
        {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">Motivos cadastrados</h2>
        <div className="space-y-2">
          {lista.map((m) => (
            <div key={m.id}
              className={`flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 ${!m.ativo ? 'opacity-45' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{m.categoria}</span>
                <span className="text-sm font-medium text-slate-700">{m.nome}</span>
              </div>
              <button onClick={() => toggleAtivo(m)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white ${m.ativo ? 'bg-amber-500' : 'bg-green-500'}`}>
                {m.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
