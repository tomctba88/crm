// Classificação de produtos em segmentos de análise: Cadeiras x Móveis.
//
// Fontes de classificação, em ordem de prioridade:
//   1. Override manual do usuário (persistido em localStorage pela página).
//   2. Grupo de origem do Tiny (coluna `grupo`, capturada na importação) — mais confiável.
//   3. Palavra-chave no nome do produto (fallback — funciona com dados já importados
//      antes da coluna `grupo` existir).
//
// Mantida separada da UI para ficar testável e reutilizável.

export type Segmento = 'cadeiras' | 'moveis'

export type FonteClassificacao = 'override' | 'grupo' | 'nome' | 'fallback'

export const SEGMENTOS: Segmento[] = ['cadeiras', 'moveis']

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  cadeiras: 'Cadeiras',
  moveis: 'Móveis',
}

export const SEGMENTO_COR: Record<Segmento, string> = {
  cadeiras: '#1b4fd6', // azul (linha cadeiras)
  moveis: '#16a34a',   // verde (linha móveis)
}

// Palavras que indicam que o produto pertence à linha de Cadeiras.
const CADEIRA_KEYWORDS = [
  'cadeira', 'poltrona', 'banqueta', 'mocho', 'longarina',
  'assento', 'gamer', 'presidente', 'diretor', 'secretaria', 'secretária',
  'ergonomica', 'ergonômica', 'giratoria', 'giratória', 'encosto',
]

// Palavras que indicam linha de Móveis (usado só para reforçar a decisão
// quando o nome também bate em algo ambíguo; o fallback final já é Móveis).
const MOVEL_KEYWORDS = [
  'mesa', 'estacao', 'estação', 'gaveteiro', 'armario', 'armário', 'painel',
  'estante', 'plataforma', 'balcao', 'balcão', 'escrivaninha', 'aparador',
  'rack', 'nicho', 'prateleira', 'mesinha', 'bancada', 'divisoria', 'divisória',
]

function normalizar(texto: string): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos para casar com/sem acento
}

// Mapeia o grupo de origem do Tiny para um segmento, quando possível.
export function mapearGrupoTiny(grupo: string | null | undefined): Segmento | null {
  if (!grupo) return null
  const g = normalizar(grupo)
  if (g.includes('cadeira') || g.includes('poltrona') || g.includes('assento')) return 'cadeiras'
  if (g.includes('movel') || g.includes('moveis') || g.includes('mesa') || g.includes('mobiliario')) return 'moveis'
  return null
}

// Classifica pelo nome do produto. Retorna o segmento e se foi por palavra-chave
// explícita (`nome`) ou por ausência de match (`fallback` → Móveis por padrão).
export function classificarPorNome(produto: string): { segmento: Segmento; fonte: 'nome' | 'fallback' } {
  const p = normalizar(produto)
  if (CADEIRA_KEYWORDS.some(k => p.includes(normalizar(k)))) return { segmento: 'cadeiras', fonte: 'nome' }
  if (MOVEL_KEYWORDS.some(k => p.includes(normalizar(k)))) return { segmento: 'moveis', fonte: 'nome' }
  return { segmento: 'moveis', fonte: 'fallback' }
}

// Classificação final de um produto, considerando override e grupo de origem.
export function classificarProduto(
  produto: string,
  grupo: string | null | undefined,
  override?: Segmento | null,
): { segmento: Segmento; fonte: FonteClassificacao } {
  if (override) return { segmento: override, fonte: 'override' }
  const porGrupo = mapearGrupoTiny(grupo)
  if (porGrupo) return { segmento: porGrupo, fonte: 'grupo' }
  return classificarPorNome(produto)
}
