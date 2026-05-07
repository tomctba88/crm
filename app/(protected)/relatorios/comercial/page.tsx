'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Lead = {
  id: number
  status: string | null
  valor_orcamento: number | string | null
  valor_frete?: number | string | null
  vendedor: string | null
  tipo_contato?: string | null
  data_contato: string | null
  data_fechamento?: string | null
  data_cancelamento?: string | null
  data_finalizacao?: string | null
  data_retorno?: string | null
  created_at?: string | null
  produto_interesse: string | null
  uf?: string | null
  cidade?: string | null
  municipio?: string | null
  cidade_cliente?: string | null
}

type DashboardComercial = {
  leads: number
  orcamentos: number
  pedidos: number
  totalOrcamentos: number
  totalPedidos: number
  ticketMedio: number
  conversao: number
  meta: number
  comissao: number
  cancelados: number
  valorCancelado: number
  ticketCancelado: number
  aguardando: number
  valorAguardando: number
  taxaCancelamento: number
  taxaAguardando: number
  metaMensal: number
  atingimentoMeta: number
  vendasNovas: number
  valorVendasNovas: number
  vendasPostergadas: number
  valorVendasPostergadas: number
  desqualificados: number
  valorDesqualificado: number
  ticketDesqualificado: number
  taxaDesqualificado: number
}

type GraficoItem = {
  label: string
  valor: number
}

type RankingVendedorItem = {
  vendedor: string
  valorVendido: number
  fechamentos: number
  ticketMedio: number
  leads: number
  orcamentos: number
  conversao: number
  cancelados: number
  valorCancelado: number
  meta: number
  atingimentoMeta: number
}

type StatusMesItem = {
  mes: string
  fechados: number
  cancelados: number
  aguardando: number
}

type PedidoLocalizacaoItem = {
  localizacao: string
  valorOrcado: number
  valorFechado: number
  quantidadeVendas: number
  ticketMedio: number
  percentualVendas: number
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const META_MENSAL_EMPRESA = 450000
const META_MENSAL_VENDEDOR = 150000

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  let raw = String(value).trim()
  if (!raw) return 0

  raw = raw.replace(/[R$\s]/g, '')

  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')

  if (hasComma && hasDot) {
    raw = raw.replace(/\./g, '').replace(',', '.')
  } else if (hasComma && !hasDot) {
    raw = raw.replace(',', '.')
  }

  raw = raw.replace(/[^\d.-]/g, '')

  const number = Number(raw)
  return Number.isFinite(number) ? number : 0
}

function temContatoPreenchido(tipoContato: string | null | undefined) {
  return !!normalizeText(tipoContato)
}

function temValorOrcamento(value: unknown) {
  return parseMoney(value) > 0
}

function isPedido(status: string | null | undefined) {
  return normalizeText(status) === 'FECHADO'
}

function isCancelado(status: string | null | undefined) {
  const s = normalizeText(status)

  return (
    s.includes('CANCELADO') ||
    s.includes('PERDIDO')
  )
}

function isAguardando(status: string | null | undefined) {
  const s = normalizeText(status)

  return (
    s.includes('AGUARDANDO') ||
    s.includes('ORCAR') ||
    s.includes('ORÇAR') ||
    s.includes('ATENDENDO') ||
    s.includes('NEGOCIANDO') ||
    s.includes('POSTERGADO')
  )
}

function isNegociando(status: string | null | undefined) {
  return normalizeText(status).includes('NEGOCIANDO')
}

function isDesqualificadoOuFornecedor(status?: string | null) {
  const s = normalizeText(status || '')

  return (
    s === 'DESQUALIFICADO' ||
    s === 'LICITACAO' ||
    s === 'LICITAÇÃO' ||
    s === 'FORNECEDOR'
  )
}

