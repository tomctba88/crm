export function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatData(data: string | Date): string {
  return new Date(data).toLocaleDateString('pt-BR')
}

export function isVencido(dataVencimento: string, status: string): boolean {
  if (status !== 'aberto') return false
  return new Date(dataVencimento) < new Date()
}

export function diasParaVencer(dataVencimento: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(dataVencimento)
  return Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}
