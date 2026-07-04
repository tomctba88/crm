export type ItemFicha = {
  quantidade_padrao: number
  dimensao_afetada: string
}

export type DimensoesProduto = {
  comprimento_padrao: number | null
  largura_padrao: number | null
  tem_dimensao_variavel: boolean
}

export function calcularQuantidade(
  item: ItemFicha,
  comprimentoPedido: number | null,
  larguraPedido: number | null,
  produto: DimensoesProduto
): number {
  if (
    !produto.tem_dimensao_variavel ||
    !produto.comprimento_padrao ||
    !produto.largura_padrao ||
    !comprimentoPedido ||
    !larguraPedido
  ) {
    return item.quantidade_padrao
  }

  const fatorC = comprimentoPedido / produto.comprimento_padrao
  const fatorL = larguraPedido / produto.largura_padrao

  switch (item.dimensao_afetada) {
    case 'comprimento': return +(item.quantidade_padrao * fatorC).toFixed(4)
    case 'largura':     return +(item.quantidade_padrao * fatorL).toFixed(4)
    case 'area':        return +(item.quantidade_padrao * fatorC * fatorL).toFixed(4)
    default:            return item.quantidade_padrao
  }
}

export const ESCALONAMENTO_LABEL: Record<string, string> = {
  fixo: 'Fixo (não escala)',
  comprimento: 'Escala com comprimento',
  largura: 'Escala com largura',
  area: 'Escala com área (C×L)',
}