function getMonthKey(dateString: string | null | undefined) {
  if (!dateString) return ''

  const value = String(dateString).trim()
  if (!value) return ''

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 7)
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [, mes, ano] = value.split('/')
    return `${ano}-${mes}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function calcularComissao(meta: number) {
  if (meta <= 80000) return meta * 0.01
  return meta * 0.02
}

function getMonthShortLabel(index: number) {
  return MESES[index].slice(0, 3).toUpperCase()
}

function getLeadMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_contato) ||
    getMonthKey(lead.data_retorno) ||
    getMonthKey(lead.created_at)
  )
}

function getVendaMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_fechamento) ||
    getMonthKey(lead.data_contato) ||
    getMonthKey(lead.created_at)
  )
}

function getFinalizacaoMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_finalizacao) ||
    getMonthKey(lead.data_cancelamento) ||
    getMonthKey(lead.data_contato) ||
    getMonthKey(lead.created_at)
  )
}

function bateMesAno(monthKey: string, anoFiltro: number, mesFiltro: number) {
  if (!monthKey) return false

  if (mesFiltro === 0) {
    return monthKey.startsWith(`${anoFiltro}-`)
  }

  return monthKey === `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`
}

const UF_LABELS: Record<string, string> = {
  AC: 'Acre (AC)',
  AL: 'Alagoas (AL)',
  AP: 'Amapá (AP)',
  AM: 'Amazonas (AM)',
  BA: 'Bahia (BA)',
  CE: 'Ceará (CE)',
  DF: 'Distrito Federal (DF)',
  ES: 'Espírito Santo (ES)',
  GO: 'Goiás (GO)',
  MA: 'Maranhão (MA)',
  MT: 'Mato Grosso (MT)',
  MS: 'Mato Grosso do Sul (MS)',
  MG: 'Minas Gerais (MG)',
  PA: 'Pará (PA)',
  PB: 'Paraíba (PB)',
  PR: 'Paraná (PR)',
  PE: 'Pernambuco (PE)',
  PI: 'Piauí (PI)',
  RJ: 'Rio de Janeiro (RJ)',
  RN: 'Rio Grande do Norte (RN)',
  RS: 'Rio Grande do Sul (RS)',
  RO: 'Rondônia (RO)',
  RR: 'Roraima (RR)',
  SC: 'Santa Catarina (SC)',
  SP: 'São Paulo (SP)',
  SE: 'Sergipe (SE)',
  TO: 'Tocantins (TO)',
}

function getLeadLocalizacao(lead: Lead) {
  const cidade = normalizeText(
    lead.cidade || lead.municipio || lead.cidade_cliente || ''
  )

  const uf = normalizeText(lead.uf || '')

  const isCuritiba =
    cidade.includes('CURITIBA') ||
    cidade === 'CTBA' ||
    cidade.includes('CTBA')

  if (isCuritiba) return 'Curitiba (CTBA)'

  if (uf === 'PR' || uf === 'PARANA') return 'Paraná (PR)'

  if (UF_LABELS[uf]) return UF_LABELS[uf]

  return uf || 'Não informado'
}

export default function ComercialPage() {
  const supabase = useMemo(() => createClient(), [])
  const hoje = new Date()

  const [dados, setDados] = useState<DashboardComercial | null>(null)
  const [loading, setLoading] = useState(true)
  const [vendedorFiltro, setVendedorFiltro] = useState('TODOS')
  const [mesFiltro, setMesFiltro] = useState(0)
  const [anoFiltro, setAnoFiltro] = useState(hoje.getFullYear())
  const [vendedores, setVendedores] = useState<string[]>([])
  const [graficoVendasMes, setGraficoVendasMes] = useState<GraficoItem[]>([])
  const [graficoFunil, setGraficoFunil] = useState<GraficoItem[]>([])
  const [graficoProdutos, setGraficoProdutos] = useState<GraficoItem[]>([])
  const [graficoStatusQtd, setGraficoStatusQtd] = useState<GraficoItem[]>([])
  const [graficoStatusValor, setGraficoStatusValor] = useState<GraficoItem[]>([])
  const [graficoStatusMes, setGraficoStatusMes] = useState<StatusMesItem[]>([])
  const [pedidosPorLocalizacao, setPedidosPorLocalizacao] = useState<
  PedidoLocalizacaoItem[]
>([])
const [localizacaoExpandido, setLocalizacaoExpandido] = useState(false)
const [ordenacaoLocalizacao, setOrdenacaoLocalizacao] = useState<{
  campo: keyof PedidoLocalizacaoItem
  direcao: 'asc' | 'desc'
}>({
  campo: 'valorFechado',
  direcao: 'desc',
})

const [analiseCanais, setAnaliseCanais] = useState<
  {
    canal: string
    leads: number
    valorLeads: number
    fechados: number
    valorFechados: number
    taxa: number
  }[]
>([])

  useEffect(() => {
    buscarDados()
  }, [vendedorFiltro, mesFiltro, anoFiltro])

  async function buscarTodosOsLeads() {
  const limite = 1000
  let inicio = 0
  let todos: Lead[] = []

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
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

async function buscarDados() {
  setLoading(true)

  let leadsData: Lead[] = []

  try {
    leadsData = await buscarTodosOsLeads()
  } catch (error) {
    console.error('Erro ao buscar dados comerciais:', error)
    setLoading(false)
    return
  }

    const vendedoresUnicos = Array.from(
      new Set(
        leadsData
          .map((lead) => (lead.vendedor || '').trim())
          .filter((nome) => nome !== '')
      )
    ).sort((a, b) => a.localeCompare(b))

    setVendedores(vendedoresUnicos)

        const leadsFiltrados = leadsData.filter((lead) => {
      const vendedorAtual = (lead.vendedor || '').trim()
      const mesLead = getLeadMonthKey(lead)

      const bateVendedor =
        vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

      const bateMes = bateMesAno(mesLead, anoFiltro, mesFiltro)

      return bateVendedor && bateMes
    })

    const pedidosPeriodo = leadsData.filter((lead) => {
      const vendedorAtual = (lead.vendedor || '').trim()
      const mesVenda = getVendaMonthKey(lead)

      const bateVendedor =
        vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

      return (
        bateVendedor &&
        bateMesAno(mesVenda, anoFiltro, mesFiltro) &&
        temValorOrcamento(lead.valor_orcamento) &&
        isPedido(lead.status)
      )
    })

    const canceladosPeriodo = leadsData.filter((lead) => {
      const vendedorAtual = (lead.vendedor || '').trim()
      const mesFinalizacao = getFinalizacaoMonthKey(lead)

      const bateVendedor =
        vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

      return (
        bateVendedor &&
        bateMesAno(mesFinalizacao, anoFiltro, mesFiltro) &&
        isCancelado(lead.status)
      )
    })

const desqualificadosPeriodo = leadsData.filter((lead) => {
  const vendedorAtual = (lead.vendedor || '').trim()
  const mesFinalizacao = getFinalizacaoMonthKey(lead)

  const bateVendedor =
    vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

  return (
    bateVendedor &&
    bateMesAno(mesFinalizacao, anoFiltro, mesFiltro) &&
    isDesqualificadoOuFornecedor(lead.status)
  )
})

    const leads = leadsFiltrados.length

    const orcamentos = leadsFiltrados.filter((lead) =>
      temValorOrcamento(lead.valor_orcamento)
    )

    const pedidos = pedidosPeriodo

    const canceladosQuantidade = canceladosPeriodo

    const canceladosValor = canceladosPeriodo.filter((lead) =>
      temValorOrcamento(lead.valor_orcamento)
    )

    const aguardandoQuantidade = leadsFiltrados.filter((lead) =>
      isAguardando(lead.status)
    )

    const aguardandoValor = leadsFiltrados.filter(
      (lead) => isAguardando(lead.status) && temValorOrcamento(lead.valor_orcamento)
    )

    const totalOrcamentos = orcamentos.reduce(
      (acc, lead) =>
        acc +
        parseMoney(lead.valor_orcamento) +
        parseMoney(lead.valor_frete),
      0
    )

    const totalPedidos = pedidos.reduce(
      (acc, lead) =>
        acc +
        parseMoney(lead.valor_orcamento) +
        parseMoney(lead.valor_frete),
      0
    )

    const valorCancelado = canceladosValor.reduce(
      (acc, lead) => acc + parseMoney(lead.valor_orcamento),
      0
    )

    const valorDesqualificado = desqualificadosPeriodo.reduce(
  (acc, lead) => acc + parseMoney(lead.valor_orcamento),
  0
)

const ticketDesqualificado =
  desqualificadosPeriodo.length > 0
    ? valorDesqualificado / desqualificadosPeriodo.length
    : 0

const taxaDesqualificado =
  leads > 0 ? (desqualificadosPeriodo.length / leads) * 100 : 0

    const valorAguardando = aguardandoValor.reduce(
      (acc, lead) => acc + parseMoney(lead.valor_orcamento),
      0
    )

    const meta = pedidos.reduce(
      (acc, lead) => acc + parseMoney(lead.valor_orcamento),
      0
    )

    const comissao = calcularComissao(meta)

    const vendasNovas = pedidos.filter((lead) => {
      const origem = getLeadMonthKey(lead)
      const fechamento = getVendaMonthKey(lead)

      return origem && fechamento && origem === fechamento
    })

    const vendasPostergadas = pedidos.filter((lead) => {
      const origem = getLeadMonthKey(lead)
      const fechamento = getVendaMonthKey(lead)

      return origem && fechamento && origem !== fechamento
    })

    const valorVendasNovas = vendasNovas.reduce(
      (acc, lead) =>
        acc +
        parseMoney(lead.valor_orcamento) +
        parseMoney(lead.valor_frete),
      0
    )

    const valorVendasPostergadas = vendasPostergadas.reduce(
      (acc, lead) =>
        acc +
        parseMoney(lead.valor_orcamento) +
        parseMoney(lead.valor_frete),
      0
    )

const metaBase =
  vendedorFiltro === 'TODOS'
    ? META_MENSAL_EMPRESA
    : META_MENSAL_VENDEDOR

const multiplicadorMes = mesFiltro === 0 ? 12 : 1

const metaMensal = metaBase * multiplicadorMes

const atingimentoMeta = metaMensal > 0 ? (meta / metaMensal) * 100 : 0

    const taxaCancelamento =
      orcamentos.length > 0
        ? (canceladosQuantidade.length / orcamentos.length) * 100
        : 0

    const taxaAguardando =
      orcamentos.length > 0
        ? (aguardandoQuantidade.length / orcamentos.length) * 100
        : 0

    setDados({
      leads,
      orcamentos: orcamentos.length,
      pedidos: pedidos.length,
      totalOrcamentos,
      totalPedidos,
      ticketMedio: pedidos.length > 0 ? totalPedidos / pedidos.length : 0,
      conversao:
        orcamentos.length > 0 ? (pedidos.length / orcamentos.length) * 100 : 0,
      meta,
      comissao,
      cancelados: canceladosQuantidade.length,
      valorCancelado,
      ticketCancelado:
        canceladosQuantidade.length > 0
          ? valorCancelado / canceladosQuantidade.length
          : 0,
      aguardando: aguardandoQuantidade.length,
      valorAguardando,
      taxaCancelamento,
      taxaAguardando,
      metaMensal,
      atingimentoMeta,
      vendasNovas: vendasNovas.length,
      valorVendasNovas,
      vendasPostergadas: vendasPostergadas.length,
      valorVendasPostergadas,
desqualificados: desqualificadosPeriodo.length,
valorDesqualificado,
ticketDesqualificado,
taxaDesqualificado,
    })

    const vendasPorMes: GraficoItem[] = MESES.map((_, index) => {
      const mesKey = `${anoFiltro}-${String(index + 1).padStart(2, '0')}`

      const valor = leadsData
        .filter((lead) => {
          const vendedorAtual = (lead.vendedor || '').trim()
          const mesLead = getLeadMonthKey(lead)

          const bateVendedor =
            vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

          const bateMes = mesLead ? mesLead === mesKey : true

          return (
            bateVendedor &&
            bateMes &&
            temValorOrcamento(lead.valor_orcamento) &&
            isPedido(lead.status)
          )
        })
        .reduce(
          (acc, lead) =>
            acc +
            parseMoney(lead.valor_orcamento) +
            parseMoney(lead.valor_frete),
          0
        )

      return {
        label: getMonthShortLabel(index),
        valor,
      }
    })

    setGraficoVendasMes(vendasPorMes)

    const totalLeads = leadsFiltrados.length

const leadsDesqualificados = leadsFiltrados.filter((lead) => {
  const status = normalizeText(lead.status)
  return status === 'DESQUALIFICADO' || status === 'DESQUALIFICADA'
}).length

const leadsRecompra = leadsFiltrados.filter((lead) => {
  const tipoContato = normalizeText(lead.tipo_contato)
  return tipoContato === 'RECOMPRA'
}).length

const leadsNovos = Math.max(totalLeads - leadsDesqualificados - leadsRecompra, 0)

setGraficoFunil([
  { label: 'Total de Lead', valor: totalLeads },
  { label: 'Desqualificados', valor: leadsDesqualificados },
  { label: 'Recompra', valor: leadsRecompra },
  { label: 'Novos', valor: leadsNovos },
])

const canaisConfig = [
  { canal: 'Google', tipos: ['GOOGLE'] },
  { canal: 'Recompra', tipos: ['RECOMPRA'] },
  { canal: 'Retorno', tipos: ['RETORNO'] },
  { canal: 'Megaflex', tipos: ['MEGAFLEX'] },
  { canal: 'Email', tipos: ['EMAIL'] },
  { canal: 'Lojista/Revenda', tipos: ['LOJISTA', 'REVENDA', 'LOJISTA/REVENDA'] },
  { canal: 'Indicação/Particular', tipos: ['INDICACAO', 'PARTICULAR', 'INDICACAO/PARTICULAR'] },
  { canal: 'Telefone', tipos: ['TELEFONE'] },
  { canal: 'Organico', tipos: ['ORGANICO'] },
  { canal: 'Site', tipos: ['SITE'] },
  { canal: 'Instagram', tipos: ['INSTAGRAM'] },
  { canal: 'Loja', tipos: ['LOJA'] },
]

const analiseCanalFinal = canaisConfig.map((config) => {
  const base = leadsFiltrados.filter((lead) =>
    config.tipos.includes(normalizeText(lead.tipo_contato))
  )

  const leadsCanal = base.length

  const fechadosBase = base.filter((lead) => {
  if (!lead.data_fechamento) return false

  const dataFechamento = new Date(`${lead.data_fechamento}T00:00:00`)

  return (
    temValorOrcamento(lead.valor_orcamento) &&
    isPedido(lead.status) &&
    dataFechamento.getFullYear() === anoFiltro &&
(mesFiltro === 0 || dataFechamento.getMonth() + 1 === mesFiltro)
  )
})

const fechadosCanal = fechadosBase.length

const fechadosPostergados = fechadosBase.filter((lead) => {
  if (!lead.data_contato || !lead.data_fechamento) return false

  const contato = new Date(`${lead.data_contato}T00:00:00`)
  const fechamento = new Date(`${lead.data_fechamento}T00:00:00`)

  return (
    contato.getMonth() !== fechamento.getMonth() ||
    contato.getFullYear() !== fechamento.getFullYear()
  )
})

const valorPostergado = fechadosPostergados.reduce(
  (acc, lead) => acc + parseMoney(lead.valor_orcamento),
  0
)

  const valorLeads = base.reduce(
    (acc, lead) =>
      acc +
      parseMoney(lead.valor_orcamento) +
      parseMoney(lead.valor_frete),
    0
  )

  const valorFechados = fechadosBase.reduce(
    (acc, lead) =>
      acc +
      parseMoney(lead.valor_orcamento) +
      parseMoney(lead.valor_frete),
    0
  )

  return {
    canal: config.canal,
    leads: leadsCanal,
    valorLeads,
    fechados: fechadosCanal,
    valorFechados,
    taxa: leadsCanal > 0 ? (fechadosCanal / leadsCanal) * 100 : 0,
  }
})

setAnaliseCanais(analiseCanalFinal)

const produtosMap = new Map<string, number>()

    leadsFiltrados
      .filter(
        (lead) =>
          temValorOrcamento(lead.valor_orcamento) &&
          isPedido(lead.status)
      )
      .forEach((lead) => {
        const produto =
          (lead.produto_interesse || 'Sem produto').trim() || 'Sem produto'
        produtosMap.set(
          produto,
          (produtosMap.get(produto) || 0) + parseMoney(lead.valor_orcamento)
        )
      })

    setGraficoProdutos(
  Array.from(produtosMap.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)
)

    
    setGraficoStatusQtd([
  { label: 'Total Orçado', valor: orcamentos.length },
  { label: 'Fechados', valor: pedidos.length },
  { label: 'Perdidos', valor: canceladosQuantidade.length },
  { label: 'Oportunidades', valor: aguardandoQuantidade.length },
])

setGraficoStatusValor([
  { label: 'Total Orçado', valor: totalOrcamentos },
  { label: 'Fechados', valor: totalPedidos },
  { label: 'Perdidos', valor: valorCancelado },
  { label: 'Oportunidades', valor: valorAguardando },
])

    setGraficoStatusMes(
      MESES.map((_, index) => {
        const mesKey = `${anoFiltro}-${String(index + 1).padStart(2, '0')}`

        const baseMes = leadsData.filter((lead) => {
          const vendedorAtual = (lead.vendedor || '').trim()
          const mesLead = getLeadMonthKey(lead)

          const bateVendedor =
            vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

          const bateMes = mesLead ? mesLead === mesKey : true

          return bateVendedor && bateMes
        })

        return {
          mes: getMonthShortLabel(index),
          fechados: baseMes.filter(
            (lead) =>
              temValorOrcamento(lead.valor_orcamento) && isPedido(lead.status)
          ).length,
          cancelados: baseMes.filter((lead) => isCancelado(lead.status)).length,
          aguardando: baseMes.filter((lead) => isAguardando(lead.status)).length,
        }
      })
    )

const localizacaoMap = new Map<string, PedidoLocalizacaoItem>()

leadsFiltrados.forEach((lead) => {
  const localizacao = getLeadLocalizacao(lead)

  const atual = localizacaoMap.get(localizacao) || {
    localizacao,
    valorOrcado: 0,
    valorFechado: 0,
    quantidadeVendas: 0,
    ticketMedio: 0,
    percentualVendas: 0,
  }

  if (temValorOrcamento(lead.valor_orcamento)) {
    atual.valorOrcado +=
      parseMoney(lead.valor_orcamento) + parseMoney(lead.valor_frete)
  }

  if (temValorOrcamento(lead.valor_orcamento) && isPedido(lead.status)) {
    atual.valorFechado +=
      parseMoney(lead.valor_orcamento) + parseMoney(lead.valor_frete)

    atual.quantidadeVendas += 1
  }

  localizacaoMap.set(localizacao, atual)
})

const pedidosLocalizacaoFinal = Array.from(localizacaoMap.values())
  .filter((item) => item.valorOrcado > 0 || item.quantidadeVendas > 0)
  .map((item) => ({
    ...item,
    ticketMedio:
      item.quantidadeVendas > 0
        ? item.valorFechado / item.quantidadeVendas
        : 0,
    percentualVendas:
      totalPedidos > 0 ? (item.valorFechado / totalPedidos) * 100 : 0,
  }))
  .sort((a, b) => b.valorFechado - a.valorFechado)

setPedidosPorLocalizacao(pedidosLocalizacaoFinal)

    setLoading(false)
  }

  const anosDisponiveis = useMemo(() => {
    const anoAtual = hoje.getFullYear()
    return [anoAtual - 1, anoAtual, anoAtual + 1]
  }, [hoje])

  if (loading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        Carregando dashboard comercial...
      </div>
    )
  }

  if (!dados) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        Não foi possível carregar os dados.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">
              Dashboard Comercial
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Indicadores comerciais consolidados do CRM.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Vendedor
              </label>
              <select
                value={vendedorFiltro}
                onChange={(e) => setVendedorFiltro(e.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none"
              >
                <option value="TODOS">TODOS</option>
                {vendedores.map((vendedor) => (
                  <option key={vendedor} value={vendedor}>
                    {vendedor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Mês
              </label>
              <select
                value={mesFiltro}
                onChange={(e) => setMesFiltro(Number(e.target.value))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none"
              >
                <option value={0}>Todos os meses</option>
                {MESES.map((mes, index) => (
                  <option key={mes} value={index + 1}>
                    {mes}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Ano
              </label>
              <select
                value={anoFiltro}
                onChange={(e) => setAnoFiltro(Number(e.target.value))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none"
              >
                {anosDisponiveis.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card titulo="Qtd. Vendas" valor={String(dados.pedidos)} cor="bg-emerald-50" />
          <Card titulo="Total de Vendas" valor={formatCurrency(dados.totalPedidos)} cor="bg-emerald-50" />
          <Card
            titulo="Ticket Médio"
            valor={formatCurrency(dados.pedidos > 0 ? dados.totalPedidos / dados.pedidos : 0)}
            cor="bg-cyan-50"
          />
          <Card
            titulo="Tx. Conversão"
            valor={`${(dados.leads > 0 ? (dados.pedidos / dados.leads) * 100 : 0).toFixed(2)}%`}
            cor="bg-lime-50"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card titulo="Vendas Novas" valor={String(dados.vendasNovas)} cor="bg-emerald-50" />
          <Card titulo="Valor Vendas Novas" valor={formatCurrency(dados.valorVendasNovas)} cor="bg-emerald-50" />
          <Card titulo="Vendas Postergadas" valor={String(dados.vendasPostergadas)} cor="bg-amber-50" />
          <Card titulo="Valor Postergado" valor={formatCurrency(dados.valorVendasPostergadas)} cor="bg-amber-50" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card titulo="Desqualif./Fornecedor" valor={String(dados.desqualificados)} cor="bg-purple-50" />
          <Card titulo="Valor Desqualificado" valor={formatCurrency(dados.valorDesqualificado)} cor="bg-purple-50" />
          <Card titulo="Ticket Desqualif." valor={formatCurrency(dados.ticketDesqualificado)} cor="bg-purple-50" />
          <Card titulo="Tx. Desqualif." valor={`${dados.taxaDesqualificado.toFixed(2)}%`} cor="bg-purple-100" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card titulo="Qtd. Orçamentos" valor={String(dados.orcamentos)} cor="bg-sky-50" />
          <Card titulo="Valor Orçado + Frete" valor={formatCurrency(dados.totalOrcamentos)} cor="bg-blue-50" />
          <Card
            titulo="Ticket Orçados"
            valor={formatCurrency(dados.orcamentos > 0 ? dados.totalOrcamentos / dados.orcamentos : 0)}
            cor="bg-cyan-50"
          />
          <Card
            titulo="Tx. Orçamento"
            valor={`${(dados.leads > 0 ? (dados.orcamentos / dados.leads) * 100 : 0).toFixed(2)}%`}
            cor="bg-indigo-50"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card titulo="Qtd. Perdidos" valor={String(dados.cancelados)} cor="bg-rose-50" />
          <Card titulo="Valor Perdido" valor={formatCurrency(dados.valorCancelado)} cor="bg-red-50" />
          <Card titulo="Ticket Perdido" valor={formatCurrency(dados.ticketCancelado)} cor="bg-pink-50" />
          <Card titulo="Tx. Perdido" valor={`${dados.taxaCancelamento.toFixed(2)}%`} cor="bg-red-100" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card titulo="Oportunidades" valor={String(dados.aguardando)} cor="bg-amber-50" />
          <Card titulo="Valor Oportunidades" valor={formatCurrency(dados.valorAguardando)} cor="bg-yellow-50" />
          <Card
            titulo="Ticket Oportunidades"
            valor={formatCurrency(dados.aguardando > 0 ? dados.valorAguardando / dados.aguardando : 0)}
            cor="bg-orange-50"
          />
          <Card titulo="Tx. Oportunidades" valor={`${dados.taxaAguardando.toFixed(2)}%`} cor="bg-amber-100" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
        <ChartCard
          title="Meta x Realizado"
          subtitle="Comparativo do faturamento fechado contra a meta mensal"
        >
          <MetaProgressCard
            realizado={dados.totalPedidos}
            meta={dados.metaMensal}
            percentual={dados.atingimentoMeta}
          />
        </ChartCard>

        <ChartCard
          title="Status por quantidade"
          subtitle="Comparativo entre fechados, cancelados e aguardando"
        >
          <HorizontalBarChart items={graficoStatusQtd} formatter={(valor) => String(valor)} />
        </ChartCard>

        <ChartCard
          title="Status por valor"
          subtitle="Comparativo financeiro por status no período filtrado"
        >
          <HorizontalBarChart items={graficoStatusValor} formatter={(valor) => formatCurrency(valor)} />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
  <ChartCard
    title="Vendas por mês"
    subtitle="Valores fechados por mês no ano selecionado"
  >
    <VerticalBarChart
      items={graficoVendasMes}
      formatter={(valor) => formatCurrency(valor)}
      compactCurrency
    />
  </ChartCard>

  <ChartCard
    title="Funil comercial"
    subtitle="Qualidade do lead"
  >
    <HorizontalBarChart items={graficoFunil} formatter={(valor) => String(valor)} />
  </ChartCard>
</section>

<section className="grid grid-cols-1 gap-6">
  <ChartCard
    title="Analise por canal de vendas"
    subtitle="Funis por canal com total de leads, fechados e taxa de conversão"
  >
    <AnaliseCanalGrid items={analiseCanais} />
  </ChartCard>
</section>

      <section className="grid grid-cols-1 gap-6">
  <ChartCard
    title="Evolução mensal (Leads, Orçamentos e Fechados)"
    subtitle="Comparativo mensal em linha"
  >
    <LineChartComercial items={graficoStatusMes} />
  </ChartCard>
</section>

<section className="grid grid-cols-1 gap-6">
  <ChartCard
    title="Pedidos por localização"
    subtitle="Curitiba separado do Paraná, com valores, vendas, ticket médio e participação no total"
  >
    <PedidosPorLocalizacaoCard
  items={pedidosPorLocalizacao}
  expandido={localizacaoExpandido}
  onToggleExpandido={() => setLocalizacaoExpandido((prev) => !prev)}
  ordenacao={ordenacaoLocalizacao}
  onOrdenar={(campo) => {
    setOrdenacaoLocalizacao((prev) => ({
      campo,
      direcao:
        prev.campo === campo && prev.direcao === 'desc' ? 'asc' : 'desc',
    }))
  }}
/>
  </ChartCard>
</section>

      <section className="grid grid-cols-1 gap-6">
        <ChartCard
          title="Produtos com maior valor fechado"
          subtitle="Top 5 produtos por valor de fechamento no período"
        >
          <HorizontalBarChart
  items={graficoProdutos}
  formatter={(valor) => formatCurrency(valor)}
  compactLabels
  initialLimit={5}
/>
        </ChartCard>

      </section>
    </div>
  )
}

function PedidosPorLocalizacaoCard({
  items,
  expandido,
  onToggleExpandido,
  ordenacao,
  onOrdenar,
}: {
  items: PedidoLocalizacaoItem[]
  expandido: boolean
  onToggleExpandido: () => void
  ordenacao: {
    campo: keyof PedidoLocalizacaoItem
    direcao: 'asc' | 'desc'
  }
  onOrdenar: (campo: keyof PedidoLocalizacaoItem) => void
}) {
  const itemsOrdenados = [...items].sort((a, b) => {
    const valorA = a[ordenacao.campo]
    const valorB = b[ordenacao.campo]

    if (typeof valorA === 'string' && typeof valorB === 'string') {
      return ordenacao.direcao === 'asc'
        ? valorA.localeCompare(valorB)
        : valorB.localeCompare(valorA)
    }

    const numeroA = Number(valorA) || 0
    const numeroB = Number(valorB) || 0

    return ordenacao.direcao === 'asc'
      ? numeroA - numeroB
      : numeroB - numeroA
  })

  function iconeOrdenacao(campo: keyof PedidoLocalizacaoItem) {
    if (ordenacao.campo !== campo) return '↕'
    return ordenacao.direcao === 'asc' ? '↑' : '↓'
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Nenhum pedido encontrado para os filtros selecionados.
      </div>
    )
  }

  const topRegioes = itemsOrdenados.slice(0, 5)
  const rankingVisivel = expandido ? itemsOrdenados : itemsOrdenados.slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {topRegioes.map((item) => (
          <div
            key={item.localizacao}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {item.localizacao}
            </p>

            <p className="mt-3 text-xl font-black text-slate-900">
              {formatCurrency(item.valorFechado)}
            </p>

            <p className="mt-1 text-xs font-semibold text-slate-500">
              {item.percentualVendas.toFixed(2)}% das vendas
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-bold">
                <button
                  type="button"
                  onClick={() => onOrdenar('localizacao')}
                  className="flex items-center gap-2 font-bold hover:text-blue-700"
                >
                  Localização {iconeOrdenacao('localizacao')}
                </button>
              </th>

              <th className="px-4 py-3 text-right font-bold">
                <button
                  type="button"
                  onClick={() => onOrdenar('valorOrcado')}
                  className="ml-auto flex items-center gap-2 font-bold hover:text-blue-700"
                >
                  Valor Orçado {iconeOrdenacao('valorOrcado')}
                </button>
              </th>

              <th className="px-4 py-3 text-right font-bold">
                <button
                  type="button"
                  onClick={() => onOrdenar('valorFechado')}
                  className="ml-auto flex items-center gap-2 font-bold hover:text-blue-700"
                >
                  Valor Fechado {iconeOrdenacao('valorFechado')}
                </button>
              </th>

              <th className="px-4 py-3 text-right font-bold">
                <button
                  type="button"
                  onClick={() => onOrdenar('quantidadeVendas')}
                  className="ml-auto flex items-center gap-2 font-bold hover:text-blue-700"
                >
                  Qtd. Vendas {iconeOrdenacao('quantidadeVendas')}
                </button>
              </th>

              <th className="px-4 py-3 text-right font-bold">
                <button
                  type="button"
                  onClick={() => onOrdenar('ticketMedio')}
                  className="ml-auto flex items-center gap-2 font-bold hover:text-blue-700"
                >
                  Ticket Médio {iconeOrdenacao('ticketMedio')}
                </button>
              </th>

              <th className="px-4 py-3 text-right font-bold">
                <button
                  type="button"
                  onClick={() => onOrdenar('percentualVendas')}
                  className="ml-auto flex items-center gap-2 font-bold hover:text-blue-700"
                >
                  % sobre vendas {iconeOrdenacao('percentualVendas')}
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {rankingVisivel.map((item) => (
              <tr key={item.localizacao} className="border-t border-slate-200">
                <td className="px-4 py-3 font-bold text-slate-800">
                  {item.localizacao}
                </td>

                <td className="px-4 py-3 text-right text-slate-700">
                  {formatCurrency(item.valorOrcado)}
                </td>

                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                  {formatCurrency(item.valorFechado)}
                </td>

                <td className="px-4 py-3 text-right text-slate-700">
                  {item.quantidadeVendas}
                </td>

                <td className="px-4 py-3 text-right text-slate-700">
                  {formatCurrency(item.ticketMedio)}
                </td>

                <td className="px-4 py-3 text-right font-bold text-blue-700">
                  {item.percentualVendas.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {itemsOrdenados.length > 5 ? (
        <div className="mt-6 flex justify-center border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onToggleExpandido}
            className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {expandido ? 'Recolher estados' : 'Expandir todos os estados'}
          </button>
        </div>
      ) : null}

      <p className="text-xs text-slate-400">
        Curitiba é calculada separadamente. O Paraná não inclui Curitiba neste quadro.
      </p>
    </div>
  )
}

function FunnelMetricBar() {
  return null
}

function MetricRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const tamanho = value.length

  const tamanhoTexto =
    tamanho <= 10
      ? 'text-4xl'
      : tamanho <= 14
        ? 'text-3xl'
        : tamanho <= 18
          ? 'text-2xl'
          : 'text-xl'

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>

      <p
        className={`whitespace-nowrap font-black leading-none tracking-tight text-slate-900 ${tamanhoTexto}`}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function StatusMonthChart({
  items,
}: {
  items: StatusMesItem[]
}) {
  const max = Math.max(
    ...items.flatMap((item) => [item.fechados, item.cancelados, item.aguardando]),
    1
  )

  return (
    <div className="space-y-5">
      {items.map((item) => (
        <div key={item.mes} className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-slate-900">{item.mes}</div>
            <div className="text-xs text-slate-500">
              F {item.fechados} • C {item.cancelados} • A {item.aguardando}
            </div>
          </div>

          <div className="space-y-3">
            <StatusBar label="Fechados" value={item.fechados} max={max} barClass="bg-green-600" />
            <StatusBar label="Cancelados" value={item.cancelados} max={max} barClass="bg-rose-500" />
            <StatusBar label="Aguardando" value={item.aguardando} max={max} barClass="bg-amber-500" />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusBar({
  label,
  value,
  max,
  barClass,
}: {
  label: string
  value: number
  max: number
  barClass: string
}) {
  const width = value > 0 ? Math.max((value / max) * 100, 4) : 0

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-600">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100">
        <div
          className={`h-3 rounded-full ${barClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function MetaProgressCard({
  realizado,
  meta,
  percentual,
}: {
  realizado: number
  meta: number
  percentual: number
}) {
  const percentualLimitado = Math.min(percentual, 100)

  const statusTexto =
    percentual >= 100
      ? 'Meta atingida'
      : percentual >= 50
        ? 'Em evolução'
        : 'Abaixo do esperado'

  const barClass =
    percentual >= 100
      ? 'bg-green-600'
      : percentual >= 50
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3">
        <MetricRow label="Realizado" value={formatCurrency(realizado)} />
        <MetricRow label="Meta" value={formatCurrency(meta)} />
        <MetricRow label="Atingimento" value={`${percentual.toFixed(2)}%`} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-sm font-bold text-slate-700">{statusTexto}</span>
          <span className="text-sm font-bold text-slate-700">
            {percentual.toFixed(2)}%
          </span>
        </div>

        <div className="h-5 rounded-full bg-slate-100">
          <div
            className={`h-5 rounded-full transition-all ${barClass}`}
            style={{ width: `${Math.max(percentualLimitado, 2)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function Card({
  titulo,
  valor,
  cor,
  textoEscuro = false,
}: {
  titulo: string
  valor: string
  cor: string
  textoEscuro?: boolean
}) {
  const valorLimpo = String(valor).trim()
  const tamanho = valorLimpo.length

  const tamanhoTexto =
    tamanho <= 8
      ? 'text-2xl md:text-3xl'
      : tamanho <= 14
        ? 'text-xl md:text-2xl'
        : tamanho <= 20
          ? 'text-lg md:text-xl'
          : 'text-base md:text-lg'

  return (
    <div
      className={`min-w-0 rounded-2xl border border-slate-200 p-5 shadow-sm ${cor} ${
        textoEscuro ? 'text-slate-900' : 'text-slate-900'
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {titulo}
      </p>

      <div className="mt-3 overflow-hidden">
        <p
          className={`truncate font-black leading-none tracking-tight ${tamanhoTexto}`}
          title={valor}
        >
          {valor}
        </p>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function VerticalBarChart({
  items,
  formatter,
  compactCurrency = false,
}: {
  items: GraficoItem[]
  formatter: (value: number) => string
  compactCurrency?: boolean
}) {
  const max = Math.max(...items.map((item) => item.valor), 1)

  return (
    <div className="grid h-[340px] grid-cols-12 gap-3">
      {items.map((item) => {
        const altura = item.valor > 0 ? Math.max((item.valor / max) * 100, 8) : 0

        return (
          <div key={item.label} className="col-span-1 flex min-w-0 flex-col justify-end">
            <div className="flex h-[250px] items-end justify-center rounded-2xl bg-slate-50 px-1 py-2">
  <div
  className="w-full rounded-t-xl bg-blue-600 transition-all flex items-center justify-center relative overflow-hidden"
  style={{ height: `${altura}%` }}
  title={`${item.label}: ${formatter(item.valor)}`}
>
  {item.valor > 0 && (
    <span
      className="text-white font-bold text-center"
      style={{
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontSize: `${Math.max(12, altura * 0.18)}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {compactCurrency
        ? formatter(item.valor).replace(',00', '')
        : formatter(item.valor)}
    </span>
  )}
</div>
</div>
            <div className="mt-2 text-center text-xs font-bold text-slate-600">
              {item.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HorizontalBarChart({
  items,
  formatter,
  compactLabels = false,
  initialLimit,
}: {
  items: GraficoItem[]
  formatter: (value: number) => string
  compactLabels?: boolean
  initialLimit?: number
}) {
  const [expandido, setExpandido] = useState(false)

  const itemsVisiveis =
    initialLimit && !expandido ? items.slice(0, initialLimit) : items

  const max = Math.max(...items.map((item) => item.valor), 1)

  function getBarClass(label: string) {
    if (label === 'Total Orçado') return 'bg-sky-300'
    if (label === 'Fechados') return 'bg-emerald-500'
    if (label === 'Perdidos') return 'bg-rose-400'
    if (label === 'Oportunidades') return 'bg-orange-400'

    if (label === 'Total de Lead') return 'bg-blue-600'
    if (label === 'Desqualificados') return 'bg-red-500'
    if (label === 'Recompra') return 'bg-purple-600'
    if (label === 'Novos') return 'bg-green-600'

    return 'bg-slate-400'
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Sem dados para exibir.
        </div>
      ) : (
        <>
          {itemsVisiveis.map((item) => {
            const largura =
              item.valor > 0 ? Math.max((item.valor / max) * 100, 6) : 0

            return (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div
                    className={`text-sm font-semibold text-slate-700 ${
                      compactLabels ? 'max-w-[60%] truncate' : ''
                    }`}
                    title={item.label}
                  >
                    {item.label}
                  </div>

                  <div className="text-sm font-bold text-slate-900">
                    {formatter(item.valor)}
                  </div>
                </div>

                <div className="h-4 rounded-full bg-slate-100">
                  <div
                    className={`h-4 rounded-full ${getBarClass(item.label)}`}
                    style={{ width: `${largura}%` }}
                    title={`${item.label}: ${formatter(item.valor)}`}
                  />
                </div>
              </div>
            )
          })}

          {initialLimit && items.length > initialLimit ? (
            <div className="mt-6 flex justify-center border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setExpandido((prev) => !prev)}
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                {expandido ? 'Recolher produtos' : 'Expandir todos os produtos'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
  
function AnaliseCanalGrid({
  items,
}: {
  items: {
    canal: string
    leads: number
    valorLeads: number
    fechados: number
    valorFechados: number
    taxa: number
  }[]
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Sem dados para exibir.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <CanalFunnelCard key={item.canal} item={item} />
      ))}
    </div>
  )
}

function CanalFunnelCard({
  item,
}: {
item: {
  canal: string
  leads: number
  valorLeads: number
  fechados: number
  valorFechados: number
  taxa: number
}
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4">
        <h3 className="text-center text-sm font-black text-slate-900">
          {item.canal}
        </h3>
      </div>

      <div className="flex flex-col items-center gap-[6px]">
        <FunilEtapa
  titulo="Total de Leads"
  valor={String(item.leads)}
  valorSecundario={formatCurrency(item.valorLeads)}
  cor="bg-sky-500"
  largura="100%"
  altura="92px"
  clipPath="polygon(5% 0%, 95% 0%, 88% 100%, 12% 100%)"
/>

<FunilEtapa
  titulo="Leads Fechados"
  valor={String(item.fechados)}
  valorSecundario={formatCurrency(item.valorFechados)}
  cor="bg-emerald-500"
  largura="78%"
  altura="88px"
  clipPath="polygon(8% 0%, 92% 0%, 84% 100%, 16% 100%)"
/>

<FunilEtapa
  titulo="Taxa de Conversão"
  valor={`${item.taxa.toFixed(2)}%`}
  cor="bg-orange-500"
  largura="56%"
  altura="78px"
  clipPath="polygon(11% 0%, 89% 0%, 80% 100%, 20% 100%)"
  compacto
/>
      </div>
    </div>
  )
}

function FunilEtapa({
  titulo,
  valor,
  valorSecundario,
  cor,
  largura,
  altura,
  clipPath,
  compacto = false,
}: {
  titulo: string
  valor: string
  valorSecundario?: string
  cor: string
  largura: string
  altura: string
  clipPath: string
  compacto?: boolean
}) {
  const tamanho = valor.length

  const tamanhoTexto = compacto
    ? tamanho <= 6
      ? 'text-xl'
      : 'text-lg'
    : tamanho <= 6
      ? 'text-2xl'
      : tamanho <= 10
        ? 'text-xl'
        : 'text-lg'

  return (
    <div
      className={`${cor} flex items-center justify-center overflow-hidden px-3 text-center text-white shadow-sm`}
      style={{
        width: largura,
        height: altura,
        clipPath,
      }}
      title={valorSecundario ? `${titulo}: ${valor} | ${valorSecundario}` : `${titulo}: ${valor}`}
    >
      <div className="min-w-0 max-w-full px-2">
        <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.08em] opacity-90">
          {titulo}
        </div>

        <div className={`mt-1 truncate font-black leading-none ${tamanhoTexto}`}>
          {valor}
        </div>

        {valorSecundario ? (
          <div className="mt-1 truncate text-[10px] font-bold leading-tight opacity-95">
            {valorSecundario}
          </div>
        ) : null}
      </div>
    </div>
  )
}
function LineChartComercial({
  items,
}: {
  items: StatusMesItem[]
}) {
  const max = Math.max(
    ...items.flatMap((item) => [
      item.fechados,
      item.cancelados,
      item.aguardando,
    ]),
    1
  )

  const chartWidth = 1200
  const chartHeight = 340
  const leftPad = 8
  const rightPad = 8
  const topPad = 24
  const bottomPad = 54
  const usableWidth = chartWidth - leftPad - rightPad
  const usableHeight = chartHeight - topPad - bottomPad

  function getX(index: number) {
    if (items.length <= 1) return chartWidth / 2
    return leftPad + (index / (items.length - 1)) * usableWidth
  }

  function getY(value: number) {
    return topPad + usableHeight - (value / max) * usableHeight
  }

  function buildPoints(key: 'fechados' | 'cancelados' | 'aguardando') {
    return items
      .map((item, i) => `${getX(i)},${getY(item[key])}`)
      .join(' ')
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[360px]">
        <polyline fill="none" stroke="#22c55e" strokeWidth="3" points={buildPoints('fechados')} />
        <polyline fill="none" stroke="#f43f5e" strokeWidth="3" points={buildPoints('cancelados')} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="3" points={buildPoints('aguardando')} />

        {items.map((item, i) => {
          const x = getX(i)
          const yFechados = getY(item.fechados)
          const yCancelados = getY(item.cancelados)
          const yAguardando = getY(item.aguardando)

          return (
            <g key={item.mes}>
              <circle cx={x} cy={yFechados} r="4" fill="#22c55e" />
              <circle cx={x} cy={yCancelados} r="4" fill="#f43f5e" />
              <circle cx={x} cy={yAguardando} r="4" fill="#f59e0b" />

              <text x={x} y={yFechados - 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="#16a34a">
                {item.fechados}
              </text>

              <text x={x + 18} y={yCancelados - 6} textAnchor="start" fontSize="12" fontWeight="700" fill="#e11d48">
                {item.cancelados}
              </text>

              <text x={x - 18} y={yAguardando - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="#d97706">
                {item.aguardando}
              </text>

              <text x={x} y={chartHeight - 14} textAnchor="middle" fontSize="14" fontWeight="700" fill="#64748b">
                {item.mes}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="mt-4 flex items-center justify-center gap-8 text-sm font-semibold">
        <span className="text-green-600">● Fechados</span>
        <span className="text-rose-500">● Perdidos</span>
        <span className="text-amber-500">● Oportunidades</span>
      </div>
    </div>
  )
}
