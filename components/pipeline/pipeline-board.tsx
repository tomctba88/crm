'use client'

import { useEffect, useMemo, useState } from 'react'
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

type StatusItem = {
  id: number
  nome: string
  cor: string | null
  ativo: boolean
}

type Movimentacao = {
  id: number
  lead_id: number
  user_id: string | null
  status_anterior: string | null
  novo_status: string
  movido_em: string
  created_at: string
}

type NivelAcesso = 'administrador' | 'operacional' | 'consulta'

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return 'R$ 0,00'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateBR(value: string | null) {
  if (!value) return '-'
  const [ano, mes, dia] = value.split('T')[0].split('-')
  if (!ano || !mes || !dia) return value
  return `${dia}/${mes}/${ano}`
}

function formatDateTimeBR(value: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function getStatusClasses(cor?: string | null) {
  switch ((cor || '').toLowerCase()) {
    case 'green':
    case 'verde':
      return {
        header: 'bg-green-50 border-green-200 text-green-800',
        badge: 'bg-green-100 text-green-700',
      }
    case 'red':
    case 'vermelho':
      return {
        header: 'bg-red-50 border-red-200 text-red-800',
        badge: 'bg-red-100 text-red-700',
      }
    case 'yellow':
    case 'amarelo':
      return {
        header: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        badge: 'bg-yellow-100 text-yellow-700',
      }
    case 'blue':
    case 'azul':
      return {
        header: 'bg-blue-50 border-blue-200 text-blue-800',
        badge: 'bg-blue-100 text-blue-700',
      }
    case 'orange':
    case 'laranja':
      return {
        header: 'bg-orange-50 border-orange-200 text-orange-800',
        badge: 'bg-orange-100 text-orange-700',
      }
    case 'purple':
    case 'roxo':
      return {
        header: 'bg-purple-50 border-purple-200 text-purple-800',
        badge: 'bg-purple-100 text-purple-700',
      }
    default:
      return {
        header: 'bg-slate-50 border-slate-200 text-slate-800',
        badge: 'bg-slate-100 text-slate-700',
      }
  }
}

function getNomeExibicaoStatus(nome: string) {
  if (nome === 'ORÇAR') return 'ATENDENDO'
  if (nome === 'AGUARDANDO') return 'ORÇADO'
  if (nome === 'CANCELADO') return 'PERDIDO'
  return nome
}

export default function PipelineBoard() {
  const supabase = useMemo(() => createClient(), [])

  const [statuses, setStatuses] = useState<StatusItem[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingLeadId, setDraggingLeadId] = useState<number | null>(null)
  const [dropStatus, setDropStatus] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [vendedorFiltro, setVendedorFiltro] = useState('Todos')
  const [ordenacao, setOrdenacao] = useState('data_desc')
  const [valorMinimo, setValorMinimo] = useState('')
  const [valorMaximo, setValorMaximo] = useState('')
  const [mesFiltro, setMesFiltro] = useState('Todos')
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()))
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false)
  const [movendo, setMovendo] = useState(false)
  const [nivelUsuarioLogado, setNivelUsuarioLogado] = useState<NivelAcesso>('consulta')

  const [leadDetalhe, setLeadDetalhe] = useState<Lead | null>(null)
  const [historicoLead, setHistoricoLead] = useState<Movimentacao[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  async function buscarTodosLeadsPipeline() {
    const limite = 1000
    let inicio = 0
    let todos: Lead[] = []

    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .range(inicio, inicio + limite - 1)

      if (error) {
        throw error
      }

      const lote = (data || []) as Lead[]
      todos = [...todos, ...lote]

      if (lote.length < limite) {
        break
      }

      inicio += limite
    }

    return todos
  }

  async function buscarPipeline() {
    setLoading(true)

    try {
      const [statusRes, leadsData] = await Promise.all([
        supabase
          .from('cadastro_status_lead')
          .select('*')
          .eq('ativo', true)
          .order('id', { ascending: true }),
        buscarTodosLeadsPipeline(),
      ])

      if (statusRes.error) {
        console.error('Erro ao buscar status do pipeline:', statusRes.error)
        setStatuses([])
      } else {
        setStatuses((statusRes.data || []) as StatusItem[])
      }

      setLeads(leadsData)
    } catch (error) {
      console.error('Erro ao buscar pipeline:', error)
      setLeads([])
      setStatuses([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function carregarTudo() {
      await buscarPipeline()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setNivelUsuarioLogado('consulta')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('nivel_acesso')
        .eq('id', user.id)
        .single()

      setNivelUsuarioLogado((data?.nivel_acesso as NivelAcesso) || 'consulta')
    }

    carregarTudo()
  }, [supabase])

  function normalizarStatus(status?: string | null) {
  return String(status || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function statusEncerrado(status?: string | null) {
  const statusNormalizado = normalizarStatus(status)

  return (
    statusNormalizado === 'FECHADO' ||
    statusNormalizado === 'PEDIDO' ||
    statusNormalizado === 'CANCELADO' ||
    statusNormalizado === 'DESQUALIFICADO' ||
    statusNormalizado === 'FORNECEDOR'
  )
}

function statusBanco(statusVisual: string) {
  const status = normalizarStatus(statusVisual)

  if (status === 'PERDIDO') return 'CANCELADO'
  if (status === 'ORCADO') return 'AGUARDANDO'
  if (status === 'ATENDENDO') return 'ORÇAR'

  return status
}

function statusParaBanco(statusVisual: string) {
  const statusNormalizado = normalizarStatus(statusVisual)

  if (statusNormalizado === 'PERDIDO') return 'CANCELADO'
  if (statusNormalizado === 'ORCADO') return 'AGUARDANDO'
  if (statusNormalizado === 'ATENDENDO') return 'ORÇAR'

  return String(statusVisual || '').trim().toUpperCase()
}

  const vendedores = Array.from(
  new Set(leads.map((lead) => lead.vendedor).filter(Boolean))
) as string[]

const leadsFiltrados = leads.filter((lead) => {
  const termo = busca.toLowerCase()
  const valor = Number(lead.valor_orcamento || 0)
  const dataBase = lead.data_contato || lead.created_at || ''
  const data = dataBase ? new Date(dataBase) : null

  const leadEncerrado = statusEncerrado(lead.status)

  if (!mostrarEncerrados && leadEncerrado) {
    return false
  }

  const bateBusca =
    !termo ||
    lead.nome_cliente?.toLowerCase().includes(termo) ||
    lead.nome_empresa?.toLowerCase().includes(termo) ||
    lead.telefone?.toLowerCase().includes(termo) ||
    lead.produto_interesse?.toLowerCase().includes(termo)

  const bateVendedor =
    vendedorFiltro === 'Todos' ? true : lead.vendedor === vendedorFiltro

  const bateValorMinimo =
    !valorMinimo ? true : valor >= Number(valorMinimo)

  const bateValorMaximo =
    !valorMaximo ? true : valor <= Number(valorMaximo)

  const bateMes =
    mesFiltro === 'Todos' ||
    (data && data.getMonth() + 1 === Number(mesFiltro))

  const bateAno =
    anoFiltro === 'Todos' ||
    (data && data.getFullYear() === Number(anoFiltro))

  return (
    bateBusca &&
    bateVendedor &&
    bateValorMinimo &&
    bateValorMaximo &&
    bateMes &&
    bateAno
  )
})

const anosDisponiveis = Array.from(
  new Set(
    leads
      .map((lead) => {
        const dataBase = lead.data_contato || lead.created_at
        if (!dataBase) return null
        return new Date(dataBase).getFullYear()
      })
      .filter(Boolean)
  )
).sort((a, b) => Number(b) - Number(a))

const ordemPersonalizadaStatus: Record<string, number> = {
  ORÇAR: 1,
  AGUARDANDO: 2,
  NEGOCIANDO: 3,
  FECHADO: 4,
  CANCELADO: 5,
}

const statusesOrdenados = [...statuses].sort((a, b) => {
  const ordemA = ordemPersonalizadaStatus[a.nome] ?? 999
  const ordemB = ordemPersonalizadaStatus[b.nome] ?? 999

  if (ordemA !== ordemB) return ordemA - ordemB

  return a.id - b.id
})

  async function abrirHistoricoLead(lead: Lead) {
    setLeadDetalhe(lead)
    setCarregandoHistorico(true)

    const { data, error } = await supabase
      .from('lead_movimentacoes')
      .select('*')
      .eq('lead_id', lead.id)
      .order('movido_em', { ascending: false })

    if (error) {
      console.error('Erro ao buscar histórico do lead:', error)
      setHistoricoLead([])
      setCarregandoHistorico(false)
      return
    }

    setHistoricoLead((data || []) as Movimentacao[])
    setCarregandoHistorico(false)
  }

  async function moverLead(leadId: number, novoStatus: string) {
  const leadAtual = leads.find((lead) => lead.id === leadId)
  if (!leadAtual) return

  const statusBancoNovo = statusParaBanco(novoStatus)
  const statusAtual = statusParaBanco(leadAtual.status || '')

  if (statusAtual === statusBancoNovo) return

  setMovendo(true)

  const leadsAnteriores = leads
  const agoraIso = new Date().toISOString()
  const hoje = agoraIso.slice(0, 10)

  const dadosExtrasStatus: Record<string, any> = {}

  if (statusBancoNovo === 'FECHADO' || statusBancoNovo === 'PEDIDO') {
    dadosExtrasStatus.data_fechamento = hoje
  }

  if (statusBancoNovo === 'CANCELADO') {
    dadosExtrasStatus.data_cancelamento = hoje
    dadosExtrasStatus.data_finalizacao = hoje
  }

  if (statusBancoNovo === 'DESQUALIFICADO') {
    dadosExtrasStatus.data_finalizacao = hoje
  }

  setLeads((prev) =>
    prev.map((lead) =>
      lead.id === leadId
        ? {
            ...lead,
            status: statusBancoNovo,
            data_ultima_movimentacao: agoraIso,
            ...dadosExtrasStatus,
          }
        : lead
    )
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error: updateError } = await supabase
  .from('leads')
  .update({
    status: statusBancoNovo,
    data_ultima_movimentacao: agoraIso,
    ...dadosExtrasStatus,
  })
  .eq('id', leadId)

  if (updateError) {
  console.error('Erro ao mover lead no pipeline:', updateError)
  alert(updateError.message || 'Erro ao atualizar status do lead.')
  setLeads(leadsAnteriores)
  setMovendo(false)
  return
}

    const { error: historicoError } = await supabase
    .from('lead_movimentacoes')
    .insert({
      lead_id: leadId,
      user_id: user?.id || null,
      status_anterior: leadAtual.status,
      novo_status: statusBancoNovo,
      movido_em: agoraIso,
    })

  if (historicoError) {
    console.error('Erro ao gravar histórico da movimentação:', historicoError)
    alert('Status atualizado, mas houve erro ao gravar o histórico.')
  }

  if (statusBancoNovo === 'FECHADO' || statusBancoNovo === 'PEDIDO') {
    const { data: existentePosVenda, error: erroBuscaPosVenda } = await supabase
      .from('pos_vendas')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle()

    if (erroBuscaPosVenda) {
      console.error('Erro ao verificar pós-vendas existente:', erroBuscaPosVenda)
    } else if (!existentePosVenda) {
      const { error: erroCriacaoPosVenda } = await supabase
        .from('pos_vendas')
        .insert({
          lead_id: leadId,
          user_id: user?.id || null,
          status_pos_venda: 'EM PRODUÇÃO',
          responsavel: leadAtual.vendedor || null,
          data_inicio: hoje,
          created_at: agoraIso,
          updated_at: agoraIso,
        })

      if (erroCriacaoPosVenda) {
        console.error('Erro ao criar registro no pós-vendas:', erroCriacaoPosVenda)
        alert('Lead fechado, mas houve erro ao criar o registro no pós-vendas.')
      }
    }
  }

  setMovendo(false)
}

function handleDragStart(leadId: number) {
  if (nivelUsuarioLogado === 'consulta') return
  setDraggingLeadId(leadId)
}

function handleDragEnd() {
  setDraggingLeadId(null)
  setDropStatus(null)
}

function abrirEdicaoLead(leadId: number) {
  window.location.href = `/leads?lead=${leadId}`
}

  function leadsDaColuna(statusNome: string) {
    const lista = leadsFiltrados.filter((lead) => {
      const statusLead = statusParaBanco(lead.status || '')
      const statusColuna = statusParaBanco(statusNome)

      return statusLead === statusColuna
    })

    if (ordenacao === 'valor_desc') {
      return [...lista].sort(
        (a, b) => Number(b.valor_orcamento || 0) - Number(a.valor_orcamento || 0)
      )
    }

    if (ordenacao === 'valor_asc') {
      return [...lista].sort(
        (a, b) => Number(a.valor_orcamento || 0) - Number(b.valor_orcamento || 0)
      )
    }

    if (ordenacao === 'data_asc') {
      return [...lista].sort((a, b) =>
        String(a.created_at || '').localeCompare(String(b.created_at || ''))
      )
    }

    return [...lista].sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Gestão comercial
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Pipeline de Vendas
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Arraste os leads entre as colunas para atualizar o estágio da negociação.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Total no pipeline:{' '}
            <span className="font-bold text-slate-900">{leadsFiltrados.length}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Buscar lead
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
    Mês
  </label>
  <select
    value={mesFiltro}
    onChange={(e) => setMesFiltro(e.target.value)}
    className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
  >
    <option value="Todos">Todos os meses</option>
    <option value="1">Janeiro</option>
    <option value="2">Fevereiro</option>
    <option value="3">Março</option>
    <option value="4">Abril</option>
    <option value="5">Maio</option>
    <option value="6">Junho</option>
    <option value="7">Julho</option>
    <option value="8">Agosto</option>
    <option value="9">Setembro</option>
    <option value="10">Outubro</option>
    <option value="11">Novembro</option>
    <option value="12">Dezembro</option>
  </select>
</div>

<div>
  <label className="mb-2 block text-sm font-bold text-slate-700">
    Ano
  </label>
  <select
    value={anoFiltro}
    onChange={(e) => setAnoFiltro(e.target.value)}
    className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
  >
    <option value="Todos">Todos os anos</option>
    {anosDisponiveis.map((ano) => (
      <option key={ano} value={String(ano)}>
        {ano}
      </option>
    ))}
  </select>
</div>

<div className="flex items-end">
  <button
    type="button"
    onClick={() => setMostrarEncerrados((prev) => !prev)}
    className={`h-12 w-full rounded-xl border px-4 text-sm font-bold transition ${
      mostrarEncerrados
        ? 'border-blue-300 bg-blue-50 text-blue-700'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }`}
  >
    {mostrarEncerrados ? 'Ocultar encerrados' : 'Mostrar encerrados'}
  </button>
</div>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Filtrar vendedor
            </label>
            <select
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
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
              Ordenar por
            </label>
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="data_desc">Mais recente</option>
              <option value="data_asc">Mais antigo</option>
              <option value="valor_desc">Maior valor</option>
              <option value="valor_asc">Menor valor</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Valor mínimo
            </label>
            <input
              type="number"
              min="0"
              value={valorMinimo}
              onChange={(e) => setValorMinimo(e.target.value)}
              placeholder="Ex: 1000"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Valor máximo
            </label>
            <input
              type="number"
              min="0"
              value={valorMaximo}
              onChange={(e) => setValorMaximo(e.target.value)}
              placeholder="Ex: 5000"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={buscarPipeline}
              className="h-12 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Atualizar
            </button>

            <button
              type="button"
              onClick={() => {
  setBusca('')
  setVendedorFiltro('Todos')
  setOrdenacao('recente')
  setValorMinimo('')
  setValorMaximo('')
  setMesFiltro('Todos')
  setAnoFiltro(String(new Date().getFullYear()))
  setMostrarEncerrados(false)
}}
              className="h-12 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Carregando pipeline...
        </section>
      ) : statuses.length === 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Nenhum status ativo encontrado em Cadastros.
        </section>
      ) : (
        <section className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-5">
            {statusesOrdenados.map((status) => {
              const itens = leadsDaColuna(status.nome)
              const classes = getStatusClasses(status.cor)
              const totalColuna = itens.reduce(
                (acc, lead) => acc + Number(lead.valor_orcamento || 0),
                0
              )

              return (
                <div
                  key={status.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropStatus(status.nome)
                  }}
                  onDragLeave={() => {
                    if (dropStatus === status.nome) {
                      setDropStatus(null)
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault()

                    if (nivelUsuarioLogado === 'consulta') {
                      setDropStatus(null)
                      setDraggingLeadId(null)
                      return
                    }

                    if (draggingLeadId) {
                      await moverLead(draggingLeadId, status.nome)
                    }
                    setDropStatus(null)
                    setDraggingLeadId(null)
                  }}
                  className={`w-[360px] shrink-0 rounded-[28px] border bg-white shadow-sm transition ${
                    dropStatus === status.nome
                      ? 'border-blue-400 ring-4 ring-blue-100'
                      : 'border-slate-200'
                  }`}
                >
                  <div className={`rounded-t-[28px] border-b px-5 py-4 ${classes.header}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-black">
                          {getNomeExibicaoStatus(status.nome)}
                        </h2>
                        <p className="mt-1 text-xs font-medium opacity-80">
                          {itens.length} lead(s)
                        </p>
                      </div>

                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${classes.badge}`}>
                        {formatCurrency(totalColuna)}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
                    {itens.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        Solte um lead aqui
                      </div>
                    ) : (
                      itens.map((lead) => (
                        <div
                          key={lead.id}
                          draggable={nivelUsuarioLogado !== 'consulta'}
                          onDragStart={() => handleDragStart(lead.id)}
                          onDragEnd={handleDragEnd}
                          className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${
                            nivelUsuarioLogado !== 'consulta' ? 'cursor-grab' : 'cursor-default'
                          } ${draggingLeadId === lead.id ? 'opacity-60' : ''}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (nivelUsuarioLogado !== 'consulta') {
                                    abrirEdicaoLead(lead.id)
                                  }
                                }}
                                className={`text-left text-base font-black ${
                                  nivelUsuarioLogado !== 'consulta'
                                    ? 'text-slate-900 hover:text-blue-700'
                                    : 'cursor-not-allowed text-slate-400'
                                }`}
                              >
                                {lead.nome_cliente}
                              </button>
                              <p className="mt-1 text-sm text-slate-500">
                                {lead.nome_empresa || 'Sem empresa informada'}
                              </p>
                            </div>

                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                              #{lead.id}
                            </span>
                          </div>

                          <div className="space-y-2 text-sm text-slate-600">
                            <p>
                              <span className="font-bold text-slate-700">Vendedor:</span>{' '}
                              {lead.vendedor || '-'}
                            </p>
                            <p>
                              <span className="font-bold text-slate-700">Produto:</span>{' '}
                              {lead.produto_interesse || '-'}
                            </p>
                            <p>
                              <span className="font-bold text-slate-700">Telefone:</span>{' '}
                              {lead.telefone || '-'}
                            </p>
                            <p>
                              <span className="font-bold text-slate-700">Data contato:</span>{' '}
                              {formatDateBR(lead.data_contato)}
                            </p>
                            <p>
                              <span className="font-bold text-slate-700">Última movimentação:</span>{' '}
                              {formatDateTimeBR(lead.data_ultima_movimentacao)}
                            </p>
                            <p>
                              <span className="font-bold text-slate-700">Orçamento:</span>{' '}
                              {formatCurrency(lead.valor_orcamento)}
                            </p>
                          </div>

                          {lead.observacoes ? (
                            <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              {lead.observacoes}
                            </div>
                          ) : null}

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (nivelUsuarioLogado !== 'consulta') {
                                  abrirEdicaoLead(lead.id)
                                }
                              }}
                              disabled={nivelUsuarioLogado === 'consulta'}
                              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                                nivelUsuarioLogado !== 'consulta'
                                  ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                              }`}
                            >
                              Editar lead
                            </button>

                            <button
                              type="button"
                              onClick={() => abrirHistoricoLead(lead)}
                              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                            >
                              Ver histórico
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {leadDetalhe ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
                Auditoria do lead
              </p>
              <h2 className="text-2xl font-black text-slate-900">
                Histórico de movimentações
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Lead #{leadDetalhe.id} — {leadDetalhe.nome_cliente}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setLeadDetalhe(null)
                setHistoricoLead([])
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Fechar histórico
            </button>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <InfoCard label="Status atual" value={leadDetalhe.status || '-'} />
            <InfoCard
              label="Última movimentação"
              value={formatDateTimeBR(leadDetalhe.data_ultima_movimentacao)}
            />
            <InfoCard
              label="Valor orçamento"
              value={formatCurrency(leadDetalhe.valor_orcamento)}
            />
          </div>

          {carregandoHistorico ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              Carregando histórico...
            </div>
          ) : historicoLead.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              Nenhuma movimentação encontrada para este lead.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-bold">Movido em</th>
                    <th className="px-4 py-3 font-bold">Status anterior</th>
                    <th className="px-4 py-3 font-bold">Novo status</th>
                    <th className="px-4 py-3 font-bold">Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoLead.map((mov) => (
                    <tr key={mov.id} className="border-t border-slate-200">
                      <td className="px-4 py-3">{formatDateTimeBR(mov.movido_em)}</td>
                      <td className="px-4 py-3">{mov.status_anterior || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{mov.novo_status}</td>
                      <td className="px-4 py-3">{mov.user_id || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {movendo ? (
        <div className="fixed bottom-6 right-6 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl">
          Atualizando status do lead...
        </div>
      ) : null}
    </div>
  )
}

function InfoCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-black text-slate-900">{value}</p>
    </div>
  )
}