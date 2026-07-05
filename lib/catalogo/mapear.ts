// Mapeia uma linha do Tiny (objeto com chaves = cabeçalhos da planilha) para as
// colunas dedicadas de produtos_catalogo. Guarda a linha inteira em raw.
// Usado tanto na importação quanto na edição/cadastro manual, para manter uma
// única fonte de verdade do mapeamento.

export type LinhaTiny = Record<string, unknown>

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = Number(s)
  return isFinite(n) ? n : null
}

export function mapearCatalogo(l: LinhaTiny) {
  const g = (k: string) => l[k]
  return {
    tiny_id: txt(g('ID')),
    sku: txt(g('Código (SKU)')),
    descricao: txt(g('Descrição')),
    descricao_complementar: txt(g('Descrição complementar')),
    observacoes: txt(g('Observações')),
    unidade: txt(g('Unidade')),
    ncm: txt(g('Classificação fiscal')),
    origem: txt(g('Origem')),
    cest: txt(g('CEST')),
    gtin: txt(g('GTIN/EAN')),
    preco: num(g('Preço')),
    preco_custo: num(g('Preço de custo')),
    preco_promocional: num(g('Preço promocional')),
    markup: num(g('Markup')),
    situacao: txt(g('Situação')),
    estoque: num(g('Estoque')),
    estoque_min: num(g('Estoque mínimo')),
    estoque_max: num(g('Estoque máximo')),
    fornecedor: txt(g('Fornecedor')),
    cod_fornecedor: txt(g('Cód do Fornecedor')),
    localizacao: txt(g('Localização')),
    marca: txt(g('Marca')),
    peso_liquido: num(g('Peso líquido (Kg)')),
    peso_bruto: num(g('Peso bruto (Kg)')),
    formato_embalagem: txt(g('Formato embalagem')),
    largura_emb: num(g('Largura embalagem')),
    altura_emb: num(g('Altura embalagem')),
    comprimento_emb: num(g('Comprimento embalagem')),
    diametro_emb: num(g('Diâmetro embalagem')),
    unidade_por_caixa: num(g('Unidade por caixa')),
    tipo_produto: txt(g('Tipo do produto')),
    codigo_pai: txt(g('Código do pai')),
    categoria: txt(g('Categoria')),
    sob_encomenda: txt(g('Sob encomenda')),
    permitir_venda: txt(g('Permitir inclusão nas vendas')),
    dias_preparacao: txt(g('Dias para preparação')),
    url_imagem: txt(g('URL imagem 1')),
    raw: l,
    updated_at: new Date().toISOString(),
  }
}

// Lista canônica dos campos da planilha do Tiny, agrupados em abas.
// Serve para gerar o formulário de edição/cadastro manual com TODAS as colunas.
export type CampoTiny = { key: string; label: string; tipo: 'texto' | 'numero' | 'area' }
export type GrupoCampos = { aba: string; campos: CampoTiny[] }

