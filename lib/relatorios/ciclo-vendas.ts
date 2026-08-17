/**
 * Ciclo de vendas — tempo entre a entrada do lead e o fechamento.
 *
 * Regra da métrica (definida com o time comercial):
 *   ciclo = data_fechamento - (data_contato ?? created_at), em dias corridos
 *   só entram leads com status FECHADO e as duas datas preenchidas.
 *
 * O número principal é a MEDIANA, não a média: um lead parado por 400 dias que
 * fecha distorce a média inteira. Média e percentis ficam ao lado para leitura.
 *
 * Este módulo é puro (sem React/Supabase) para poder ser testado isoladamente.
 */

export type LeadCiclo = {
  id: number
  created_at?: string | null
  data_contato: string | null
  data_fechamento: string | null
  status: string | null
  tipo_contato: string | null
  vendedor: string | null
  uf: string | null
  nome_cliente: string
  nome_empresa?: string | null
  produto_interesse?: string | null
  valor_orcamento: number | string | null
}

export type CicloItem = {
  id: number
  cliente: string
  empresa: string
  origem: string
  vendedor: string
  uf: string
  produto: string
  valor: number
  entrada: string
  fechamento: string
  dias: number
}

/** Lead ainda aberto — carrega a "idade" em vez do ciclo. */
export type AbertoItem = {
  id: number
  cliente: string
  origem: string
  vendedor: string
  uf: string
  status: string
  valor: number
  entrada: string
  idade: number
}

export type Estatisticas = {
  quantidade: number
  mediana: number
  media: number
  p25: number
  p75: number
  p90: number
  min: number
  max: number
  valorTotal: number
}

export const ESTATISTICAS_VAZIAS: Estatisticas = {
  quantidade: 0,
  mediana: 0,
  media: 0,
  p25: 0,
  p75: 0,
  p90: 0,
  min: 0,
  max: 0,
  valorTotal: 0,
}

/** Faixas do histograma. Ordenadas — a última é aberta à direita. */
export const FAIXAS: { label: string; min: number; max: number }[] = [
  { label: '0–7', min: 0, max: 7 },
  { label: '8–15', min: 8, max: 15 },
  { label: '16–30', min: 16, max: 30 },
  { label: '31–60', min: 31, max: 60 },
  { label: '61–90', min: 61, max: 90 },
  { label: '90+', min: 91, max: Number.POSITIVE_INFINITY },
]

/** Marcos da curva de conversão acumulada (em dias). */
export const MARCOS_CONVERSAO = [7, 15, 30, 45, 60, 90, 120, 180, 365]

export const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

export function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  let raw = String(value).trim().replace(/[R$\s]/g, '')
  const temVirgula = raw.includes(',')
  const temPonto = raw.includes('.')

  if (temVirgula && temPonto) raw = raw.replace(/\./g, '').replace(',', '.')
  else if (temVirgula && !temPonto) raw = raw.replace(',', '.')

  raw = raw.replace(/[^\d.-]/g, '')

  const numero = Number(raw)
  return Number.isFinite(numero) ? numero : 0
}

/**
 * Normaliza qualquer formato de data do CRM para `YYYY-MM-DD`.
 * Aceita ISO, timestamptz e o `DD/MM/YYYY` que vem das importações de planilha.
 */
export function toISODate(value: string | null | undefined): string | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dia, mes, ano] = raw.split('/')
    return `${ano}-${mes}-${dia}`
  }

  const data = new Date(raw)
  if (Number.isNaN(data.getTime())) return null

  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** Diferença em dias corridos entre duas datas `YYYY-MM-DD`, imune a fuso/horário de verão. */
export function diffDias(inicioISO: string, fimISO: string) {
  const paraUTC = (iso: string) => {
    const [ano, mes, dia] = iso.split('-').map(Number)
    return Date.UTC(ano, mes - 1, dia)
  }
  return Math.round((paraUTC(fimISO) - paraUTC(inicioISO)) / 86400000)
}

export function formatarDataBR(iso: string | null) {
  if (!iso) return '-'
  const [ano, mes, dia] = iso.split('-')
  if (!ano || !mes || !dia) return iso
  return `${dia}/${mes}/${ano}`
}

/** `YYYY-MM` da data de entrada do lead. */
export function mesDaData(iso: string | null) {
  return iso ? iso.slice(0, 7) : ''
}

