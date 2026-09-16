'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { formatCurrency, formatNumero, num } from '@/lib/producao/indicadores'
import { areaDaChapa, custoM2, type Chapa } from '@/lib/producao/marcenaria'

/**
 * Cadastros da marcenaria:
 *   Chapas   → o material base; tem área e espessura (por isso não é revestimento)
 *   Fitas    → borda, cobrada em metro linear
 *   Máquinas → CNC e coladeira rendem por hora-máquina, não por pessoa
 */

type ChapaLinha = Chapa & { fornecedor: string | null; insumo_id: number | null; ativo: boolean }
type FitaLinha = {
  id: number; codigo: string | null; nome: string; cor_padrao: string
  largura_mm: number | string; espessura_mm: number | string
  custo_metro: number | string | null; rolo_metros: number | string | null
  chapa_id: number | null; fornecedor: string | null; insumo_id: number | null; ativo: boolean
}
type MaquinaLinha = {
  id: number; nome: string; tipo: string
  capacidade_hora: number | string | null; unidade_capacidade: string
  custo_hora: number | string | null; ativo: boolean
}
type Insumo = { id: number; nome: string; unidade: string }

const MATERIAIS = ['MDF', 'MDP', 'compensado', 'outro']
const TIPOS_MAQUINA = ['cnc', 'coladeira', 'seccionadora', 'furadeira', 'lixadeira', 'outro']
const UNIDADES = [
  { valor: 'chapas', rotulo: 'chapas/hora' },
  { valor: 'metros', rotulo: 'metros/hora' },
  { valor: 'pecas', rotulo: 'peças/hora' },
]

const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btn = 'rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50'
const th = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500'
const thNum = `${th} text-right`
const td = 'px-3 py-2 text-sm text-slate-700'
const tdNum = `${td} text-right tabular-nums`

export default function CadastrosMarcenaria({ secao }: { secao: 'chapas' | 'fitas' | 'maquinas' }) {
  if (secao === 'chapas') return <Chapas />
  if (secao === 'fitas') return <Fitas />
  return <Maquinas />
}

/* ========================================================================== */