export const CAMPOS_TINY: GrupoCampos[] = [
  {
    aba: 'Geral',
    campos: [
      { key: 'Descrição', label: 'Descrição', tipo: 'texto' },
      { key: 'Código (SKU)', label: 'Código (SKU)', tipo: 'texto' },
      { key: 'Unidade', label: 'Unidade', tipo: 'texto' },
      { key: 'Situação', label: 'Situação', tipo: 'texto' },
      { key: 'Categoria', label: 'Categoria', tipo: 'texto' },
      { key: 'Marca', label: 'Marca', tipo: 'texto' },
      { key: 'Tipo do produto', label: 'Tipo do produto', tipo: 'texto' },
      { key: 'Código do pai', label: 'Código do pai (variações)', tipo: 'texto' },
      { key: 'Variações', label: 'Variações', tipo: 'texto' },
      { key: 'Descrição complementar', label: 'Descrição complementar', tipo: 'area' },
      { key: 'Observações', label: 'Observações', tipo: 'area' },
    ],
  },
  {
    aba: 'Preços',
    campos: [
      { key: 'Preço', label: 'Preço', tipo: 'numero' },
      { key: 'Preço de custo', label: 'Preço de custo', tipo: 'numero' },
      { key: 'Preço promocional', label: 'Preço promocional', tipo: 'numero' },
      { key: 'Markup', label: 'Markup', tipo: 'numero' },
      { key: 'Valor IPI fixo', label: 'Valor IPI fixo', tipo: 'numero' },
    ],
  },
  {
    aba: 'Estoque',
    campos: [
      { key: 'Estoque', label: 'Estoque', tipo: 'numero' },
      { key: 'Estoque mínimo', label: 'Estoque mínimo', tipo: 'numero' },
      { key: 'Estoque máximo', label: 'Estoque máximo', tipo: 'numero' },
      { key: 'Localização', label: 'Localização', tipo: 'texto' },
      { key: 'Sob encomenda', label: 'Sob encomenda', tipo: 'texto' },
      { key: 'Permitir inclusão nas vendas', label: 'Permitir inclusão nas vendas', tipo: 'texto' },
      { key: 'Dias para preparação', label: 'Dias para preparação', tipo: 'texto' },
      { key: 'Unidade por caixa', label: 'Unidade por caixa', tipo: 'numero' },
      { key: 'Controlar lotes', label: 'Controlar lotes', tipo: 'texto' },
    ],
  },
  {
    aba: 'Fiscal',
    campos: [
      { key: 'Classificação fiscal', label: 'Classificação fiscal (NCM)', tipo: 'texto' },
      { key: 'Origem', label: 'Origem', tipo: 'texto' },
      { key: 'CEST', label: 'CEST', tipo: 'texto' },
      { key: 'GTIN/EAN', label: 'GTIN/EAN', tipo: 'texto' },
      { key: 'GTIN/EAN tributável', label: 'GTIN/EAN tributável', tipo: 'texto' },
      { key: 'Código de Enquadramento IPI', label: 'Cód. Enquadramento IPI', tipo: 'texto' },
      { key: 'EX TIPI', label: 'EX TIPI', tipo: 'texto' },
    ],
  },
  {
    aba: 'Fornecedor',
    campos: [
      { key: 'Fornecedor', label: 'Fornecedor', tipo: 'texto' },
      { key: 'Cód do Fornecedor', label: 'Cód. do Fornecedor', tipo: 'texto' },
      { key: 'Garantia', label: 'Garantia', tipo: 'texto' },
    ],
  },
  {
    aba: 'Embalagem',
    campos: [
      { key: 'Formato embalagem', label: 'Formato da embalagem', tipo: 'texto' },
      { key: 'Peso líquido (Kg)', label: 'Peso líquido (Kg)', tipo: 'numero' },
      { key: 'Peso bruto (Kg)', label: 'Peso bruto (Kg)', tipo: 'numero' },
      { key: 'Largura embalagem', label: 'Largura embalagem', tipo: 'numero' },
      { key: 'Altura embalagem', label: 'Altura embalagem', tipo: 'numero' },
      { key: 'Comprimento embalagem', label: 'Comprimento embalagem', tipo: 'numero' },
      { key: 'Diâmetro embalagem', label: 'Diâmetro embalagem', tipo: 'numero' },
    ],
  },
  {
    aba: 'Imagens',
    campos: [
      { key: 'URL imagem 1', label: 'URL imagem 1', tipo: 'texto' },
      { key: 'URL imagem 2', label: 'URL imagem 2', tipo: 'texto' },
      { key: 'URL imagem 3', label: 'URL imagem 3', tipo: 'texto' },
      { key: 'URL imagem 4', label: 'URL imagem 4', tipo: 'texto' },
      { key: 'URL imagem 5', label: 'URL imagem 5', tipo: 'texto' },
      { key: 'URL imagem 6', label: 'URL imagem 6', tipo: 'texto' },
      { key: 'URL imagem externa 1', label: 'URL imagem externa 1', tipo: 'texto' },
      { key: 'URL imagem externa 2', label: 'URL imagem externa 2', tipo: 'texto' },
      { key: 'URL imagem externa 3', label: 'URL imagem externa 3', tipo: 'texto' },
      { key: 'URL imagem externa 4', label: 'URL imagem externa 4', tipo: 'texto' },
      { key: 'URL imagem externa 5', label: 'URL imagem externa 5', tipo: 'texto' },
      { key: 'URL imagem externa 6', label: 'URL imagem externa 6', tipo: 'texto' },
      { key: 'URL imagem externa 7', label: 'URL imagem externa 7', tipo: 'texto' },
      { key: 'URL imagem externa 8', label: 'URL imagem externa 8', tipo: 'texto' },
      { key: 'URL imagem externa 9', label: 'URL imagem externa 9', tipo: 'texto' },
      { key: 'URL imagem externa 10', label: 'URL imagem externa 10', tipo: 'texto' },
      { key: 'Link do vídeo', label: 'Link do vídeo', tipo: 'texto' },
    ],
  },
  {
    aba: 'SEO',
    campos: [
      { key: 'Título SEO', label: 'Título SEO', tipo: 'texto' },
      { key: 'Descrição SEO', label: 'Descrição SEO', tipo: 'area' },
      { key: 'Palavras chave SEO', label: 'Palavras-chave SEO', tipo: 'texto' },
      { key: 'Slug', label: 'Slug', tipo: 'texto' },
    ],
  },
]
