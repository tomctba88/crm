// Classificação de movimentos de caixa nas 3 atividades da DFC (método direto):
// Operacional, Investimento e Financiamento.
//
// Fonte dos dados: fin_fluxo_caixa_import (relatório "Entradas e Saídas por
// Cliente/Contato" do Tiny). Nesse relatório a coluna `grupo` é o CONTATO
// (cliente/fornecedor/banco) — ruído para classificação contábil — então a
// classificação usa a `categoria`, que é a conta de resultado de fato.
//
// A classificação automática é por palavra-chave e cai em Operacional por
// padrão (a maioria do caixa de uma operação é operacional). O usuário pode
// sobrescrever manualmente cada categoria na própria página (persistido em
// localStorage), igual à Análise de Produtos.

export type Atividade = 'operacional' | 'investimento' | 'financiamento'

export const ATIVIDADES: Atividade[] = ['operacional', 'investimento', 'financiamento']

export const ATIVIDADE_LABEL: Record<Atividade, string> = {
  operacional: 'Operacional',
  investimento: 'Investimento',
  financiamento: 'Financiamento',
}

export const ATIVIDADE_COR: Record<Atividade, string> = {
  operacional: '#1b4fd6',   // azul
  investimento: '#f59e0b',  // âmbar
  financiamento: '#8b5cf6', // roxo
}

function norm(texto: string | null | undefined): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Compra/venda de ativos de longo prazo e aplicações financeiras.
const INVESTIMENTO_KW = [
  'imobilizado', 'equipamento', 'maquinario', 'maquina', 'veiculo', 'frota',
  'obra', 'reforma', 'benfeitoria', 'moveis e utensilios', 'movel e utensilio',
  'imovel', 'terreno', 'investimento', 'aplicacao', 'aplicacoes', 'resgate de aplicacao',
  'ativo fixo', 'instalacoes', 'galpao', 'barracao',
]

// Captação/devolução de recursos com sócios e terceiros.
const FINANCIAMENTO_KW = [
  'emprestimo', 'financiamento', 'captacao', 'aporte', 'capital social',
  'distribuicao de lucro', 'dividendo', 'amortizacao', 'consorcio', 'leasing',
  'pro labore', 'pro-labore', 'retirada de socio', 'retirada socio', 'aporte de socio',
]

// Classifica uma categoria de movimento de caixa numa atividade da DFC.
// `override` (manual) tem prioridade sobre a heurística.
export function classificarAtividade(
  categoria: string | null | undefined,
  override?: Atividade | null,
): { atividade: Atividade; fonte: 'override' | 'auto' } {
  if (override) return { atividade: override, fonte: 'override' }
  const c = norm(categoria)
  if (FINANCIAMENTO_KW.some(k => c.includes(k))) return { atividade: 'financiamento', fonte: 'auto' }
  if (INVESTIMENTO_KW.some(k => c.includes(k))) return { atividade: 'investimento', fonte: 'auto' }
  return { atividade: 'operacional', fonte: 'auto' }
}
