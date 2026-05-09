'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'

type Etapa = { id: number; nome: string; sequencia: number; status: string; responsavel: string | null; data_inicio: string | null; data_conclusao: string | null; observacoes: string | null }
type Ordem = {
  id: number; numero: string; status: string; produto: string | null; responsavel: string | null
  data_prevista: string | null; data_conclusao: string | null; observacoes: string | null; created_at: string
  leads: { id: number; nome_cliente: string; nome_empresa: string | null; telefone: string | null; vendedor: string | null; produto_interesse: string | null; valor_orcamento: number | null } | null
  pos_vendas: { id: number; status_pos_venda: string } | null
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
  const [form, setForm] = useState({ responsavel: '', data_prevista: '', observacoes: '' })
  const [msg, setMsg] = useState('')

  async function carregar() {
    const { data: ordemData } = await supabase
      .from('producao_ordens')
      .select('id,numero,status,produto,responsavel,data_prevista,data_conclusao,observacoes,created_at,leads(id,nome_cliente,nome_empresa,telefone,vendedor,produto_interesse,valor_orcamento),pos_vendas(id,status_pos_venda)')
      .eq('id', ordemId)
      .single()

    const { data: etapasData } = await supabase
      .from('producao_etapas')
      .select('id,nome,sequencia,status,responsavel,data_inicio,data_conclusao,observacoes')
      .eq('ordem_id', ordemId)
      .order('sequencia')

    setOrdem(ordemData as Ordem)
    setEtapas(etapasData || [])
    if (ordemData) {
      setForm({
        responsavel: ordemData.responsavel || '',
        data_prevista: ordemData.data_prevista || '',
        observacoes: ordemData.observacoes || '',
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

  async function salvarEdicao() {
    setSalvando(true)
    await supabase.from('producao_ordens').update({ ...form, updated_at: new Date().toISOString() }).eq('id', ordemId)
    setEditando(false)
    setMsg('Ordem atualizada!')
    await carregar()
    setSalvando(false)
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

      {msg && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">{msg}</div>}

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
        </div>
      </div>
    </div>
  )
}
