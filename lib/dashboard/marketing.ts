export type MarketingLead = {
  id?: number
  tipo_contato?: string | null
  status?: string | null
  valor_orcamento?: number | string | null
  valor_frete?: number | string | null
  produto_interesse?: string | null
  data_contato?: string | null
}

export type MarketingScope = 'geral' | 'google' | 'organico_retorno'

export type ProdutoGrupo =
  | 'CADEIRAS'
  | 'MOVEIS'
  | 'REVENDA DE CADEIRAS'
  | 'MOVEIS E CADEIRAS'
  | 'REFORMA'
  | 'COMPONENTES'
  | 'DESQUALIFICADOS'
  | 'LICITACAO'
  | 'SEM PRODUTO'

export type ProdutoMetricas = {
  produto: ProdutoGrupo
  leads: number
  orcamentos: number
  txQualificacao: number
  valorOrcamento: number
  ticketOrcamento: number
  pedidos: number
  valorPedidos: number
  txConversao: number
  valorEmAberto: number
  txConversaoValor: number
  ticketPedidos: number
  orcamentosEmAberto: number
}

export type MarketingDashboardData = {
  resumo: {
    leads: number
    orcamentos: number
    txQualificacao: number
    valorOrcamento: number
    ticketOrcamento: number
    pedidos: number
    valorPedidos: number
    txConversao: number
    valorEmAberto: number
    txConversaoValor: number
    ticketPedidos: number
    orcamentosEmAberto: number
  }
  porProduto: ProdutoMetricas[]
  conversaoProduto: {
    produto: Exclude<ProdutoGrupo, 'SEM PRODUTO'>
    leads: number
    orcamentos: number
    pedidos: number
    txQualificacao: number
    txConversao: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
    orcamentosEmAberto: number
  }[]
  conversaoProdutoNaoClassificados: {
    produto: 'SEM PRODUTO / NAO MAPEADOS'
    leads: number
    orcamentos: number
    pedidos: number
    txQualificacao: number
    txConversao: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
    orcamentosEmAberto: number
  }
  conversaoProdutoResultado: {
    leads: number
    orcamentos: number
    pedidos: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
    orcamentosEmAberto: number
  }
  porMes: {
    mes: string
    leads: number
    orcamentos: number
    pedidos: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
  }[]
}

const ORIGENS_GOOGLE = new Set(['GOOGLE', 'SITE', 'EMAIL', 'E-MAIL'])

const ORIGENS_ORGANICO_RETORNO = new Set([
  'RECOMPRA',
  'INDICACAO',
  'RETORNO',
  'ORGANICO',
])

const PRODUTO_MAP: Record<ProdutoGrupo, string[]> = {
  CADEIRAS: [
    'AUDITORIO',
    'CADEIRAS',
    'CADEIRAS ERGON.',
    'TREINAMENTO',
    'UNIVERSITARIA',
  ],
  MOVEIS: ['MOVEIS', 'MOVEIS DE ACO', 'MOVEIS SOB MEDIDA'],
  'REVENDA DE CADEIRAS': ['REVENDA DE CADEIRAS'],
  'MOVEIS E CADEIRAS': ['MOVEIS E CADEIRAS'],
  REFORMA: ['REFORMA'],
  COMPONENTES: ['COMPONENTE', 'COMPONENTES'],
  DESQUALIFICADOS: ['FORNECEDOR'],
  LICITACAO: ['LICITACAO'],
  'SEM PRODUTO': [''],
}

