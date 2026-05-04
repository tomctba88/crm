'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser-client'

type Lead = {
  id: number
  created_at: string
  user_id: string
  data_contato: string | null
  tipo_contato: string | null
  vendedor: string | null
  nome_cliente: string
  nome_empresa: string | null
  telefone: string | null
  uf: string | null
  produto_interesse: string | null
  valor_orcamento: number | null
  valor_frete: number | null
  status: string | null
  data_retorno: string | null
  observacoes: string | null
  data_ultima_movimentacao: string | null
}

function formatDateBR(value: string | null) {
  if (!value) return '-'

  const dataNormalizada = value.slice(0, 10)
  const [ano, mes, dia] = dataNormalizada.split('-')

  if (!ano || !mes || !dia) return value

  return `${dia}/${mes}/${ano}`
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return 'R$ 0,00'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function toDateOnlyString(date: Date) {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function getUrgencia(dataRetorno: string | null) {
  if (!dataRetorno) {
    return {
      label: 'Sem data',
      order: 5,
      classes: 'bg-slate-100 text-slate-600',
    }
  }

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const hojeStr = toDateOnlyString(hoje)

  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)

  const amanhaStr = toDateOnlyString(amanha)

  const dataNormalizada = dataRetorno.slice(0, 10)

  if (dataNormalizada < hojeStr) {
    return {
      label: 'Atrasado',
      order: 1,
      classes: 'bg-red-50 text-red-700',
    }
  }

  if (dataNormalizada === hojeStr) {
    return {
      label: 'Hoje',
      order: 2,
      classes: 'bg-yellow-50 text-yellow-700',
    }
  }

  if (dataNormalizada === amanhaStr) {
    return {
      label: 'Amanhã',
      order: 3,
      classes: 'bg-blue-50 text-blue-700',
    }
  }

  return {
    label: 'Próximo',
    order: 4,
    classes: 'bg-green-50 text-green-700',
  }
}

export default function TarefasManager() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('Todos')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [filtroUrgencia, setFiltroUrgencia] = useState('Todos')
  const [filtroUf, setFiltroUf] = useState('Todos')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [modalRemarcarAberto, setModalRemarcarAberto] = useState(false)
  const [leadRemarcando, setLeadRemarcando] = useState<Lead | null>(null)
  const [novaDataRetorno, setNovaDataRetorno] = useState('')
  const urgenciaFromUrl = searchParams.get('urgencia')

  async function buscarTarefas() {
    setLoading(true)

    try {
      const tamanhoLote = 1000
      let inicio = 0
      let todos: Lead[] = []

      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .not('data_retorno', 'is', null)
          .order('data_retorno', { ascending: true })
          .range(inicio, inicio + tamanhoLote - 1)

        if (error) throw error

        const lote = (data || []) as Lead[]
        todos = [...todos, ...lote]

        if (lote.length < tamanhoLote) break

        inicio += tamanhoLote
      }

      setLeads(todos)
    } catch (error) {
      console.error('Erro ao buscar tarefas/follow-ups:', error)
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  async function concluirTarefa(id: number) {
    const { error } = await supabase
      .from('leads')
      .update({ data_retorno: null })
      .eq('id', id)

    if (error) {
      console.error('Erro ao concluir tarefa:', error)
      alert('Erro ao concluir tarefa.')
      return
    }

    await buscarTarefas()
  }

  function remarcarTarefa(lead: Lead) {
    setLeadRemarcando(lead)
    setNovaDataRetorno(lead.data_retorno ? lead.data_retorno.slice(0, 10) : '')
    setModalRemarcarAberto(true)
  }

  async function salvarRemarcacao() {
    if (!leadRemarcando) return

    if (!novaDataRetorno) {
      alert('Selecione uma nova data.')
      return
    }

    const { error } = await supabase
      .from('leads')
      .update({ data_retorno: novaDataRetorno })
      .eq('id', leadRemarcando.id)

    if (error) {
      console.error('Erro ao remarcar tarefa:', error)
      alert('Erro ao remarcar tarefa.')
      return
    }

    setModalRemarcarAberto(false)
    setLeadRemarcando(null)
    setNovaDataRetorno('')
    await buscarTarefas()
  }

  useEffect(() => {
    buscarTarefas()
  }, [])

  useEffect(() => {
    if (!urgenciaFromUrl) {
      setFiltroUrgencia('Todos')
      return
    }

    const urgenciasValidas = ['Atrasado', 'Hoje', 'Amanhã', 'Próximo']

    if (urgenciasValidas.includes(urgenciaFromUrl)) {
      setFiltroUrgencia(urgenciaFromUrl)
    } else {
      setFiltroUrgencia('Todos')
    }
  }, [urgenciaFromUrl])

  const vendedores = Array.from(
    new Set(leads.map((lead) => lead.vendedor).filter(Boolean))
  ) as string[]

  const statusList = Array.from(
    new Set(leads.map((lead) => lead.status).filter(Boolean))
  ) as string[]

  const ufList = Array.from(
    new Set(leads.map((lead) => lead.uf).filter(Boolean))
  ) as string[]

    function statusEncerrado(status: string | null) {
  const statusNormalizado = (status || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return (
    statusNormalizado === 'CANCELADO' ||
    statusNormalizado === 'DESQUALIFICADO' ||
    statusNormalizado === 'FECHADO' ||
    statusNormalizado === 'PEDIDO' ||
    statusNormalizado === 'FORNECEDOR'
  )
}

  const leadsFiltrados = leads
    .filter((lead) => {
      if (statusEncerrado(lead.status)) {
        return false
      }

      const termo = busca.toLowerCase()
      const dataRetorno = lead.data_retorno ? lead.data_retorno.slice(0, 10) : ''

      const bateBusca =
        !termo ||
        lead.nome_cliente?.toLowerCase().includes(termo) ||
        lead.nome_empresa?.toLowerCase().includes(termo) ||
        lead.telefone?.toLowerCase().includes(termo) ||
        lead.produto_interesse?.toLowerCase().includes(termo)

      const bateVendedor =
        filtroVendedor === 'Todos' || lead.vendedor === filtroVendedor

      const bateStatus =
        filtroStatus === 'Todos' || lead.status === filtroStatus

      const bateUf =
        filtroUf === 'Todos' || lead.uf === filtroUf

      const urgencia = getUrgencia(lead.data_retorno)

      const bateUrgencia =
        filtroUrgencia === 'Todos' || urgencia.label === filtroUrgencia

      const bateDataInicio =
        !filtroDataInicio || dataRetorno >= filtroDataInicio

      const bateDataFim =
        !filtroDataFim || dataRetorno <= filtroDataFim

      return (
        bateBusca &&
        bateVendedor &&
        bateStatus &&
        bateUf &&
        bateUrgencia &&
        bateDataInicio &&
        bateDataFim
      )
    })
    .sort((a, b) => {
      const urgA = getUrgencia(a.data_retorno).order
      const urgB = getUrgencia(b.data_retorno).order

      if (urgA !== urgB) return urgA - urgB

      return (a.data_retorno || '').localeCompare(b.data_retorno || '')
    })

  const leadsBaseResumo = leads.filter((lead) => {
    if (statusEncerrado(lead.status)) {
      return false
    }

    const termo = busca.toLowerCase()
    const dataRetorno = lead.data_retorno ? lead.data_retorno.slice(0, 10) : ''

    const bateBusca =
      !termo ||
      lead.nome_cliente?.toLowerCase().includes(termo) ||
      lead.nome_empresa?.toLowerCase().includes(termo) ||
      lead.telefone?.toLowerCase().includes(termo) ||
      lead.produto_interesse?.toLowerCase().includes(termo)

    const bateVendedor =
      filtroVendedor === 'Todos' || lead.vendedor === filtroVendedor

    const bateStatus =
      filtroStatus === 'Todos' || lead.status === filtroStatus

    const bateUf =
      filtroUf === 'Todos' || lead.uf === filtroUf

    const bateDataInicio =
      !filtroDataInicio || dataRetorno >= filtroDataInicio

    const bateDataFim =
      !filtroDataFim || dataRetorno <= filtroDataFim

    return (
      bateBusca &&
      bateVendedor &&
      bateStatus &&
      bateUf &&
      bateDataInicio &&
      bateDataFim
    )
  })

  const atrasados = leadsBaseResumo.filter(
    (lead) => getUrgencia(lead.data_retorno).label === 'Atrasado'
  ).length

  const hoje = leadsBaseResumo.filter(
    (lead) => getUrgencia(lead.data_retorno).label === 'Hoje'
  ).length

  const amanha = leadsBaseResumo.filter(
    (lead) => getUrgencia(lead.data_retorno).label === 'Amanhã'
  ).length

  const proximos = leadsBaseResumo.filter(
    (lead) => getUrgencia(lead.data_retorno).label === 'Próximo'
  ).length

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Gestão de follow-up
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Tarefas Comerciais
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Visualize o que está vencido, o que vence hoje e os próximos retornos da equipe.
            </p>
          </div>

          <button
            type="button"
            onClick={buscarTarefas}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Atualizar tarefas
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ResumoCard
            title="Atrasados"
            value={String(atrasados)}
            classes="bg-red-50 text-red-700"
            ativo={filtroUrgencia === 'Atrasado'}
            onClick={() =>
              setFiltroUrgencia(filtroUrgencia === 'Atrasado' ? 'Todos' : 'Atrasado')
            }
          />

          <ResumoCard
            title="Para hoje"
            value={String(hoje)}
            classes="bg-yellow-50 text-yellow-700"
            ativo={filtroUrgencia === 'Hoje'}
            onClick={() =>
              setFiltroUrgencia(filtroUrgencia === 'Hoje' ? 'Todos' : 'Hoje')
            }
          />

          <ResumoCard
            title="Para amanhã"
            value={String(amanha)}
            classes="bg-blue-50 text-blue-700"
            ativo={filtroUrgencia === 'Amanhã'}
            onClick={() =>
              setFiltroUrgencia(filtroUrgencia === 'Amanhã' ? 'Todos' : 'Amanhã')
            }
          />

          <ResumoCard
            title="Próximos"
            value={String(proximos)}
            classes="bg-green-50 text-green-700"
            ativo={filtroUrgencia === 'Próximo'}
            onClick={() =>
              setFiltroUrgencia(filtroUrgencia === 'Próximo' ? 'Todos' : 'Próximo')
            }
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Buscar
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente, empresa, telefone, produto..."
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Vendedor
            </label>
            <select
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor} value={vendedor}>
                  {vendedor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Status
            </label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              {statusList.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Urgência
            </label>
            <select
              value={filtroUrgencia}
              onChange={(e) => setFiltroUrgencia(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              <option value="Atrasado">Atrasado</option>
              <option value="Hoje">Hoje</option>
              <option value="Amanhã">Amanhã</option>
              <option value="Próximo">Próximo</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              UF
            </label>
            <select
              value={filtroUf}
              onChange={(e) => setFiltroUf(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              {ufList.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Retorno de
            </label>
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Retorno até
            </label>
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setBusca('')
                setFiltroVendedor('Todos')
                setFiltroStatus('Todos')
                setFiltroUrgencia('Todos')
                setFiltroUf('Todos')
                setFiltroDataInicio('')
                setFiltroDataFim('')
              }}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-900">
            Lista de follow-ups
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Leads com data de retorno definida, ordenados por urgência e data.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando tarefas...
          </div>
        ) : leadsFiltrados.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Nenhuma tarefa encontrada.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Role lateralmente para ver todas as colunas. A coluna de ações fica travada à direita.
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-[1700px] text-sm">
                <thead className="sticky top-0 z-20 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-bold">Urgência</th>
                    <th className="px-4 py-3 font-bold">Data</th>
                    <th className="px-4 py-3 font-bold">Cliente</th>
                    <th className="px-4 py-3 font-bold">Empresa</th>
                    <th className="px-4 py-3 font-bold">Vendedor</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">UF</th>
                    <th className="px-4 py-3 font-bold">Telefone</th>
                    <th className="px-4 py-3 font-bold">Produto</th>
                    <th className="px-4 py-3 font-bold">Orçamento</th>
                    <th className="min-w-[280px] px-4 py-3 font-bold">OBS</th>
                    <th className="sticky right-0 z-30 min-w-[220px] bg-slate-50 px-4 py-3 font-bold shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.35)]">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {leadsFiltrados.map((lead) => {
                    const urgencia = getUrgencia(lead.data_retorno)
                    const linhaAtrasada = urgencia.label === 'Atrasado'

                    return (
                      <tr
                        key={lead.id}
                        className={`border-t align-top ${
                          linhaAtrasada ? 'border-red-200 bg-red-50' : 'border-slate-200'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${urgencia.classes}`}>
                            {urgencia.label}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatDateBR(lead.data_retorno)}
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-900">
                          {lead.nome_cliente}
                        </td>

                        <td className="px-4 py-3">
                          {lead.nome_empresa || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {lead.vendedor || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {lead.status || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {lead.uf || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {lead.telefone || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {lead.produto_interesse || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {formatCurrency(lead.valor_orcamento)}
                        </td>

                        <td className="min-w-[280px] px-4 py-3">
                          {lead.observacoes || '-'}
                        </td>

                        <td
                          className={`sticky right-0 z-10 min-w-[220px] px-4 py-3 shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.35)] ${
                            linhaAtrasada ? 'bg-red-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex flex-col gap-2">
                            <Link
                              href={`/leads?lead=${lead.id}`}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs font-bold text-blue-700 hover:bg-blue-100"
                            >
                              Editar lead
                            </Link>

                            <button
                              type="button"
                              onClick={() => remarcarTarefa(lead)}
                              className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-700 hover:bg-yellow-100"
                            >
                              Remarcar retorno
                            </button>

                            <button
                              type="button"
                              onClick={() => concluirTarefa(lead.id)}
                              className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100"
                            >
                              Concluir tarefa
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {modalRemarcarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">
              Remarcar retorno
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Lead:{' '}
              <span className="font-bold text-slate-900">
                {leadRemarcando?.nome_cliente}
              </span>
            </p>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Nova data de retorno
              </label>
              <input
                type="date"
                value={novaDataRetorno}
                onChange={(e) => setNovaDataRetorno(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalRemarcarAberto(false)
                  setLeadRemarcando(null)
                  setNovaDataRetorno('')
                }}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={salvarRemarcacao}
                className="rounded-xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95"
              >
                Salvar nova data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ResumoCard({
  title,
  value,
  classes,
  ativo,
  onClick,
}: {
  title: string
  value: string
  classes: string
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl p-5 text-left transition ${
        ativo ? 'ring-2 ring-blue-500 scale-[1.02]' : 'hover:scale-[1.01]'
      } ${classes}`}
    >
      <p className="text-sm font-bold uppercase tracking-[0.14em] opacity-80">
        {title}
      </p>
      <p className="mt-3 text-4xl font-black">
        {value}
      </p>
    </button>
  )
}