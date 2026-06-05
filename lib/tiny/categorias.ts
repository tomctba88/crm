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

// ─── CATEGORIA (plano de contas, do Contas a Pagar) → GRUPO do DRE ──────────────
// Os nomes de grupo abaixo são propositalmente compatíveis com getResultadoLabel()
// do indicadores (que classifica por substring: custo→CMV, operacional→Operacionais,
// trabalhista→Trabalhistas, financeira→Financeiras, tributária→Tributárias,
// sócios→Salários Sócios, imobilizado, investimento, empréstimo).
const CMV = 'CUSTOS DOS PRODUTOS VENDIDOS'
const OPERACIONAIS = 'DESPESAS OPERACIONAIS'
const TRABALHISTAS = 'DESPESAS TRABALHISTAS'
const SOCIOS = 'DESPESAS COM SÓCIOS E EQUIPE'
const FINANCEIRAS = 'DESPESAS FINANCEIRAS'
const TRIBUTARIAS = 'DESPESAS TRIBUTÁRIAS'
const EMPRESTIMOS = 'EMPRÉSTIMOS'

const CATEGORIA_GRUPO: Record<string, string> = {
  // CMV / produção
  'compra de mercadoria para revenda': CMV,
  'compra de matéria-prima': CMV,
  'compra de insumos': CMV,
  'compra de embalagens': CMV,
  'compra de material de almoxarifado': CMV,
  'material de consumo': CMV,
  'pagamento fornecedor': CMV,
  'industrialização efetuada por terceiros': CMV,
  'montador de móveis': CMV,
  // Mão de obra → Trabalhistas
  'salários': TRABALHISTAS,
  'hora extra': TRABALHISTAS,
  'férias': TRABALHISTAS,
  'provisão 13º/ferias': TRABALHISTAS,
  'provisão fgts': TRABALHISTAS,
  'vale refeição': TRABALHISTAS,
  'vale transporte': TRABALHISTAS,
  'comissões': TRABALHISTAS,
  'aviso prévio': TRABALHISTAS,
  'temporário': TRABALHISTAS,
  // Sócios / equipe
  'pro-labore': SOCIOS,
  'plano de saúde': SOCIOS,
  'academia': SOCIOS,
  // Operacionais (fixas + variáveis)
  'aluguéis e condomínio': OPERACIONAIS,
  'energia elétrica': OPERACIONAIS,
  'água e esgoto': OPERACIONAIS,
  'serviços de telefonia, comunicação': OPERACIONAIS,
  'despesas com internet': OPERACIONAIS,
  'contabilidade': OPERACIONAIS,
  'sistemas de gestão e apps': OPERACIONAIS,
  'limpeza, e vigilância': OPERACIONAIS,
  'seguros': OPERACIONAIS,
  'alimentação': OPERACIONAIS,
  'aquisição de bens de pequeno valor': OPERACIONAIS,
  'certidões': OPERACIONAIS,
  'compras interna - mercado': OPERACIONAIS,
  'fretes e carretos': OPERACIONAIS,
  'gasolina fiorino': OPERACIONAIS,
  'manutenção e conservação': OPERACIONAIS,
  'marketing e trafego': OPERACIONAIS,
  'pedágios': OPERACIONAIS,
  'serviços gerais': OPERACIONAIS,
  'veículos': OPERACIONAIS,
  'viagens': OPERACIONAIS,
  'reformas e instalações': OPERACIONAIS,
  'marcas e patentes': OPERACIONAIS,
  'material de uso e consumo': OPERACIONAIS,
  // Financeiras
  'tarifa bancária': FINANCEIRAS,
  'juros': FINANCEIRAS,
  'iof': FINANCEIRAS,
  'anuidade cartão de crédito': FINANCEIRAS,
  'taxa de cartão/site': FINANCEIRAS,
  'cartão de crédito - lukas': FINANCEIRAS,
  // Empréstimos
  'emprestimos': EMPRESTIMOS,
  'empréstimo - bradesco': EMPRESTIMOS,
  'consórcio': EMPRESTIMOS,
  // Tributárias
  'icms - antecipação': TRIBUTARIAS,
}

// Retorna o nome do grupo do DRE para uma categoria do plano de contas.
// '' quando desconhecida (o chamador decide o fallback).
export function getGrupoPorCategoria(categoria: string): string {
  return CATEGORIA_GRUPO[(categoria || '').trim().toLowerCase()] || ''
}

// Lista de categorias de despesa conhecidas (plano de contas), em caixa correta.
// Usada para popular o seletor "mover para outra conta".
export const CATEGORIAS_DESPESA: string[] = Array.from(new Set([
  ...CATEGORIAS_CUSTO, ...CATEGORIAS_MAO_DE_OBRA, ...CATEGORIAS_FIXAS,
  'Montador de Móveis', 'Material de Uso e Consumo', 'Alimentação',
  'Aquisição de bens de pequeno valor', 'Certidões', 'Compras Interna - Mercado',
  'Fretes e Carretos', 'Gasolina Fiorino', 'Manutenção e Conservação',
  'Marketing e Trafego', 'Pedágios', 'Serviços gerais', 'Veículos', 'Viagens',
  'Reformas e Instalações', 'Marcas e Patentes', 'Tarifa Bancária', 'Juros', 'Iof',
  'Anuidade Cartão de Crédito', 'Taxa de Cartão/Site', 'Cartão de Crédito - Lukas',
  'Emprestimos', 'Empréstimo - Bradesco', 'Consórcio', 'ICMS - Antecipação',
])).sort((a, b) => a.localeCompare(b))
