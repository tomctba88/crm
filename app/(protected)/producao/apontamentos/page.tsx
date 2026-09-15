'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import {
  formatCurrency,
  formatNumero,
  formatarDataBR,
  horasDoApontamento,
  num,
  type ApontamentoIndicador,
} from '@/lib/producao/indicadores'

/**
 * Chão de fábrica: onde o dado dos indicadores é criado.
 *
 * Cronômetro   → o estofador toca Iniciar e Finalizar (hora real, peças/hora exato)
 * Lançamento   → o encarregado fecha o dia de cada um (mais simples de adotar)
 * Perda        → refugo de peça ou material estragado, com motivo e custo
 */

type Funcionario = { id: number; nome: string; funcao: string; ativo: boolean }
type Ordem = { id: number; numero: string; status: string; produto: string | null }
type ItemOrdem = { id: number; ordem_id: number; descricao: string | null; qtd_planejada: number | string }
type Etapa = { id: number; ordem_id: number; nome: string; sequencia: number; status: string }
type Motivo = { id: number; nome: string; categoria: string }
type Insumo = { id: number; nome: string; unidade: string }
type Revestimento = { id: number; nome: string; cor: string }

type ApontamentoLinha = ApontamentoIndicador & {
  origem: string
  observacao: string | null
  producao_funcionarios: { nome: string } | null
  producao_ordens: { numero: string } | null
}

type PerdaLinha = {
  id: number
  data_ref: string
  tipo: string
  quantidade: number | string
  unidade: string | null
  custo_estimado: number | string
  recuperavel: boolean
  observacao: string | null
  producao_motivos_perda: { nome: string } | null
  producao_funcionarios: { nome: string } | null
  producao_ordens: { numero: string } | null
}

const STATUS_ABERTOS = ['AGUARDANDO', 'EM_ANDAMENTO', 'QUALIDADE']

const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500'
const th = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500'
const td = 'px-3 py-2 text-sm text-slate-700'

const hojeISO = () => new Date().toISOString().slice(0, 10)

