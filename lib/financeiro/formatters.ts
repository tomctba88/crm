export function formatBRL(valor: number | null | undefined): string {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatData(data: string | Date | null | undefined): string {
  if (!data) return '-'
  return new Date(data).toLocaleDateString('pt-BR')
}

export function formatPct(valor: number | null | undefined, casas = 1): string {
  return `${Number(valor || 0).toFixed(casas)}%`
}

export function isVencido(dataVencimento: string | null | undefined, status: string): boolean {
  if (status !== 'aberto' || !dataVencimento) return false
  return new Date(dataVencimento) < new Date()
}

export function diasParaVencer(dataVencimento: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(dataVencimento)
  return Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}