const TODOS_PRODUTOS: ProdutoGrupo[] = [
  'CADEIRAS',
  'MOVEIS',
  'REVENDA DE CADEIRAS',
  'MOVEIS E CADEIRAS',
  'REFORMA',
  'COMPONENTES',
  'DESQUALIFICADOS',
  'LICITACAO',
  'SEM PRODUTO',
]

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function toNumber(value: unknown) {
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

function isOrigemValida(origem: string | null | undefined, scope: MarketingScope) {
  const origemNormalizada = normalizeText(origem)

  if (scope === 'geral') return true

  if (scope === 'google') {
    return ORIGENS_GOOGLE.has(origemNormalizada)
  }

  if (scope === 'organico_retorno') {
    return ORIGENS_ORGANICO_RETORNO.has(origemNormalizada)
  }

  return false
}

function getGrupoProduto(produto: string | null | undefined): ProdutoGrupo | null {
  const produtoOriginal = (produto || '').trim()
  const produtoNormalizado = normalizeText(produto)

  if (!produtoOriginal) {
    return 'SEM PRODUTO'
  }

  if (produtoNormalizado === 'FORNECEDOR') {
    return 'DESQUALIFICADOS'
  }

  for (const grupo of TODOS_PRODUTOS) {
    if (grupo === 'SEM PRODUTO' || grupo === 'DESQUALIFICADOS') continue

    if (PRODUTO_MAP[grupo].includes(produtoNormalizado)) {
      return grupo
    }
  }

  return null
}

function temValorOrcamento(value: unknown) {
  return toNumber(value) > 0
}

function isPedido(status: string | null | undefined) {
  const s = normalizeText(status)
  return s === 'FECHADO' || s === 'PEDIDO'
}

function isEmAberto(status: string | null | undefined) {
  const statusNormalizado = normalizeText(status)

  return (
    statusNormalizado.includes('AGUARDANDO') ||
    statusNormalizado.includes('NEGOCIANDO') ||
    statusNormalizado.includes('ORCAR') ||
    statusNormalizado.includes('ORÇAR')
  )
}

function contaComoOrcamentoEmAberto(lead: MarketingLead) {
  return temContatoPreenchido(lead.tipo_contato) && isEmAberto(lead.status)
}

function calcularTaxa(numerador: number, denominador: number) {
  if (!denominador) return 0
  return (numerador / denominador) * 100
}

function calcularMetricasProduto(
  leads: MarketingLead[],
  produto: ProdutoGrupo
): ProdutoMetricas {
  const filtrados = leads.filter(
    (lead) => getGrupoProduto(lead.produto_interesse) === produto
  )

  const orcamentos = filtrados.filter(
    (lead) =>
      temContatoPreenchido(lead.tipo_contato) &&
      temValorOrcamento(lead.valor_orcamento)
  )

  const pedidos = filtrados.filter(
    (lead) =>
      temContatoPreenchido(lead.tipo_contato) &&
      temValorOrcamento(lead.valor_orcamento) &&
      isPedido(lead.status)
  )

  const abertos = filtrados.filter((lead) => contaComoOrcamentoEmAberto(lead))

  const valorOrcamento = orcamentos.reduce(
    (acc, lead) => acc + toNumber(lead.valor_orcamento),
    0
  )

  const valorPedidos = pedidos.reduce(
    (acc, lead) => acc + toNumber(lead.valor_orcamento),
    0
  )

  const valorEmAberto = abertos.reduce(
    (acc, lead) => acc + toNumber(lead.valor_orcamento),
    0
  )

  return {
    produto,
    leads: filtrados.length,
    orcamentos: orcamentos.length,
    txQualificacao: calcularTaxa(orcamentos.length, filtrados.length),
    valorOrcamento,
    ticketOrcamento: orcamentos.length ? valorOrcamento / orcamentos.length : 0,
    pedidos: pedidos.length,
    valorPedidos,
    txConversao: calcularTaxa(pedidos.length, orcamentos.length),
    valorEmAberto,
    txConversaoValor: calcularTaxa(valorPedidos, valorOrcamento),
    ticketPedidos: pedidos.length ? valorPedidos / pedidos.length : 0,
    orcamentosEmAberto: abertos.length,
  }
}

export function calcularDashboardMarketing(
  leads: MarketingLead[],
  scope: MarketingScope,
  mes?: string
): MarketingDashboardData {
  const filtradosBase = leads.filter((lead) => {
    const temContato = temContatoPreenchido(lead.tipo_contato)
    const bateOrigem = isOrigemValida(lead.tipo_contato, scope)
    const mesLead = getMonthKey(lead.data_contato)
    const bateMes = mes ? (mesLead ? mesLead === mes : false) : true

    if (scope === 'geral') {
      return temContato && bateMes
    }

    return temContato && bateOrigem && bateMes
  })

  const porProduto = TODOS_PRODUTOS.map((produto) =>
    calcularMetricasProduto(filtradosBase, produto)
  )

  const resumo = {
    leads: filtradosBase.length,

    orcamentos: filtradosBase.filter(
      (lead) =>
        temContatoPreenchido(lead.tipo_contato) &&
        temValorOrcamento(lead.valor_orcamento)
    ).length,

    txQualificacao: 0,

    valorOrcamento: filtradosBase.reduce(
      (acc, lead) =>
        acc +
        (temContatoPreenchido(lead.tipo_contato) &&
        temValorOrcamento(lead.valor_orcamento)
          ? toNumber(lead.valor_orcamento)
          : 0),
      0
    ),

    ticketOrcamento: 0,

    pedidos: filtradosBase.filter(
      (lead) =>
        temContatoPreenchido(lead.tipo_contato) &&
        temValorOrcamento(lead.valor_orcamento) &&
        isPedido(lead.status)
    ).length,

    valorPedidos: filtradosBase.reduce(
      (acc, lead) =>
        acc +
        (temContatoPreenchido(lead.tipo_contato) &&
        temValorOrcamento(lead.valor_orcamento) &&
        isPedido(lead.status)
          ? toNumber(lead.valor_orcamento)
          : 0),
      0
    ),

    txConversao: 0,

    valorEmAberto: filtradosBase.reduce(
      (acc, lead) =>
        acc +
        (contaComoOrcamentoEmAberto(lead)
          ? toNumber(lead.valor_orcamento)
          : 0),
      0
    ),

    txConversaoValor: 0,
    ticketPedidos: 0,

    orcamentosEmAberto: filtradosBase.filter(
      (lead) => contaComoOrcamentoEmAberto(lead)
    ).length,
  }

  resumo.txQualificacao = calcularTaxa(resumo.orcamentos, resumo.leads)
  resumo.ticketOrcamento = resumo.orcamentos
    ? resumo.valorOrcamento / resumo.orcamentos
    : 0
  resumo.txConversao = calcularTaxa(resumo.pedidos, resumo.orcamentos)
  resumo.txConversaoValor = calcularTaxa(resumo.valorPedidos, resumo.valorOrcamento)
  resumo.ticketPedidos = resumo.pedidos
    ? resumo.valorPedidos / resumo.pedidos
    : 0

  const conversaoProduto = porProduto
    .filter(
      (
        item
      ): item is ProdutoMetricas & {
        produto: Exclude<ProdutoGrupo, 'SEM PRODUTO'>
      } => item.produto !== 'SEM PRODUTO'
    )
    .map((item) => ({
      produto: item.produto,
      leads: item.leads,
      orcamentos: item.orcamentos,
      pedidos: item.pedidos,
      txQualificacao: item.txQualificacao,
      txConversao: item.txConversao,
      valorOrcamento: item.valorOrcamento,
      valorPedidos: item.valorPedidos,
      valorEmAberto: item.valorEmAberto,
      orcamentosEmAberto: item.orcamentosEmAberto,
    }))

  const leadsNaoClassificados = filtradosBase.filter((lead) => {
    const grupo = getGrupoProduto(lead.produto_interesse)
    return grupo === 'SEM PRODUTO' || grupo === null
  })

  const naoClassificadosOrcamentos = leadsNaoClassificados.filter(
    (lead) =>
      temContatoPreenchido(lead.tipo_contato) &&
      temValorOrcamento(lead.valor_orcamento)
  )

  const naoClassificadosPedidos = leadsNaoClassificados.filter(
    (lead) =>
      temContatoPreenchido(lead.tipo_contato) &&
      temValorOrcamento(lead.valor_orcamento) &&
      isPedido(lead.status)
  )

  const naoClassificadosAbertos = leadsNaoClassificados.filter((lead) =>
    contaComoOrcamentoEmAberto(lead)
  )

  const naoClassificadosValorOrcamento = naoClassificadosOrcamentos.reduce(
    (acc, lead) => acc + toNumber(lead.valor_orcamento),
    0
  )

  const naoClassificadosValorPedidos = naoClassificadosPedidos.reduce(
    (acc, lead) => acc + toNumber(lead.valor_orcamento),
    0
  )

  const naoClassificadosValorEmAberto = naoClassificadosAbertos.reduce(
    (acc, lead) => acc + toNumber(lead.valor_orcamento),
    0
  )

  const conversaoProdutoNaoClassificados = {
    produto: 'SEM PRODUTO / NAO MAPEADOS' as const,
    leads: leadsNaoClassificados.length,
    orcamentos: naoClassificadosOrcamentos.length,
    pedidos: naoClassificadosPedidos.length,
    txQualificacao: calcularTaxa(
      naoClassificadosOrcamentos.length,
      leadsNaoClassificados.length
    ),
    txConversao: calcularTaxa(
      naoClassificadosPedidos.length,
      naoClassificadosOrcamentos.length
    ),
    valorOrcamento: naoClassificadosValorOrcamento,
    valorPedidos: naoClassificadosValorPedidos,
    valorEmAberto: naoClassificadosValorEmAberto,
    orcamentosEmAberto: naoClassificadosAbertos.length,
  }

  const conversaoProdutoResultado = [
    ...conversaoProduto,
    conversaoProdutoNaoClassificados,
  ].reduce(
    (acc, item) => {
      acc.leads += item.leads
      acc.orcamentos += item.orcamentos
      acc.pedidos += item.pedidos
      acc.valorOrcamento += item.valorOrcamento
      acc.valorPedidos += item.valorPedidos
      acc.valorEmAberto += item.valorEmAberto
      acc.orcamentosEmAberto += item.orcamentosEmAberto
      return acc
    },
    {
      leads: 0,
      orcamentos: 0,
      pedidos: 0,
      valorOrcamento: 0,
      valorPedidos: 0,
      valorEmAberto: 0,
      orcamentosEmAberto: 0,
    }
  )

  const mesesMap = new Map<
    string,
    {
      mes: string
      leads: number
      orcamentos: number
      pedidos: number
      valorOrcamento: number
      valorPedidos: number
      valorEmAberto: number
    }
  >()

  for (const lead of filtradosBase) {
    const mesKey = getMonthKey(lead.data_contato)
    if (!mesKey) continue

    if (!mesesMap.has(mesKey)) {
      mesesMap.set(mesKey, {
        mes: mesKey,
        leads: 0,
        orcamentos: 0,
        pedidos: 0,
        valorOrcamento: 0,
        valorPedidos: 0,
        valorEmAberto: 0,
      })
    }

    const atual = mesesMap.get(mesKey)!
    atual.leads += 1

    if (
      temContatoPreenchido(lead.tipo_contato) &&
      temValorOrcamento(lead.valor_orcamento)
    ) {
      atual.orcamentos += 1
      atual.valorOrcamento += toNumber(lead.valor_orcamento)
    }

    if (
      temContatoPreenchido(lead.tipo_contato) &&
      temValorOrcamento(lead.valor_orcamento) &&
      isPedido(lead.status)
    ) {
      atual.pedidos += 1
      atual.valorPedidos += toNumber(lead.valor_orcamento)
    }

    if (contaComoOrcamentoEmAberto(lead)) {
      atual.valorEmAberto += toNumber(lead.valor_orcamento)
    }
  }

  const porMes = Array.from(mesesMap.values()).sort((a, b) =>
    a.mes.localeCompare(b.mes)
  )

  return {
    resumo,
    porProduto,
    conversaoProduto,
    conversaoProdutoNaoClassificados,
    conversaoProdutoResultado,
    porMes,
  }
}