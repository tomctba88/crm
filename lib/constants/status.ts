/**
 * Arquivo centralizado de constantes e helpers para status de leads
 * Garante consistência em todo o sistema
 */

// Status de banco de dados (valores reais salvos)
export const STATUS_BANCO = {
  ORCAMENTO: 'ORÇAR',
  AGUARDANDO: 'AGUARDANDO',
  NEGOCIANDO: 'NEGOCIANDO',
  FECHADO: 'FECHADO',
  PEDIDO: 'PEDIDO',
  CANCELADO: 'CANCELADO',
  DESQUALIFICADO: 'DESQUALIFICADO',
  FORNECEDOR: 'FORNECEDOR',
} as const

// Status visuais (nomes exibidos no pipeline)
export const STATUS_VISUAL = {
  ATENDENDO: 'ATENDENDO',
  ORCADO: 'ORÇADO',
  NEGOCIANDO: 'NEGOCIANDO',
  FECHADO: 'FECHADO',
  PERDIDO: 'PERDIDO',
} as const

// Mapeamento: Visual → Banco
export const VISUAL_PARA_BANCO: Record<string, string> = {
  ATENDENDO: STATUS_BANCO.ORCAMENTO,
  ORÇADO: STATUS_BANCO.AGUARDANDO,
  NEGOCIANDO: STATUS_BANCO.NEGOCIANDO,
  FECHADO: STATUS_BANCO.FECHADO,
  PEDIDO: STATUS_BANCO.PEDIDO,
  PERDIDO: STATUS_BANCO.CANCELADO,
}

// Mapeamento: Banco → Visual
export const BANCO_PARA_VISUAL: Record<string, string> = {
  [STATUS_BANCO.ORCAMENTO]: STATUS_VISUAL.ATENDENDO,
  [STATUS_BANCO.AGUARDANDO]: STATUS_VISUAL.ORCADO,
  [STATUS_BANCO.NEGOCIANDO]: STATUS_VISUAL.NEGOCIANDO,
  [STATUS_BANCO.FECHADO]: STATUS_VISUAL.FECHADO,
  [STATUS_BANCO.PEDIDO]: STATUS_VISUAL.FECHADO,
  [STATUS_BANCO.CANCELADO]: STATUS_VISUAL.PERDIDO,
  [STATUS_BANCO.DESQUALIFICADO]: STATUS_VISUAL.PERDIDO,
  [STATUS_BANCO.FORNECEDOR]: STATUS_VISUAL.PERDIDO,
}

// Status de vendas fechadas (FECHADO e PEDIDO)
export const STATUS_VENDAS_FECHADAS = [
  STATUS_BANCO.FECHADO,
  STATUS_BANCO.PEDIDO,
]

// Status de perdas
export const STATUS_PERDAS = [
  STATUS_BANCO.CANCELADO,
  STATUS_BANCO.DESQUALIFICADO,
]

// Status encerrados (não aparecem mais no pipeline)
export const STATUS_ENCERRADOS = [
  STATUS_BANCO.FECHADO,
  STATUS_BANCO.PEDIDO,
  STATUS_BANCO.CANCELADO,
  STATUS_BANCO.DESQUALIFICADO,
  STATUS_BANCO.FORNECEDOR,
]

/**
 * Normaliza um status para maiúsculas e remove acentos
 */
export function normalizarStatus(status?: string | null): string {
  return String(status || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Converte status visual para status de banco
 */
export function statusVisualParaBanco(statusVisual: string): string {
  const normalizado = normalizarStatus(statusVisual)
  return VISUAL_PARA_BANCO[normalizado] || normalizado
}

/**
 * Converte status de banco para status visual
 */
export function statusBancoParaVisual(statusBanco: string): string {
  const normalizado = normalizarStatus(statusBanco)
  return BANCO_PARA_VISUAL[normalizado] || normalizado
}

/**
 * Verifica se um status é de venda fechada (FECHADO ou PEDIDO)
 */
export function isVendaFechada(status?: string | null): boolean {
  if (!status) return false
  const normalizado = normalizarStatus(status)
  return normalizado === 'FECHADO' || normalizado === 'PEDIDO'
}

/**
 * Verifica se um status é de perda (CANCELADO ou DESQUALIFICADO)
 */
export function isPerda(status?: string | null): boolean {
  if (!status) return false
  const normalizado = normalizarStatus(status)
  return normalizado === 'CANCELADO' || normalizado === 'DESQUALIFICADO'
}

/**
 * Verifica se um status é encerrado
 */
export function isEncerrado(status?: string | null): boolean {
  if (!status) return false
  const normalizado = normalizarStatus(status)
  return STATUS_ENCERRADOS.some(s => normalizarStatus(s) === normalizado)
}

/**
 * Retorna as datas que devem ser preenchidas para um status
 */
export function obterDatasParaStatus(
  statusBanco: string
): Record<string, string | null> {
  const hoje = new Date().toISOString().slice(0, 10)
  const normalizado = normalizarStatus(statusBanco)

  const datas: Record<string, string | null> = {
    data_fechamento: null,
    data_cancelamento: null,
    data_finalizacao: null,
  }

  if (normalizado === 'FECHADO' || normalizado === 'PEDIDO') {
    datas.data_fechamento = hoje
  }

  if (normalizado === 'CANCELADO') {
    datas.data_cancelamento = hoje
    datas.data_finalizacao = hoje
  }

  if (normalizado === 'DESQUALIFICADO') {
    datas.data_finalizacao = hoje
  }

  return datas
}

/**
 * Retorna apenas a parte AAAA-MM-DD de uma data/timestamp
 */
export function soData(value?: string | null): string | null {
  if (!value) return null
  const s = String(value).trim()
  return s ? s.slice(0, 10) : null
}

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Valida que as datas de encerramento (fechamento / cancelamento / finalização)
 * não sejam anteriores à data de entrada do lead (data_contato).
 *
 * Regra de negócio: nada pode acontecer antes do lead entrar no CRM.
 *
 * Retorna a mensagem de erro (string) se houver inconsistência, ou null se estiver tudo certo.
 */
export function validarDatasEncerramento(params: {
  data_contato?: string | null
  data_fechamento?: string | null
  data_cancelamento?: string | null
  data_finalizacao?: string | null
}): string | null {
  const entrada = soData(params.data_contato)
  if (!entrada) return null

  const checagens: Array<[string, string | null | undefined]> = [
    ['fechamento', params.data_fechamento],
    ['cancelamento', params.data_cancelamento],
    ['finalização', params.data_finalizacao],
  ]

  for (const [rotulo, valor] of checagens) {
    const d = soData(valor)
    if (d && d < entrada) {
      return `A data de ${rotulo} (${dataBR(d)}) não pode ser anterior à data de entrada do lead (${dataBR(entrada)}).`
    }
  }

  return null
}