export function rotuloMes(chave: string) {
  const [ano, mes] = chave.split('-')
  const indice = Number(mes) - 1
  if (!ano || Number.isNaN(indice) || !MESES_CURTOS[indice]) return chave
  return `${MESES_CURTOS[indice]}/${ano.slice(2)}`
}

/** Data de entrada do lead: data do contato, com o created_at como rede de segurança. */
export function dataEntrada(lead: LeadCiclo) {
  return toISODate(lead.data_contato) || toISODate(lead.created_at)
}

export function isFechado(status: string | null | undefined) {
  return normalizeText(status) === 'FECHADO'
}

/** Status que encerram o lead — não contam como "carteira aberta". */
const STATUS_ENCERRADOS = new Set([
  'FECHADO',
  'CANCELADO',
  'CANCELADA',
  'DESQUALIFICADO',
  'PEDIDO',
  'FORNECEDOR',
])

export function isAberto(status: string | null | undefined) {
  const normalizado = normalizeText(status)
  return Boolean(normalizado) && !STATUS_ENCERRADOS.has(normalizado)
}

function textoOuPadrao(valor: string | null | undefined, padrao: string) {
  const limpo = (valor || '').trim()
  return limpo || padrao
}

export type ResultadoCiclos = {
  ciclos: CicloItem[]
  /** Leads FECHADO cuja data de fechamento é anterior à de entrada — ciclo impossível. */
  inconsistentes: number
  /** Leads FECHADO sem data de entrada ou de fechamento — ficam de fora da conta. */
  semData: number
}

/** Converte a base de leads na lista de ciclos válidos, separando o que não fecha a conta. */
export function calcularCiclos(leads: LeadCiclo[]): ResultadoCiclos {
  const ciclos: CicloItem[] = []
  let inconsistentes = 0
  let semData = 0

  for (const lead of leads) {
    if (!isFechado(lead.status)) continue

    const entrada = dataEntrada(lead)
    const fechamento = toISODate(lead.data_fechamento)

    if (!entrada || !fechamento) {
      semData += 1
      continue
    }

    const dias = diffDias(entrada, fechamento)

    if (dias < 0) {
      inconsistentes += 1
      continue
    }

    ciclos.push({
      id: lead.id,
      cliente: textoOuPadrao(lead.nome_cliente, 'Sem nome'),
      empresa: textoOuPadrao(lead.nome_empresa, ''),
      origem: textoOuPadrao(lead.tipo_contato, 'Não informado'),
      vendedor: textoOuPadrao(lead.vendedor, 'Não informado'),
      uf: textoOuPadrao(lead.uf, '-'),
      produto: textoOuPadrao(lead.produto_interesse, '-'),
      valor: parseMoney(lead.valor_orcamento),
      entrada,
      fechamento,
      dias,
    })
  }

  return { ciclos, inconsistentes, semData }
}

/** Leads ainda em aberto, com a idade medida até `hojeISO`. */
export function calcularAbertos(leads: LeadCiclo[], hojeISO: string): AbertoItem[] {
  const abertos: AbertoItem[] = []

  for (const lead of leads) {
    if (!isAberto(lead.status)) continue

    const entrada = dataEntrada(lead)
    if (!entrada) continue

    const idade = diffDias(entrada, hojeISO)
    if (idade < 0) continue

    abertos.push({
      id: lead.id,
      cliente: textoOuPadrao(lead.nome_cliente, 'Sem nome'),
      origem: textoOuPadrao(lead.tipo_contato, 'Não informado'),
      vendedor: textoOuPadrao(lead.vendedor, 'Não informado'),
      uf: textoOuPadrao(lead.uf, '-'),
      status: textoOuPadrao(lead.status, '-'),
      valor: parseMoney(lead.valor_orcamento),
      entrada,
      idade,
    })
  }

  return abertos
}

/** Percentil por interpolação linear. `valores` precisa estar ordenado crescente. */
export function percentil(valores: number[], p: number) {
  if (valores.length === 0) return 0
  if (valores.length === 1) return valores[0]

  const posicao = (valores.length - 1) * p
  const base = Math.floor(posicao)
  const resto = posicao - base
  const atual = valores[base]
  const proximo = valores[base + 1]

  return proximo === undefined ? atual : atual + resto * (proximo - atual)
}

