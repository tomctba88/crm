export const GRUPOS_DRE = {
  RECEITA_VENDAS: [
    'RECEITAS DE VENDAS - Ergotex Corporativo',
    'RECEITAS DE VENDAS - Ergotex Home',
    'RECEITA DE VENDAS - LOJISTA',
  ],
  DEDUCOES_RECEITA: [
    'RECEITAS OPERACIONAIS',
  ],
  CMV: [
    'CUSTOS DAS MERCADORIAS VENDIDAS',
    'CUSTOS DOS PRODUTOS VENDIDOS',
  ],
  DESPESAS_TRABALHISTAS: ['DESPESAS TRABALHISTAS'],
  DESPESAS_OPERACIONAIS: ['DESPESAS OPERACIONAIS'],
  DESPESAS_FINANCEIRAS: ['DESPESAS FINANCEIRAS'],
  DESPESAS_TRIBUTARIAS: ['DESPESAS TRIBUTÁRIAS'],
  IMOBILIZADO: ['IMOBILIZADO'],
  INVESTIMENTOS: ['INVESTIMENTOS'],
  OUTRAS: ['DESPESAS COM SÓCIOS E EQUIPE'],
} as const

export const CATEGORIAS_CUSTO = [
  'Compra de Mercadoria para Revenda',
  'Material de Consumo',
  'Pagamento Fornecedor',
  'Compra de Embalagens',
  'Compra de Insumos',
  'Compra de Matéria-prima',
  'Compra de Material de Almoxarifado',
  'Industrialização efetuada por terceiros',
]

export const CATEGORIAS_MAO_DE_OBRA = [
  'Salários',
  'Hora Extra',
  'Férias',
  'Provisão 13º/Ferias',
  'Provisão FGTS',
  'Vale Refeição',
  'Vale Transporte',
  'Comissões',
  'Aviso Prévio',
  'Temporário',
  'Pro-Labore',
  'Plano de Saúde',
  'Academia',
]

export const CATEGORIAS_FIXAS = [
  'Aluguéis e condomínio',
  'Energia Elétrica',
  'Água e Esgoto',
  'Serviços de Telefonia, comunicação',
  'Despesas com Internet',
  'Contabilidade',
  'Sistemas de Gestão e Apps',
  'Limpeza, e Vigilância',
  'Seguros',
]

export function classificarSegmentoProduto(descricao: string): 'estofaria' | 'marcenaria' | 'outros' {
  const d = (descricao || '').toLowerCase()
  const palavrasEstofaria = ['cadeira', 'poltrona', 'banqueta', 'estofado', 'assento', 'sofá']
  const palavrasMarcenaria = ['mesa', 'rack', 'armário', 'estante', 'painel', 'balcão', 'móvel', 'gaveteiro', 'nicho']
  if (palavrasEstofaria.some(p => d.includes(p))) return 'estofaria'
  if (palavrasMarcenaria.some(p => d.includes(p))) return 'marcenaria'
  return 'outros'
}

export function getGrupoDRE(categoria: string): string {
  const cat = (categoria || '').toLowerCase()
  for (const [grupo, nomes] of Object.entries(GRUPOS_DRE)) {
    if ((nomes as readonly string[]).some(n => cat.includes(n.toLowerCase()))) return grupo
  }
  if (CATEGORIAS_CUSTO.some(c => cat.includes(c.toLowerCase()))) return 'CMV'
  if (CATEGORIAS_MAO_DE_OBRA.some(c => cat.includes(c.toLowerCase()))) return 'DESPESAS_TRABALHISTAS'
  return 'OUTRAS'
}
