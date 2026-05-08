'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type StatusPosVenda = {
  id: number
  nome: string
  cor: string | null
  ativo: boolean
  ordem: number
}

type LeadRelacionado = {
  id: number
  nome_cliente: string
  nome_empresa: string | null
  vendedor: string | null
  telefone: string | null
  produto_interesse: string | null
  valor_orcamento: number | null
}

type PosVenda = {
  id: number
  lead_id: number
  user_id: string | null
  status_pos_venda: string
  responsavel: string | null
  transportadora: string | null
  codigo_rastreio: string | null
  data_inicio: string | null
  data_prevista_entrega: string | null
  data_entrega: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

type PosVendaComLead = PosVenda & {
  lead: LeadRelacionado | null
}

type PosVendaMovimentacao = {
  id: number
  pos_venda_id: number
  user_id: string | null
  status_anterior: string | null
  novo_status: string
  movido_em: string
}

type NivelAcesso = 'administrador' | 'operacional' | 'consulta'

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return 'R$ 0,00'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateBR(value: string | null) {
  if (!value) return '-'
  const data = value.slice(0, 10)
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return value
  return `${dia}/${mes}/${ano}`
}

function toDateOnlyString(date: Date) {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function getPrazoStatus(dataPrevistaEntrega: string | null) {
  if (!dataPrevistaEntrega) return 'Sem prazo'

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const hojeStr = toDateOnlyString(hoje)
  const dataStr = dataPrevistaEntrega.slice(0, 10)

  if (dataStr < hojeStr) return 'Atrasado'
  if (dataStr === hojeStr) return 'Hoje'

  const data = new Date(dataStr)
  const diff = (data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)

  if (diff <= 3) return 'Próximo'
  return 'No prazo'
}

function getPrazoVisual(dataPrevistaEntrega: string | null) {
  const prazo = getPrazoStatus(dataPrevistaEntrega)

  if (prazo === 'Atrasado') {
    return {
      badge: 'Atrasado',
      badgeClass: 'text-red-700 bg-red-50 border-red-200',
      cardClass: 'border-red-300',
    }
  }

  if (prazo === 'Hoje') {
    return {
      badge: 'Entrega hoje',
      badgeClass: 'text-orange-700 bg-orange-50 border-orange-200',
      cardClass: 'border-orange-300',
    }
  }

  if (prazo === 'Próximo') {
    return {
      badge: 'Próximo',
      badgeClass: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      cardClass: 'border-yellow-300',
    }
  }

  if (prazo === 'No prazo') {
    return {
      badge: 'No prazo',
      badgeClass: 'text-green-700 bg-green-50 border-green-200',
      cardClass: 'border-green-200',
    }
  }

  return {
    badge: 'Sem previsão',
    badgeClass: 'text-slate-600 bg-slate-100 border-slate-200',
    cardClass: 'border-slate-200',
  }
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
  if (nome === 'EM TRANSPORTE') return 'SAIU PARA ENTREGA'
  if (nome === 'ENTREGUE') return 'PÓS VENDAS'
  return nome
}

const STATUS_BOARD = [
  'EM PRODUÇÃO',
  'EM TRANSPORTE',
  'ENTREGUE',
  'OCORRÊNCIA',
  'FINALIZADO',
]

function getStatusEntrega(previsao?: string | null) {
  if (!previsao) return 'normal'

  const hoje = new Date()
  const data = new Date(previsao)

  hoje.setHours(0, 0, 0, 0)
  data.setHours(0, 0, 0, 0)

  if (data < hoje) return 'atrasado'
  if (data.getTime() === hoje.getTime()) return 'hoje'

  return 'normal'
}

export default function PosVendasBoard() {
  const supabase = useMemo(() => createClient(), [])

  const [statuses, setStatuses] = useState<StatusPosVenda[]>([])
  const [pedidos, setPedidos] = useState<PosVendaComLead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingPedidoId, setDraggingPedidoId] = useState<number | null>(null)
  const [nivelUsuarioLogado, setNivelUsuarioLogado] = useState<NivelAcesso>('consulta')
  const [modalAberto, setModalAberto] = useState(false)
  const [pedidoEditando, setPedidoEditando] = useState<PosVendaComLead | null>(null)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [pedidoHistorico, setPedidoHistorico] = useState<PosVendaComLead | null>(null)
  const [historicoMovimentacoes, setHistoricoMovimentacoes] = useState<PosVendaMovimentacao[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)

  const [transportadoraEdit, setTransportadoraEdit] = useState('')
  const [rastreioEdit, setRastreioEdit] = useState('')
  const [previsaoEdit, setPrevisaoEdit] = useState('')
  const [observacoesEdit, setObservacoesEdit] = useState('')
  const [dropStatus, setDropStatus] = useState<string | null>(null)
  const [movendo, setMovendo] = useState(false)

  const [busca, setBusca] = useState('')
  const [responsavelFiltro, setResponsavelFiltro] = useState('Todos')
  const [vendedorFiltro, setVendedorFiltro] = useState('Todos')
  const [transportadoraFiltro, setTransportadoraFiltro] = useState('Todos')
  const [statusFiltro, setStatusFiltro] = useState('Todos')
  const [periodoFiltro, setPeriodoFiltro] = useState('Todos')
  const [ordenacao, setOrdenacao] = useState('data_desc')

  async function buscarTodosPosVendasBase() {
    const limite = 1000
    let inicio = 0
    const idsVistos = new Set<number>()
    let todos: PosVenda[] = []

    while (true) {
      const { data, error } = await supabase
        .from('pos_vendas')
        .select('*')
        .order('id', { ascending: true })
        .range(inicio, inicio + limite - 1)

      if (error) throw error

      const lote = (data || []) as PosVenda[]
      const novos = lote.filter((item) => {
        if (idsVistos.has(item.id)) return false
        idsVistos.add(item.id)
        return true
      })
      todos = [...todos, ...novos]

      if (lote.length < limite) break
      inicio += limite
    }

    return todos
  }

  async function buscarTodosLeadsRelacionados(ids: number[]) {
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from('leads')
      .select(
        'id, nome_cliente, nome_empresa, vendedor, telefone, produto_interesse, valor_orcamento'
      )
      .in('id', ids)

    if (error) throw error

    return (data || []) as LeadRelacionado[]
  }

  function abrirModalEdicao(pedido: PosVendaComLead) {
    setPedidoEditando(pedido)
    setTransportadoraEdit(pedido.transportadora || '')
    setRastreioEdit(pedido.codigo_rastreio || '')
    setPrevisaoEdit(pedido.data_prevista_entrega || '')
    setObservacoesEdit(pedido.observacoes || '')
    setModalAberto(true)
  }

  async function abrirHistorico(pedido: PosVendaComLead) {
    setPedidoHistorico(pedido)
    setModalHistoricoAberto(true)
    setLoadingHistorico(true)
    setHistoricoMovimentacoes([])

    const { data, error } = await supabase
      .from('pos_vendas_movimentacoes')
      .select('*')
      .eq('pos_venda_id', pedido.id)
      .order('movido_em', { ascending: false })

    if (error) {
      console.error('Erro ao buscar histórico do pós-vendas:', error)
      setHistoricoMovimentacoes([])
      setLoadingHistorico(false)
      return
    }

    setHistoricoMovimentacoes((data || []) as PosVendaMovimentacao[])
    setLoadingHistorico(false)
  }

  async function salvarEdicao() {
    if (!pedidoEditando) return

    const agoraIso = new Date().toISOString()

    const dadosAtualizados = {
      transportadora: transportadoraEdit.trim() || null,
      codigo_rastreio: rastreioEdit.trim() || null,
      data_prevista_entrega: previsaoEdit || null,
      observacoes: observacoesEdit.trim() || null,
      updated_at: agoraIso,
    }

    const { error } = await supabase
      .from('pos_vendas')
      .update(dadosAtualizados)
      .eq('id', pedidoEditando.id)

    if (error) {
      console.error('Erro ao salvar edição do pós-vendas:', error)
      alert('Erro ao salvar as informações do pós-vendas.')
      return
    }

    setPedidos((prev) =>
      prev.map((item) =>
        item.id === pedidoEditando.id
          ? {
              ...item,
              ...dadosAtualizados,
            }
          : item
      )
    )

    setModalAberto(false)
    setPedidoEditando(null)
    setTransportadoraEdit('')
    setRastreioEdit('')
    setPrevisaoEdit('')
    setObservacoesEdit('')
  }

  async function buscarDados() {
    setLoading(true)

    try {
      const [statusRes, posVendasBase] = await Promise.all([
        supabase
          .from('cadastro_status_pos_venda')
          .select('*')
          .eq('ativo', true)
          .order('ordem', { ascending: true }),
        buscarTodosPosVendasBase(),
      ])

      if (statusRes.error) {
        console.error('Erro ao buscar status do pós-vendas:', statusRes.error)
        setStatuses([])
      } else {
        setStatuses((statusRes.data || []) as StatusPosVenda[])
      }

      const leadIds = Array.from(new Set(posVendasBase.map((item) => item.lead_id)))
      const leadsRelacionados = await buscarTodosLeadsRelacionados(leadIds)

      const mapaLeads = new Map<number, LeadRelacionado>()
      for (const lead of leadsRelacionados) {
        mapaLeads.set(lead.id, lead)
      }

      const pedidosComLead: PosVendaComLead[] = posVendasBase.map((item) => ({
        ...item,
        lead: mapaLeads.get(item.lead_id) || null,
      }))

      setPedidos(pedidosComLead)
    } catch (error) {
      console.error('Erro ao buscar pós-vendas:', error)
      setStatuses([])
      setPedidos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function carregarTudo() {
      await buscarDados()

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

  const responsaveis = Array.from(
    new Set(pedidos.map((item) => item.responsavel).filter(Boolean))
  ) as string[]

  const vendedores = Array.from(
    new Set(pedidos.map((item) => item.lead?.vendedor).filter(Boolean))
  ) as string[]

  const transportadoras = Array.from(
    new Set(pedidos.map((item) => item.transportadora).filter(Boolean))
  ) as string[]

  function itemDentroDoPeriodo(dataBase: string | null) {
    if (periodoFiltro === 'Todos') return true
    if (!dataBase) return false

    const dataStr = toDateOnlyString(new Date(dataBase))
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const hojeStr = toDateOnlyString(hoje)

    if (periodoFiltro === 'Hoje') return dataStr === hojeStr

    const limite = new Date(hoje)
    if (periodoFiltro === '7_dias') limite.setDate(limite.getDate() - 7)
    else if (periodoFiltro === '30_dias') limite.setDate(limite.getDate() - 30)
    else if (periodoFiltro === '90_dias') limite.setDate(limite.getDate() - 90)
    else return true

    return dataStr >= toDateOnlyString(limite)
  }

  const pedidosFiltrados = pedidos.filter((item) => {
    const termo = busca.toLowerCase()

    const bateBusca =
      !termo ||
      item.lead?.nome_cliente?.toLowerCase().includes(termo) ||
      item.lead?.nome_empresa?.toLowerCase().includes(termo) ||
      item.lead?.telefone?.toLowerCase().includes(termo) ||
      item.lead?.produto_interesse?.toLowerCase().includes(termo) ||
      item.transportadora?.toLowerCase().includes(termo) ||
      item.codigo_rastreio?.toLowerCase().includes(termo)

    const bateResponsavel =
      responsavelFiltro === 'Todos'
        ? true
        : item.responsavel === responsavelFiltro

    const bateVendedor =
      vendedorFiltro === 'Todos'
        ? true
        : item.lead?.vendedor === vendedorFiltro

    const bateTransportadora =
      transportadoraFiltro === 'Todos'
        ? true
        : item.transportadora === transportadoraFiltro

    const bateStatus =
      statusFiltro === 'Todos'
        ? true
        : item.status_pos_venda === statusFiltro

    const batePeriodo = itemDentroDoPeriodo(item.created_at)

    return (
      bateBusca &&
      bateResponsavel &&
      bateVendedor &&
      bateTransportadora &&
      bateStatus &&
      batePeriodo
    )
  })

  const pedidosFinalizados = pedidosFiltrados.filter(
    (item) => item.status_pos_venda === 'FINALIZADO'
  )

  const statusesBoard = statuses.filter((status) => STATUS_BOARD.includes(status.nome))

  function pedidosDaColuna(statusNome: string) {
    const isFinalizado = statusNome === 'FINALIZADO'

    const lista = isFinalizado
      ? pedidosFinalizados
      : pedidosFiltrados.filter((item) => item.status_pos_venda === statusNome)

    if (ordenacao === 'valor_desc') {
      return [...lista].sort(
        (a, b) => Number(b.lead?.valor_orcamento || 0) - Number(a.lead?.valor_orcamento || 0)
      )
    }

    if (ordenacao === 'valor_asc') {
      return [...lista].sort(
        (a, b) => Number(a.lead?.valor_orcamento || 0) - Number(b.lead?.valor_orcamento || 0)
      )
    }

    if (ordenacao === 'prazo_asc') {
      return [...lista].sort((a, b) =>
        String(a.data_prevista_entrega || '').localeCompare(String(b.data_prevista_entrega || ''))
      )
    }

    if (ordenacao === 'prazo_desc') {
      return [...lista].sort((a, b) =>
        String(b.data_prevista_entrega || '').localeCompare(String(a.data_prevista_entrega || ''))
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

  const pedidosEmProducao = pedidosFiltrados.filter(
    (item) => item.status_pos_venda === 'EM PRODUÇÃO'
  )

  const pedidosSaiuEntrega = pedidosFiltrados.filter(
    (item) => item.status_pos_venda === 'EM TRANSPORTE'
  )

  const pedidosPosVendas = pedidosFiltrados.filter(
    (item) => item.status_pos_venda === 'ENTREGUE'
  )

  const pedidosOcorrencia = pedidosFiltrados.filter(
    (item) => item.status_pos_venda === 'OCORRÊNCIA'
  )

  const totalGeral = pedidosFiltrados
    .filter((item) => item.status_pos_venda !== 'FINALIZADO')
    .reduce((acc, item) => acc + Number(item.lead?.valor_orcamento || 0), 0)

  async function moverPedido(posVendaId: number, novoStatus: string) {
    const pedidoAtual = pedidos.find((item) => item.id === posVendaId)
    if (!pedidoAtual || pedidoAtual.status_pos_venda === novoStatus) return

    setMovendo(true)

    const pedidosAnteriores = pedidos
    const agoraIso = new Date().toISOString()

    const dadosAtualizacao: {
      status_pos_venda: string
      updated_at: string
      data_entrega?: string
    } = {
      status_pos_venda: novoStatus,
      updated_at: agoraIso,
    }

    if (novoStatus === 'ENTREGUE' && !pedidoAtual.data_entrega) {
      dadosAtualizacao.data_entrega = agoraIso.slice(0, 10)
    }

    setPedidos((prev) =>
      prev.map((item) =>
        item.id === posVendaId
          ? {
              ...item,
              ...dadosAtualizacao,
            }
          : item
      )
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error: updateError } = await supabase
      .from('pos_vendas')
      .update(dadosAtualizacao)
      .eq('id', posVendaId)

    if (updateError) {
      console.error('Erro ao mover pedido no pós-vendas:', updateError)
      alert('Erro ao atualizar status do pedido.')
      setPedidos(pedidosAnteriores)
      setMovendo(false)
      return
    }

    const { error: historicoError } = await supabase
      .from('pos_vendas_movimentacoes')
      .insert({
        pos_venda_id: posVendaId,
        user_id: user?.id || null,
        status_anterior: pedidoAtual.status_pos_venda,
        novo_status: novoStatus,
        movido_em: agoraIso,
      })

    if (historicoError) {
      console.error('Erro ao gravar histórico do pós-vendas:', historicoError)
      alert('Status atualizado, mas houve erro ao gravar o histórico.')
    }

    setMovendo(false)
  }

  function handleDragStart(posVendaId: number) {
    if (nivelUsuarioLogado === 'consulta') return
    setDraggingPedidoId(posVendaId)
  }

  function handleDragEnd() {
    setDraggingPedidoId(null)
    setDropStatus(null)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Operação
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Pós-vendas
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe a execução dos pedidos fechados até a entrega e finalização.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Total em acompanhamento:{' '}
            <span className="font-bold text-slate-900">
              {pedidosFiltrados.filter((item) => item.status_pos_venda !== 'FINALIZADO').length}
            </span>
            <span className="mx-2 text-slate-400">|</span>
            <span className="font-bold text-slate-900">{formatCurrency(totalGeral)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Buscar pedido
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente, empresa, telefone, produto, transportadora..."
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Responsável
            </label>
            <select
              value={responsavelFiltro}
              onChange={(e) => setResponsavelFiltro(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              {responsaveis.map((responsavel) => (
                <option key={responsavel} value={responsavel}>
                  {responsavel}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Vendedor
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
              Transportadora
            </label>
            <select
              value={transportadoraFiltro}
              onChange={(e) => setTransportadoraFiltro(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              {transportadoras.map((transportadora) => (
                <option key={transportadora} value={transportadora}>
                  {transportadora}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Status
            </label>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              {statusesBoard.map((status) => (
                <option key={status.id} value={status.nome}>
                  {getNomeExibicaoStatus(status.nome)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Período
            </label>
            <select
              value={periodoFiltro}
              onChange={(e) => setPeriodoFiltro(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="Todos">Todos</option>
              <option value="Hoje">Hoje</option>
              <option value="7_dias">Últimos 7 dias</option>
              <option value="30_dias">Últimos 30 dias</option>
              <option value="90_dias">Últimos 90 dias</option>
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
              <option value="prazo_asc">Prazo mais próximo</option>
              <option value="prazo_desc">Prazo mais distante</option>
            </select>
          </div>

          <div className="flex items-end gap-3 xl:col-span-2">
            <button
              type="button"
              onClick={buscarDados}
              className="h-12 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Atualizar
            </button>

            <button
              type="button"
              onClick={() => {
                setBusca('')
                setResponsavelFiltro('Todos')
                setVendedorFiltro('Todos')
                setTransportadoraFiltro('Todos')
                setStatusFiltro('Todos')
                setPeriodoFiltro('Todos')
                setOrdenacao('data_desc')
              }}
              className="h-12 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Limpar
            </button>
          </div>
        </div>
      </section>

      {!loading ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Em Produção
            </p>
            <p className="mt-3 text-3xl font-black text-slate-900">
              {pedidosEmProducao.length}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Pedidos em fase de produção
            </p>
          </div>

          <div className="rounded-[24px] border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              Saiu para Entrega
            </p>
            <p className="mt-3 text-3xl font-black text-blue-900">
              {pedidosSaiuEntrega.length}
            </p>
            <p className="mt-2 text-sm text-blue-700">
              Pedidos em transporte
            </p>
          </div>

          <div className="rounded-[24px] border border-green-200 bg-green-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-700">
              Pós-vendas
            </p>
            <p className="mt-3 text-3xl font-black text-green-900">
              {pedidosPosVendas.length}
            </p>
            <p className="mt-2 text-sm text-green-700">
              Pedidos entregues em acompanhamento
            </p>
          </div>

          <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
              Ocorrência
            </p>
            <p className="mt-3 text-3xl font-black text-red-900">
              {pedidosOcorrencia.length}
            </p>
            <p className="mt-2 text-sm text-red-700">
              Pedidos com atenção necessária
            </p>
          </div>

        </section>
      ) : null}

      {loading ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Carregando pós-vendas...
        </section>
      ) : statusesBoard.length === 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Nenhum status ativo encontrado no pós-vendas.
        </section>
      ) : (
        <section className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-5">
            {statusesBoard.map((status) => {
              const isFinalizado = status.nome === 'FINALIZADO'
              const itens = pedidosDaColuna(status.nome)
              const classes = getStatusClasses(status.cor)
              const totalColuna = itens.reduce(
                (acc, item) => acc + Number(item.lead?.valor_orcamento || 0),
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
                      setDraggingPedidoId(null)
                      return
                    }

                    if (draggingPedidoId) {
                      await moverPedido(draggingPedidoId, status.nome)
                    }
                    setDropStatus(null)
                    setDraggingPedidoId(null)
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
                          {itens.length} pedido(s)
                        </p>
                      </div>

                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${classes.badge}`}>
                        {formatCurrency(totalColuna)}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
                    {isFinalizado ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        <p className="mb-2 font-bold">
                          {pedidosFinalizados.length} pedido(s) finalizado(s)
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = '/pos-vendas/finalizados'
                          }}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          Ver base de finalizados
                        </button>
                      </div>
                    ) : itens.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        Nenhum pedido nesta etapa
                      </div>
                    ) : (
                      itens.map((item) => {
                        const prazoVisual = getPrazoVisual(item.data_prevista_entrega)

                        return (
                                                    <div
                            key={item.id}
                            draggable={nivelUsuarioLogado !== 'consulta'}
                            onDragStart={() => handleDragStart(item.id)}
                            onDragEnd={handleDragEnd}
                            className={`rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${
                              nivelUsuarioLogado !== 'consulta' ? 'cursor-grab' : 'cursor-default'
                            } ${draggingPedidoId === item.id ? 'opacity-60' : ''} ${
                              item.status_pos_venda === 'OCORRÊNCIA'
                                ? 'bg-red-50 border-red-400'
                                : getStatusEntrega(item.data_prevista_entrega) === 'atrasado'
                                ? 'bg-red-50 border-red-300'
                                : getStatusEntrega(item.data_prevista_entrega) === 'hoje'
                                ? 'bg-yellow-50 border-yellow-300'
                                : 'bg-white'
                            }`}
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-base font-black text-slate-900">
                                  {item.lead?.nome_cliente || `Lead #${item.lead_id}`}
                                </h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  {item.lead?.nome_empresa || 'Sem empresa informada'}
                                </p>
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                  #{item.id}
                                </span>

                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${prazoVisual.badgeClass}`}
                                >
                                  {prazoVisual.badge}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-2 text-sm text-slate-600">
                              <p>
                                <span className="font-bold text-slate-700">Responsável:</span>{' '}
                                {item.responsavel || '-'}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Vendedor:</span>{' '}
                                {item.lead?.vendedor || '-'}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Produto:</span>{' '}
                                {item.lead?.produto_interesse || '-'}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Telefone:</span>{' '}
                                {item.lead?.telefone || '-'}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Transportadora:</span>{' '}
                                {item.transportadora || '-'}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Rastreio:</span>{' '}
                                {item.codigo_rastreio || '-'}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Início:</span>{' '}
                                {formatDateBR(item.data_inicio)}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Previsão de entrega:</span>{' '}
                                {formatDateBR(item.data_prevista_entrega)}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Entrega:</span>{' '}
                                {formatDateBR(item.data_entrega)}
                              </p>
                              <p>
                                <span className="font-bold text-slate-700">Valor:</span>{' '}
                                {formatCurrency(item.lead?.valor_orcamento || 0)}
                              </p>
                            </div>

                            {item.observacoes ? (
                              <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                {item.observacoes}
                              </div>
                            ) : null}

                            <div className="mt-4 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (nivelUsuarioLogado !== 'consulta') {
                                      abrirModalEdicao(item)
                                    }
                                  }}
                                  disabled={nivelUsuarioLogado === 'consulta'}
                                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                                    nivelUsuarioLogado !== 'consulta'
                                      ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  Editar pedido
                                </button>

                                <button
                                  type="button"
                                  onClick={() => abrirHistorico(item)}
                                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                                >
                                  Histórico
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {item.status_pos_venda === 'EM TRANSPORTE' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (nivelUsuarioLogado !== 'consulta') {
                                        moverPedido(item.id, 'ENTREGUE')
                                      }
                                    }}
                                    disabled={nivelUsuarioLogado === 'consulta'}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                      nivelUsuarioLogado !== 'consulta'
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'cursor-not-allowed bg-slate-200 text-slate-400'
                                    }`}
                                  >
                                    Marcar entregue
                                  </button>
                                ) : null}

                                {item.status_pos_venda === 'ENTREGUE' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (nivelUsuarioLogado !== 'consulta') {
                                        moverPedido(item.id, 'FINALIZADO')
                                      }
                                    }}
                                    disabled={nivelUsuarioLogado === 'consulta'}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                      nivelUsuarioLogado !== 'consulta'
                                        ? 'bg-slate-800 text-white hover:bg-slate-900'
                                        : 'cursor-not-allowed bg-slate-200 text-slate-400'
                                    }`}
                                  >
                                    Finalizar
                                  </button>
                                ) : null}

                                {item.status_pos_venda !== 'OCORRÊNCIA' &&
                                item.status_pos_venda !== 'FINALIZADO' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (nivelUsuarioLogado !== 'consulta') {
                                        moverPedido(item.id, 'OCORRÊNCIA')
                                      }
                                    }}
                                    disabled={nivelUsuarioLogado === 'consulta'}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                      nivelUsuarioLogado !== 'consulta'
                                        ? 'bg-red-600 text-white hover:bg-red-700'
                                        : 'cursor-not-allowed bg-slate-200 text-slate-400'
                                    }`}
                                  >
                                    Ocorrência
                                  </button>
                                ) : null}

                                {item.status_pos_venda === 'OCORRÊNCIA' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (nivelUsuarioLogado !== 'consulta') {
                                        moverPedido(item.id, 'ENTREGUE')
                                      }
                                    }}
                                    disabled={nivelUsuarioLogado === 'consulta'}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                      nivelUsuarioLogado !== 'consulta'
                                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                                        : 'cursor-not-allowed bg-slate-200 text-slate-400'
                                    }`}
                                  >
                                    Voltar para Pós-vendas
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {movendo ? (
        <div className="fixed bottom-6 right-6 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl">
          Atualizando status do pós-vendas...
        </div>
      ) : null}

      {modalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-slate-900">
              Editar Pós-venda
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Transportadora
                </label>
                <input
                  value={transportadoraEdit}
                  onChange={(e) => setTransportadoraEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Rastreio
                </label>
                <input
                  value={rastreioEdit}
                  onChange={(e) => setRastreioEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Previsão de entrega
                </label>
                <input
                  type="date"
                  value={previsaoEdit ? previsaoEdit.slice(0, 10) : ''}
                  onChange={(e) => setPrevisaoEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Observações
                </label>
                <textarea
                  value={observacoesEdit}
                  onChange={(e) => setObservacoesEdit(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalAberto(false)
                  setPedidoEditando(null)
                  setObservacoesEdit('')
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={salvarEdicao}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalHistoricoAberto && pedidoHistorico ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-slate-900">
              Histórico do Pedido
            </h2>

            <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
              <p>
                <strong>Cliente:</strong> {pedidoHistorico.lead?.nome_cliente || '-'}
              </p>

              <p>
                <strong>Empresa:</strong> {pedidoHistorico.lead?.nome_empresa || '-'}
              </p>

              <p>
                <strong>Transportadora:</strong> {pedidoHistorico.transportadora || '-'}
              </p>

              <p>
                <strong>Rastreio:</strong> {pedidoHistorico.codigo_rastreio || '-'}
              </p>

              <p>
                <strong>Previsão de entrega:</strong> {formatDateBR(pedidoHistorico.data_prevista_entrega)}
              </p>

              <p>
                <strong>Data de entrega:</strong> {formatDateBR(pedidoHistorico.data_entrega)}
              </p>

              <p>
                <strong>Início:</strong> {formatDateBR(pedidoHistorico.data_inicio)}
              </p>

              <p>
                <strong>Valor:</strong> {formatCurrency(pedidoHistorico.lead?.valor_orcamento || 0)}
              </p>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Timeline de movimentações
              </h3>

              {loadingHistorico ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Carregando histórico...
                </div>
              ) : historicoMovimentacoes.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Nenhuma movimentação encontrada.
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoMovimentacoes.map((mov) => (
                    <div
                      key={mov.id}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <p className="text-sm font-bold text-slate-900">
                        {mov.status_anterior || 'Início'} → {mov.novo_status}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateBR(mov.movido_em)} às{' '}
                        {new Date(mov.movido_em).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setModalHistoricoAberto(false)
                  setPedidoHistorico(null)
                  setHistoricoMovimentacoes([])
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}