export function calcularEstatisticas(itens: { dias: number; valor?: number }[]): Estatisticas {
  if (itens.length === 0) return ESTATISTICAS_VAZIAS

  const dias = itens.map((item) => item.dias).sort((a, b) => a - b)
  const soma = dias.reduce((acc, valor) => acc + valor, 0)

  return {
    quantidade: dias.length,
    mediana: percentil(dias, 0.5),
    media: soma / dias.length,
    p25: percentil(dias, 0.25),
    p75: percentil(dias, 0.75),
    p90: percentil(dias, 0.9),
    min: dias[0],
    max: dias[dias.length - 1],
    valorTotal: itens.reduce((acc, item) => acc + (item.valor || 0), 0),
  }
}

export type GrupoCiclo = Estatisticas & { chave: string }

/** Agrupa os ciclos por uma dimensão (origem, vendedor, UF...) e calcula as estatísticas de cada grupo. */
export function agruparPor(
  ciclos: CicloItem[],
  campo: (item: CicloItem) => string
): GrupoCiclo[] {
  const mapa = new Map<string, CicloItem[]>()

  for (const ciclo of ciclos) {
    const chave = campo(ciclo)
    const lista = mapa.get(chave)
    if (lista) lista.push(ciclo)
    else mapa.set(chave, [ciclo])
  }

  return Array.from(mapa.entries())
    .map(([chave, itens]) => ({ chave, ...calcularEstatisticas(itens) }))
    .sort((a, b) => a.mediana - b.mediana)
}

export type FaixaResultado = {
  label: string
  total: number
  percentual: number
  valorTotal: number
}

export function distribuirEmFaixas(ciclos: CicloItem[]): FaixaResultado[] {
  const contagem = FAIXAS.map(() => ({ total: 0, valorTotal: 0 }))

  for (const ciclo of ciclos) {
    const indice = FAIXAS.findIndex(
      (faixa) => ciclo.dias >= faixa.min && ciclo.dias <= faixa.max
    )
    if (indice >= 0) {
      contagem[indice].total += 1
      contagem[indice].valorTotal += ciclo.valor
    }
  }

  return FAIXAS.map((faixa, indice) => ({
    label: faixa.label,
    total: contagem[indice].total,
    percentual: ciclos.length > 0 ? (contagem[indice].total / ciclos.length) * 100 : 0,
    valorTotal: contagem[indice].valorTotal,
  }))
}

/** Índice da faixa que contém um valor de dias — usado para destacar a mediana no histograma. */
export function indiceDaFaixa(dias: number) {
  return FAIXAS.findIndex((faixa) => dias >= faixa.min && dias <= faixa.max)
}

export type PontoConversao = {
  dias: number
  label: string
  acumulado: number
  percentual: number
}

/**
 * Curva de conversão acumulada: dos leads fechados, quantos % fecharam em até N dias.
 * Responde "a partir de quantos dias parar de investir no lead".
 */
export function curvaConversao(ciclos: CicloItem[]): PontoConversao[] {
  const total = ciclos.length

  return MARCOS_CONVERSAO.map((marco) => {
    const acumulado = ciclos.filter((ciclo) => ciclo.dias <= marco).length
    return {
      dias: marco,
      label: `${marco}d`,
      acumulado,
      percentual: total > 0 ? (acumulado / total) * 100 : 0,
    }
  })
}

export type PontoEvolucao = {
  chave: string
  label: string
  mediana: number
  quantidade: number
}

/**
 * Evolução da mediana mês a mês. A coorte é definida pelo mês de ENTRADA do lead:
 * é isso que responde "o meu processo está acelerando?" sem embaralhar as safras.
 */
export function evolucaoMensal(ciclos: CicloItem[], porFechamento = false): PontoEvolucao[] {
  const mapa = new Map<string, CicloItem[]>()

  for (const ciclo of ciclos) {
    const chave = mesDaData(porFechamento ? ciclo.fechamento : ciclo.entrada)
    if (!chave) continue

    const lista = mapa.get(chave)
    if (lista) lista.push(ciclo)
    else mapa.set(chave, [ciclo])
  }

  return Array.from(mapa.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([chave, itens]) => {
      const estatisticas = calcularEstatisticas(itens)
      return {
        chave,
        label: rotuloMes(chave),
        mediana: Math.round(estatisticas.mediana),
        quantidade: estatisticas.quantidade,
      }
    })
}

export function formatarDias(valor: number) {
  if (!Number.isFinite(valor)) return '-'
  const arredondado = Math.round(valor * 10) / 10
  return `${arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`
}

export function formatCurrency(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