function Chapas() {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<ChapaLinha[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    codigo: '', nome: '', material: 'MDF', cor_padrao: '',
    espessura_mm: '18', comprimento_mm: '2750', largura_mm: '1850',
    custo_chapa: '', fornecedor: '', insumo_id: '',
  })

  const carregar = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from('producao_chapas').select('*').order('nome'),
      supabase.from('producao_insumos').select('id,nome,unidade').eq('ativo', true).order('nome'),
    ])
    setLista((c.data || []) as ChapaLinha[])
    setInsumos(i.data || [])
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!form.nome.trim() || !form.cor_padrao.trim()) {
      setErro('Nome e cor/padrão são obrigatórios.')
      return
    }
    setSalvando(true); setErro('')
    const { error } = await supabase.from('producao_chapas').insert({
      codigo: form.codigo.trim() || null,
      nome: form.nome.trim(),
      material: form.material,
      cor_padrao: form.cor_padrao.trim(),
      espessura_mm: Number(form.espessura_mm) || 18,
      comprimento_mm: Number(form.comprimento_mm) || 2750,
      largura_mm: Number(form.largura_mm) || 1850,
      custo_chapa: form.custo_chapa ? Number(form.custo_chapa) : null,
      fornecedor: form.fornecedor.trim() || null,
      insumo_id: form.insumo_id ? Number(form.insumo_id) : null,
    })
    if (error) setErro(error.message)
    else {
      setForm({ ...form, codigo: '', nome: '', cor_padrao: '', custo_chapa: '' })
      await carregar()
    }
    setSalvando(false)
  }

  async function toggleAtivo(c: ChapaLinha) {
    await supabase.from('producao_chapas')
      .update({ ativo: !c.ativo, updated_at: new Date().toISOString() }).eq('id', c.id)
    await carregar()
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Nova chapa</h2>
        <p className="mb-4 text-xs text-slate-500">
          As medidas padrão já vêm preenchidas (2750 × 1850). O custo da chapa inteira é o que
          permite calcular o custo da sobra de nesting.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome (ex: Branco TX 18mm)" className={input} />
          <input value={form.cor_padrao} onChange={(e) => setForm({ ...form, cor_padrao: e.target.value })}
            placeholder="Cor / padrão (ex: Branco TX)" className={input} />
          <select value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} className={input}>
            {MATERIAIS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            placeholder="Código do fornecedor" className={input} />

          <label className="text-xs font-semibold text-slate-500">
            Espessura (mm)
            <input value={form.espessura_mm} onChange={(e) => setForm({ ...form, espessura_mm: e.target.value })}
              type="number" step="0.5" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Comprimento (mm)
            <input value={form.comprimento_mm} onChange={(e) => setForm({ ...form, comprimento_mm: e.target.value })}
              type="number" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Largura (mm)
            <input value={form.largura_mm} onChange={(e) => setForm({ ...form, largura_mm: e.target.value })}
              type="number" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Custo da chapa (R$)
            <input value={form.custo_chapa} onChange={(e) => setForm({ ...form, custo_chapa: e.target.value })}
              type="number" step="0.01" className={`${input} mt-1 w-full`} />
          </label>

          <input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            placeholder="Fornecedor" className={input} />
          <select value={form.insumo_id} onChange={(e) => setForm({ ...form, insumo_id: e.target.value })}
            className={`${input} lg:col-span-2`}>
            <option value="">Sem insumo vinculado (sem baixa de estoque)</option>
            {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
          </select>
          <button onClick={adicionar} disabled={salvando} className={btn}>Adicionar</button>
        </div>

        {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">
          Chapas <span className="font-normal text-slate-400">({lista.length})</span>
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma chapa cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Nome</th><th className={th}>Cor / padrão</th><th className={th}>Material</th>
                  <th className={thNum}>Esp.</th><th className={thNum}>Medidas (mm)</th>
                  <th className={thNum}>m²</th><th className={thNum}>Custo</th>
                  <th className={thNum}>R$/m²</th><th className={th}>Estoque</th><th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={`border-b border-slate-100 ${!c.ativo ? 'opacity-45' : ''}`}>
                    <td className={`${td} font-semibold`}>{c.nome}</td>
                    <td className={td}>{c.cor_padrao}</td>
                    <td className={td}>{c.material}</td>
                    <td className={tdNum}>{formatNumero(num(c.espessura_mm), 1)}</td>
                    <td className={tdNum}>{formatNumero(num(c.comprimento_mm), 0)} × {formatNumero(num(c.largura_mm), 0)}</td>
                    <td className={tdNum}>{formatNumero(areaDaChapa(c), 2)}</td>
                    <td className={tdNum}>{c.custo_chapa ? formatCurrency(num(c.custo_chapa)) : '—'}</td>
                    <td className={`${tdNum} font-semibold`}>{c.custo_chapa ? formatCurrency(custoM2(c)) : '—'}</td>
                    <td className={td}>
                      {c.insumo_id
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">vinculado</span>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className={td}>
                      <button onClick={() => toggleAtivo(c)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white ${c.ativo ? 'bg-amber-500' : 'bg-green-500'}`}>
                        {c.ativo ? 'Desativar' : 'Ativar'}
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

function Fitas() {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<FitaLinha[]>([])
  const [chapas, setChapas] = useState<{ id: number; nome: string }[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    codigo: '', nome: '', cor_padrao: '', largura_mm: '22', espessura_mm: '0.45',
    custo_metro: '', rolo_metros: '', chapa_id: '', fornecedor: '', insumo_id: '',
  })

  const carregar = useCallback(async () => {
    const [f, c, i] = await Promise.all([
      supabase.from('producao_fitas').select('*').order('nome'),
      supabase.from('producao_chapas').select('id,nome').eq('ativo', true).order('nome'),
      supabase.from('producao_insumos').select('id,nome,unidade').eq('ativo', true).order('nome'),
    ])
    setLista((f.data || []) as FitaLinha[])
    setChapas(c.data || [])
    setInsumos(i.data || [])
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!form.nome.trim() || !form.cor_padrao.trim()) {
      setErro('Nome e cor/padrão são obrigatórios.')
      return
    }
    setSalvando(true); setErro('')
    const { error } = await supabase.from('producao_fitas').insert({
      codigo: form.codigo.trim() || null,
      nome: form.nome.trim(),
      cor_padrao: form.cor_padrao.trim(),
      largura_mm: Number(form.largura_mm) || 22,
      espessura_mm: Number(form.espessura_mm) || 0.45,
      custo_metro: form.custo_metro ? Number(form.custo_metro) : null,
      rolo_metros: form.rolo_metros ? Number(form.rolo_metros) : null,
      chapa_id: form.chapa_id ? Number(form.chapa_id) : null,
      fornecedor: form.fornecedor.trim() || null,
      insumo_id: form.insumo_id ? Number(form.insumo_id) : null,
    })
    if (error) setErro(error.message)
    else {
      setForm({ ...form, codigo: '', nome: '', cor_padrao: '', custo_metro: '' })
      await carregar()
    }
    setSalvando(false)
  }

  async function toggleAtivo(f: FitaLinha) {
    await supabase.from('producao_fitas')
      .update({ ativo: !f.ativo, updated_at: new Date().toISOString() }).eq('id', f.id)
    await carregar()
  }

  const nomeChapa = new Map(chapas.map((c) => [c.id, c.nome]))

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Nova fita de borda</h2>
        <p className="mb-4 text-xs text-slate-500">
          Fita se mede em metro linear. Vincular à chapa combinante só serve para pré-selecionar
          a fita certa quando você cadastrar as peças.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome (ex: Fita Branco TX)" className={input} />
          <input value={form.cor_padrao} onChange={(e) => setForm({ ...form, cor_padrao: e.target.value })}
            placeholder="Cor / padrão" className={input} />
          <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            placeholder="Código do fornecedor" className={input} />
          <input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            placeholder="Fornecedor" className={input} />

          <label className="text-xs font-semibold text-slate-500">
            Largura (mm)
            <input value={form.largura_mm} onChange={(e) => setForm({ ...form, largura_mm: e.target.value })}
              type="number" step="0.5" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Espessura (mm)
            <input value={form.espessura_mm} onChange={(e) => setForm({ ...form, espessura_mm: e.target.value })}
              type="number" step="0.05" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Custo por metro (R$)
            <input value={form.custo_metro} onChange={(e) => setForm({ ...form, custo_metro: e.target.value })}
              type="number" step="0.01" className={`${input} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Metros por rolo
            <input value={form.rolo_metros} onChange={(e) => setForm({ ...form, rolo_metros: e.target.value })}
              type="number" step="1" className={`${input} mt-1 w-full`} />
          </label>

          <select value={form.chapa_id} onChange={(e) => setForm({ ...form, chapa_id: e.target.value })} className={input}>
            <option value="">Chapa combinante (opcional)</option>
            {chapas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={form.insumo_id} onChange={(e) => setForm({ ...form, insumo_id: e.target.value })}
            className={`${input} lg:col-span-2`}>
            <option value="">Sem insumo vinculado</option>
            {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
          </select>
          <button onClick={adicionar} disabled={salvando} className={btn}>Adicionar</button>
        </div>

        {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">
          Fitas <span className="font-normal text-slate-400">({lista.length})</span>
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma fita cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Nome</th><th className={th}>Cor / padrão</th>
                  <th className={thNum}>Largura</th><th className={thNum}>R$/m</th>
                  <th className={thNum}>Rolo (m)</th><th className={th}>Chapa combinante</th><th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} className={`border-b border-slate-100 ${!f.ativo ? 'opacity-45' : ''}`}>
                    <td className={`${td} font-semibold`}>{f.nome}</td>
                    <td className={td}>{f.cor_padrao}</td>
                    <td className={tdNum}>{formatNumero(num(f.largura_mm), 1)} mm</td>
                    <td className={tdNum}>{f.custo_metro ? formatCurrency(num(f.custo_metro)) : '—'}</td>
                    <td className={tdNum}>{f.rolo_metros ? formatNumero(num(f.rolo_metros), 0) : '—'}</td>
                    <td className={td}>{f.chapa_id ? nomeChapa.get(f.chapa_id) || '—' : '—'}</td>
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

function Maquinas() {
  const supabase = useMemo(() => createClient(), [])
  const [lista, setLista] = useState<MaquinaLinha[]>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    nome: '', tipo: 'cnc', capacidade_hora: '', unidade_capacidade: 'chapas', custo_hora: '',
  })

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('producao_maquinas').select('*').order('nome')
    setLista((data || []) as MaquinaLinha[])
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!form.nome.trim()) { setErro('Informe o nome da máquina.'); return }
    setSalvando(true); setErro('')
    const { error } = await supabase.from('producao_maquinas').insert({
      nome: form.nome.trim(),
      tipo: form.tipo,
      capacidade_hora: form.capacidade_hora ? Number(form.capacidade_hora) : null,
      unidade_capacidade: form.unidade_capacidade,
      custo_hora: form.custo_hora ? Number(form.custo_hora) : null,
    })
    if (error) setErro(error.message)
    else {
      setForm({ ...form, nome: '', capacidade_hora: '', custo_hora: '' })
      await carregar()
    }
    setSalvando(false)
  }

  async function toggleAtivo(m: MaquinaLinha) {
    await supabase.from('producao_maquinas')
      .update({ ativo: !m.ativo, updated_at: new Date().toISOString() }).eq('id', m.id)
    await carregar()
  }

  const rotuloUnidade = (u: string) => UNIDADES.find((x) => x.valor === u)?.rotulo || u

  return (
    <div className="space-y-5">
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Nova máquina</h2>
        <p className="mb-4 text-xs text-slate-500">
          A capacidade é o rendimento esperado por hora. O sistema compara o realizado com ela
          para mostrar a eficiência — deixe em branco se não souber.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome (ex: CNC Router 1)" className={`${input} lg:col-span-2`} />
          <select value={form.tipo} onChange={(e) => {
            const tipo = e.target.value
            // coladeira rende em metro linear; o resto, em chapa
            const unidade = tipo === 'coladeira' ? 'metros' : tipo === 'cnc' || tipo === 'seccionadora' ? 'chapas' : 'pecas'
            setForm({ ...form, tipo, unidade_capacidade: unidade })
          }} className={input}>
            {TIPOS_MAQUINA.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.unidade_capacidade}
            onChange={(e) => setForm({ ...form, unidade_capacidade: e.target.value })} className={input}>
            {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
          </select>
          <input value={form.capacidade_hora} onChange={(e) => setForm({ ...form, capacidade_hora: e.target.value })}
            type="number" step="0.1" placeholder="Capacidade/hora" className={input} />
          <input value={form.custo_hora} onChange={(e) => setForm({ ...form, custo_hora: e.target.value })}
            type="number" step="0.01" placeholder="Custo/hora (R$)" className={input} />
          <button onClick={adicionar} disabled={salvando} className={btn}>Adicionar</button>
        </div>

        {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">
          Máquinas <span className="font-normal text-slate-400">({lista.filter((m) => m.ativo).length} ativas)</span>
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma máquina cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Nome</th><th className={th}>Tipo</th>
                  <th className={thNum}>Capacidade</th><th className={thNum}>Custo/hora</th><th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className={`border-b border-slate-100 ${!m.ativo ? 'opacity-45' : ''}`}>
                    <td className={`${td} font-semibold`}>{m.nome}</td>
                    <td className={td}>{m.tipo}</td>
                    <td className={tdNum}>
                      {m.capacidade_hora
                        ? `${formatNumero(num(m.capacidade_hora), 1)} ${rotuloUnidade(m.unidade_capacidade)}`
                        : '—'}
                    </td>
                    <td className={tdNum}>{m.custo_hora ? formatCurrency(num(m.custo_hora)) : '—'}</td>
                    <td className={td}>
                      <button onClick={() => toggleAtivo(m)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white ${m.ativo ? 'bg-amber-500' : 'bg-green-500'}`}>
                        {m.ativo ? 'Desativar' : 'Ativar'}
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