export default function ApontamentosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [aba, setAba] = useState<'producao' | 'perda'>('producao')

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [itens, setItens] = useState<ItemOrdem[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [revestimentos, setRevestimentos] = useState<Revestimento[]>([])
  const [apontamentos, setApontamentos] = useState<ApontamentoLinha[]>([])
  const [perdas, setPerdas] = useState<PerdaLinha[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const [f, o, i, e, m, ins, rev, ap, pe] = await Promise.all([
      supabase.from('producao_funcionarios').select('id,nome,funcao,ativo').eq('ativo', true).order('nome'),
      supabase.from('producao_ordens').select('id,numero,status,produto').in('status', STATUS_ABERTOS).order('id', { ascending: false }),
      supabase.from('producao_ordem_itens').select('id,ordem_id,descricao,qtd_planejada'),
      supabase.from('producao_etapas').select('id,ordem_id,nome,sequencia,status').order('sequencia'),
      supabase.from('producao_motivos_perda').select('id,nome,categoria').eq('ativo', true).order('nome'),
      supabase.from('producao_insumos').select('id,nome,unidade').eq('ativo', true).order('nome'),
      supabase.from('producao_revestimentos').select('id,nome,cor').eq('ativo', true).order('nome'),
      supabase.from('producao_apontamentos')
        .select('*, producao_funcionarios(nome), producao_ordens(numero)')
        .order('id', { ascending: false }).limit(40),
      supabase.from('producao_perdas')
        .select('*, producao_motivos_perda(nome), producao_funcionarios(nome), producao_ordens(numero)')
        .order('id', { ascending: false }).limit(40),
    ])

    setFuncionarios(f.data || [])
    setOrdens(o.data || [])
    setItens(i.data || [])
    setEtapas(e.data || [])
    setMotivos(m.data || [])
    setInsumos(ins.data || [])
    setRevestimentos(rev.data || [])
    setApontamentos((ap.data || []) as unknown as ApontamentoLinha[])
    setPerdas((pe.data || []) as unknown as PerdaLinha[])
    setCarregando(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  const semCadastro = !carregando && funcionarios.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[#0b1733]">Apontamentos</h1>
        <p className="text-sm text-slate-500">
          Registro do que a fábrica produziu e do que se perdeu — é o que alimenta os relatórios
        </p>
      </div>

      {semCadastro && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">
            Nenhum estofador cadastrado ainda.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Cadastre a equipe em <span className="font-semibold">Cadastros → Estofadores</span> antes de apontar produção.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([['producao', 'Apontar produção'], ['perda', 'Registrar perda']] as const).map(([chave, texto]) => (
          <button key={chave} onClick={() => setAba(chave)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              aba === chave ? 'bg-[#0b1733] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}>
            {texto}
          </button>
        ))}
      </div>

      {aba === 'producao' ? (
        <>
          <Cronometro funcionarios={funcionarios} ordens={ordens} itens={itens} etapas={etapas}
            apontamentos={apontamentos} onMudou={carregar} />
          <LancamentoDiario funcionarios={funcionarios} ordens={ordens} itens={itens} etapas={etapas}
            onMudou={carregar} />
          <ListaApontamentos apontamentos={apontamentos} onMudou={carregar} />
        </>
      ) : (
        <>
          <FormularioPerda funcionarios={funcionarios} ordens={ordens} itens={itens} etapas={etapas}
            motivos={motivos} insumos={insumos} revestimentos={revestimentos} onMudou={carregar} />
          <ListaPerdas perdas={perdas} onMudou={carregar} />
        </>
      )}
    </div>
  )
}

/* ==========================================================================
 * Cronômetro — tablet no chão de fábrica
 * ======================================================================== */

function Cronometro({ funcionarios, ordens, itens, etapas, apontamentos, onMudou }: {
  funcionarios: Funcionario[]
  ordens: Ordem[]
  itens: ItemOrdem[]
  etapas: Etapa[]
  apontamentos: ApontamentoLinha[]
  onMudou: () => Promise<void>
}) {
  const [funcionarioId, setFuncionarioId] = useState('')
  const [ordemId, setOrdemId] = useState('')
  const [itemId, setItemId] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [pecas, setPecas] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())

  // relógio de 1s só para o contador em andamento
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const emAndamento = apontamentos.filter((a) => a.inicio && !a.fim)
  const itensDaOrdem = itens.filter((i) => String(i.ordem_id) === ordemId)
  const etapasDaOrdem = etapas.filter((e) => String(e.ordem_id) === ordemId)

  async function iniciar() {
    if (!funcionarioId) { setErro('Selecione o estofador.'); return }
    setSalvando(true); setErro('')
    const resp = await fetch('/api/producao/apontamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcionario_id: Number(funcionarioId),
        origem: 'cronometro',
        ordem_id: ordemId || null,
        ordem_item_id: itemId || null,
        etapa_id: etapaId || null,
      }),
    })
    const json = await resp.json()
    if (!resp.ok) setErro(json.error || 'Não foi possível iniciar.')
    else { setItemId(''); setEtapaId(''); await onMudou() }
    setSalvando(false)
  }

  async function finalizar(id: number) {
    const qtd = Number(pecas)
    if (!Number.isFinite(qtd) || qtd < 0) { setErro('Informe quantas peças saíram.'); return }
    setSalvando(true); setErro('')
    const resp = await fetch('/api/producao/apontamentos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pecas: qtd }),
    })
    const json = await resp.json()
    if (!resp.ok) setErro(json.error || 'Não foi possível finalizar.')
    else { setPecas(''); await onMudou() }
    setSalvando(false)
  }

  function decorrido(inicio: string) {
    const ms = agora - new Date(inicio).getTime()
    if (ms < 0) return '00:00:00'
    const s = Math.floor(ms / 1000)
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((v) => String(v).padStart(2, '0')).join(':')
  }

  return (
    <div className={card}>
      <h2 className="mb-1 text-base font-bold text-[#0b1733]">Cronômetro</h2>
      <p className="mb-4 text-xs text-slate-500">
        Hora real de início e fim. É o modo que dá peças/hora exato — use no tablet da fábrica.
      </p>

      {emAndamento.length > 0 && (
        <div className="mb-5 space-y-3">
          {emAndamento.map((a) => (
            <div key={a.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#0b1733]">{a.producao_funcionarios?.nome || '—'}</p>
                  <p className="text-xs text-slate-600">
                    {a.producao_ordens?.numero ? `OP ${a.producao_ordens.numero} · ` : ''}
                    iniciado às {new Date(a.inicio!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="font-mono text-2xl font-black tabular-nums text-[#1b4fd6]">
                  {decorrido(a.inicio!)}
                </span>
                <div className="flex items-center gap-2">
                  <input value={pecas} onChange={(e) => setPecas(e.target.value)}
                    type="number" step="1" min="0" placeholder="peças"
                    className={`${input} w-24`} />
                  <button onClick={() => finalizar(a.id)} disabled={salvando}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    Finalizar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className={label}>Estofador</span>
          <select value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)} className={`${input} w-full`}>
            <option value="">Selecione...</option>
            {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Ordem</span>
          <select value={ordemId} onChange={(e) => { setOrdemId(e.target.value); setItemId(''); setEtapaId('') }}
            className={`${input} w-full`}>
            <option value="">Sem OP</option>
            {ordens.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.produto || 's/ descrição'}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Item</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={!ordemId} className={`${input} w-full disabled:bg-slate-50`}>
            <option value="">Todos</option>
            {itensDaOrdem.map((i) => <option key={i.id} value={i.id}>{i.descricao || `Item #${i.id}`}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Etapa</span>
          <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} disabled={!ordemId} className={`${input} w-full disabled:bg-slate-50`}>
            <option value="">Não informar</option>
            {etapasDaOrdem.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={iniciar} disabled={salvando || !funcionarioId}
            className="w-full rounded-xl bg-[#1b4fd6] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1741b0] disabled:opacity-50">
            Iniciar
          </button>
        </div>
      </div>

      {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
    </div>
  )
}

/* ==========================================================================
 * Lançamento diário — encarregado fecha o dia
 * ======================================================================== */

function LancamentoDiario({ funcionarios, ordens, itens, etapas, onMudou }: {
  funcionarios: Funcionario[]
  ordens: Ordem[]
  itens: ItemOrdem[]
  etapas: Etapa[]
  onMudou: () => Promise<void>
}) {
  const [form, setForm] = useState({
    funcionario_id: '', data_ref: hojeISO(), horas: '8', pecas: '',
    ordem_id: '', ordem_item_id: '', etapa_id: '', observacao: '',
  })
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)

  const itensDaOrdem = itens.filter((i) => String(i.ordem_id) === form.ordem_id)
  const etapasDaOrdem = etapas.filter((e) => String(e.ordem_id) === form.ordem_id)

  async function salvar() {
    setSalvando(true); setErro(''); setOk('')
    const resp = await fetch('/api/producao/apontamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcionario_id: Number(form.funcionario_id),
        origem: 'lancamento',
        data_ref: form.data_ref,
        horas: Number(form.horas),
        pecas: Number(form.pecas),
        ordem_id: form.ordem_id || null,
        ordem_item_id: form.ordem_item_id || null,
        etapa_id: form.etapa_id || null,
        observacao: form.observacao || null,
      }),
    })
    const json = await resp.json()
    if (!resp.ok) setErro(json.error || 'Não foi possível salvar.')
    else {
      setOk('Apontamento registrado.')
      setForm({ ...form, pecas: '', observacao: '', ordem_item_id: '', etapa_id: '' })
      await onMudou()
    }
    setSalvando(false)
  }

  return (
    <div className={card}>
      <h2 className="mb-1 text-base font-bold text-[#0b1733]">Lançamento do dia</h2>
      <p className="mb-4 text-xs text-slate-500">
        Para quem não aponta no tablet: horas trabalhadas e peças concluídas no dia.
        Peças/hora sai como média do dia — menos preciso que o cronômetro, mas suficiente para a tendência.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className={label}>Estofador</span>
          <select value={form.funcionario_id} onChange={(e) => setForm({ ...form, funcionario_id: e.target.value })}
            className={`${input} w-full`}>
            <option value="">Selecione...</option>
            {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Data</span>
          <input type="date" value={form.data_ref} onChange={(e) => setForm({ ...form, data_ref: e.target.value })}
            className={`${input} w-full`} />
        </div>
        <div>
          <span className={label}>Horas trabalhadas</span>
          <input type="number" step="0.5" min="0" max="24" value={form.horas}
            onChange={(e) => setForm({ ...form, horas: e.target.value })} className={`${input} w-full`} />
        </div>
        <div>
          <span className={label}>Peças concluídas</span>
          <input type="number" step="1" min="0" value={form.pecas} placeholder="0"
            onChange={(e) => setForm({ ...form, pecas: e.target.value })} className={`${input} w-full`} />
        </div>
        <div>
          <span className={label}>Ordem (opcional)</span>
          <select value={form.ordem_id}
            onChange={(e) => setForm({ ...form, ordem_id: e.target.value, ordem_item_id: '', etapa_id: '' })}
            className={`${input} w-full`}>
            <option value="">Sem OP</option>
            {ordens.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.produto || 's/ descrição'}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Item</span>
          <select value={form.ordem_item_id} onChange={(e) => setForm({ ...form, ordem_item_id: e.target.value })}
            disabled={!form.ordem_id} className={`${input} w-full disabled:bg-slate-50`}>
            <option value="">Todos</option>
            {itensDaOrdem.map((i) => <option key={i.id} value={i.id}>{i.descricao || `Item #${i.id}`}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Etapa</span>
          <select value={form.etapa_id} onChange={(e) => setForm({ ...form, etapa_id: e.target.value })}
            disabled={!form.ordem_id} className={`${input} w-full disabled:bg-slate-50`}>
            <option value="">Não informar</option>
            {etapasDaOrdem.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={salvar} disabled={salvando || !form.funcionario_id}
            className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50">
            Lançar
          </button>
        </div>
      </div>

      {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      {ok && <p className="mt-3 text-sm font-semibold text-green-600">{ok}</p>}
    </div>
  )
}

/* ==========================================================================
 * Listas
 * ======================================================================== */

function ListaApontamentos({ apontamentos, onMudou }: {
  apontamentos: ApontamentoLinha[]
  onMudou: () => Promise<void>
}) {
  async function excluir(id: number) {
    if (!confirm('Excluir este apontamento?')) return
    await fetch(`/api/producao/apontamentos?id=${id}`, { method: 'DELETE' })
    await onMudou()
  }

  const finalizados = apontamentos.filter((a) => !a.inicio || a.fim)

  return (
    <div className={card}>
      <h2 className="mb-4 text-base font-bold text-[#0b1733]">Últimos apontamentos</h2>
      {finalizados.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum apontamento registrado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>Data</th><th className={th}>Estofador</th><th className={th}>OP</th>
                <th className={th}>Horas</th><th className={th}>Peças</th><th className={th}>Peças/h</th>
                <th className={th}>Origem</th><th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {finalizados.map((a) => {
                const horas = horasDoApontamento(a)
                return (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className={td}>{formatarDataBR(a.data_ref)}</td>
                    <td className={`${td} font-semibold`}>{a.producao_funcionarios?.nome || '—'}</td>
                    <td className={td}>{a.producao_ordens?.numero || '—'}</td>
                    <td className={td}>{formatNumero(horas, 1)}</td>
                    <td className={td}>{formatNumero(num(a.pecas), 0)}</td>
                    <td className={`${td} font-semibold`}>{horas > 0 ? formatNumero(num(a.pecas) / horas, 2) : '—'}</td>
                    <td className={td}>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {a.origem === 'cronometro' ? 'cronômetro' : 'lançamento'}
                      </span>
                    </td>
                    <td className={td}>
                      <button onClick={() => excluir(a.id)}
                        className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
 * Perdas
 * ======================================================================== */

function FormularioPerda({ funcionarios, ordens, itens, etapas, motivos, insumos, revestimentos, onMudou }: {
  funcionarios: Funcionario[]
  ordens: Ordem[]
  itens: ItemOrdem[]
  etapas: Etapa[]
  motivos: Motivo[]
  insumos: Insumo[]
  revestimentos: Revestimento[]
  onMudou: () => Promise<void>
}) {
  const [form, setForm] = useState({
    tipo: 'insumo' as 'insumo' | 'peca',
    data_ref: hojeISO(), ordem_id: '', ordem_item_id: '', etapa_id: '',
    funcionario_id: '', motivo_id: '', insumo_id: '', revestimento_id: '',
    quantidade: '', custo_estimado: '', recuperavel: false, observacao: '',
  })
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)

  const itensDaOrdem = itens.filter((i) => String(i.ordem_id) === form.ordem_id)
  const etapasDaOrdem = etapas.filter((e) => String(e.ordem_id) === form.ordem_id)

  async function salvar() {
    setSalvando(true); setErro(''); setOk('')
    const resp = await fetch('/api/producao/perdas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        quantidade: Number(form.quantidade),
        custo_estimado: form.custo_estimado ? Number(form.custo_estimado) : null,
        ordem_id: form.ordem_id || null,
        ordem_item_id: form.ordem_item_id || null,
        etapa_id: form.etapa_id || null,
        funcionario_id: form.funcionario_id || null,
        insumo_id: form.tipo === 'insumo' ? form.insumo_id || null : null,
        revestimento_id: form.tipo === 'insumo' ? form.revestimento_id || null : null,
      }),
    })
    const json = await resp.json()
    if (!resp.ok) setErro(json.error || 'Não foi possível registrar.')
    else {
      setOk('Perda registrada.')
      setForm({ ...form, quantidade: '', custo_estimado: '', observacao: '' })
      await onMudou()
    }
    setSalvando(false)
  }

  return (
    <div className={card}>
      <h2 className="mb-1 text-base font-bold text-[#0b1733]">Registrar perda</h2>
      <p className="mb-4 text-xs text-slate-500">
        Deixe o custo em branco para o sistema calcular pelo custo do insumo ou do item —
        valor digitado à mão vira relatório sem credibilidade.
      </p>

      <div className="mb-4 flex gap-2">
        {([['insumo', 'Material estragado'], ['peca', 'Peça refugada']] as const).map(([chave, texto]) => (
          <button key={chave} onClick={() => setForm({ ...form, tipo: chave })}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              form.tipo === chave ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {texto}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className={label}>Data</span>
          <input type="date" value={form.data_ref} onChange={(e) => setForm({ ...form, data_ref: e.target.value })}
            className={`${input} w-full`} />
        </div>
        <div>
          <span className={label}>Ordem</span>
          <select value={form.ordem_id}
            onChange={(e) => setForm({ ...form, ordem_id: e.target.value, ordem_item_id: '', etapa_id: '' })}
            className={`${input} w-full`}>
            <option value="">Sem OP</option>
            {ordens.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.produto || 's/ descrição'}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Item {form.tipo === 'peca' && <span className="text-red-500">*</span>}</span>
          <select value={form.ordem_item_id} onChange={(e) => setForm({ ...form, ordem_item_id: e.target.value })}
            disabled={!form.ordem_id} className={`${input} w-full disabled:bg-slate-50`}>
            <option value="">Selecione...</option>
            {itensDaOrdem.map((i) => <option key={i.id} value={i.id}>{i.descricao || `Item #${i.id}`}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Etapa</span>
          <select value={form.etapa_id} onChange={(e) => setForm({ ...form, etapa_id: e.target.value })}
            disabled={!form.ordem_id} className={`${input} w-full disabled:bg-slate-50`}>
            <option value="">Não informar</option>
            {etapasDaOrdem.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>

        {form.tipo === 'insumo' && (
          <>
            <div>
              <span className={label}>Insumo</span>
              <select value={form.insumo_id} onChange={(e) => setForm({ ...form, insumo_id: e.target.value, revestimento_id: '' })}
                className={`${input} w-full`}>
                <option value="">Selecione...</option>
                {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
              </select>
            </div>
            <div>
              <span className={label}>ou Revestimento</span>
              <select value={form.revestimento_id} onChange={(e) => setForm({ ...form, revestimento_id: e.target.value, insumo_id: '' })}
                className={`${input} w-full`}>
                <option value="">Selecione...</option>
                {revestimentos.map((r) => <option key={r.id} value={r.id}>{r.nome} — {r.cor}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <span className={label}>Motivo <span className="text-red-500">*</span></span>
          <select value={form.motivo_id} onChange={(e) => setForm({ ...form, motivo_id: e.target.value })}
            className={`${input} w-full`}>
            <option value="">Selecione...</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Responsável</span>
          <select value={form.funcionario_id} onChange={(e) => setForm({ ...form, funcionario_id: e.target.value })}
            className={`${input} w-full`}>
            <option value="">Não informar</option>
            {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>Quantidade <span className="text-red-500">*</span></span>
          <input type="number" step="0.01" min="0" value={form.quantidade} placeholder="0"
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })} className={`${input} w-full`} />
        </div>
        <div>
          <span className={label}>Custo (opcional)</span>
          <input type="number" step="0.01" min="0" value={form.custo_estimado} placeholder="calculado"
            onChange={(e) => setForm({ ...form, custo_estimado: e.target.value })} className={`${input} w-full`} />
        </div>

        <div className="lg:col-span-2">
          <span className={label}>Observação</span>
          <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            placeholder="O que aconteceu" className={`${input} w-full`} />
        </div>
        <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-600">
          <input type="checkbox" checked={form.recuperavel}
            onChange={(e) => setForm({ ...form, recuperavel: e.target.checked })} className="h-4 w-4" />
          Recuperável (retrabalho)
        </label>
        <div className="flex items-end">
          <button onClick={salvar} disabled={salvando || !form.motivo_id || !form.quantidade}
            className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            Registrar perda
          </button>
        </div>
      </div>

      {erro && <p className="mt-3 text-sm font-semibold text-red-600">{erro}</p>}
      {ok && <p className="mt-3 text-sm font-semibold text-green-600">{ok}</p>}
    </div>
  )
}

function ListaPerdas({ perdas, onMudou }: { perdas: PerdaLinha[]; onMudou: () => Promise<void> }) {
  async function excluir(id: number) {
    if (!confirm('Excluir este registro de perda? A baixa de estoque não é estornada automaticamente.')) return
    await fetch(`/api/producao/perdas?id=${id}`, { method: 'DELETE' })
    await onMudou()
  }

  return (
    <div className={card}>
      <h2 className="mb-4 text-base font-bold text-[#0b1733]">Últimas perdas</h2>
      {perdas.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma perda registrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>Data</th><th className={th}>Tipo</th><th className={th}>OP</th>
                <th className={th}>Motivo</th><th className={th}>Responsável</th>
                <th className={th}>Qtd</th><th className={th}>Custo</th><th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {perdas.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className={td}>{formatarDataBR(p.data_ref)}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.tipo === 'peca' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.tipo === 'peca' ? 'peça' : 'material'}
                    </span>
                    {p.recuperavel && (
                      <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        retrabalho
                      </span>
                    )}
                  </td>
                  <td className={td}>{p.producao_ordens?.numero || '—'}</td>
                  <td className={td}>{p.producao_motivos_perda?.nome || '—'}</td>
                  <td className={td}>{p.producao_funcionarios?.nome || '—'}</td>
                  <td className={td}>{formatNumero(num(p.quantidade), 2)} {p.unidade || ''}</td>
                  <td className={`${td} font-semibold text-red-600`}>{formatCurrency(num(p.custo_estimado))}</td>
                  <td className={td}>
                    <button onClick={() => excluir(p.id)}
                      className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
