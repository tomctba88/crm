/**
 * Importação da lista de peças por planilha.
 *
 * O Promob exporta a lista de peças em PDF; na prática ela é colada no Excel.
 * Os cabeçalhos variam de projeto para projeto, então o mapeamento é por
 * aproximação em vez de posição fixa — planilha de marcenaria nunca vem igual.
 *
 * Quando o import da pasta PROGRAMAÇÃO (DXF) entrar, ele grava na mesma tabela;
 * este caminho continua valendo para projetos sem DXF.
 */

import { bordasDoCodigo, type Bordas } from './marcenaria'

export type LinhaPlanilha = Record<string, unknown>

export type PecaImportada = {
  codigo: string | null
  nome: string
  modulo: string | null
  chapa_id: number | null
  chapaTexto: string | null
  comprimento_mm: number
  largura_mm: number
  espessura_mm: number | null
  quantidade: number
  fita_id: number | null
  codigo_fita: string | null
  fita_c1: boolean
  fita_c2: boolean
  fita_l1: boolean
  fita_l2: boolean
}

export type ResultadoImport = {
  pecas: PecaImportada[]
  avisos: string[]
  chapasNaoEncontradas: string[]
}

/** Faixa dos acentos combinantes (NFD os separa da letra base). */
const ACENTOS = /[\u0300-\u036f]/g

/** Remove acento, baixa a caixa e tira pontuação — para casar cabeçalhos. */
export function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/** Aceita "1.234,5" (pt-BR), "1234.5" (en) e number puro. */
export function parseNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const texto = String(valor ?? '').trim()
  if (!texto) return 0

  // com vírgula decimal, o ponto é separador de milhar
  const limpo = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto
  const n = Number(limpo.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Sinônimos aceitos por campo, em ordem de preferência. A busca é por
 * "cabeçalho contém o sinônimo", então "Comprimento (mm)" casa com "comprimento".
 */
const SINONIMOS: Record<string, string[]> = {
  codigo: ['codigo', 'cod', 'id', 'referencia', 'ref'],
  nome: ['nome', 'peca', 'descricao', 'pecas', 'item'],
  modulo: ['modulo', 'ambiente', 'conjunto', 'grupo'],
  chapa: ['chapa', 'material', 'cor', 'padrao', 'acabamento'],
  comprimento: ['comprimento', 'compr', 'altura', 'alt'],
  largura: ['largura', 'larg'],
  espessura: ['espessura', 'esp'],
  quantidade: ['quantidade', 'qtde', 'qtd', 'qt'],
  fita: ['fita', 'borda', 'bordas', 'fitagem'],
}

/** Descobre qual coluna da planilha corresponde a cada campo. */
export function mapearColunas(cabecalhos: string[]): Record<string, string | null> {
  const normalizados = cabecalhos.map((h) => ({ original: h, norm: normalizar(h) }))
  const mapa: Record<string, string | null> = {}
  const usados = new Set<string>()

  for (const [campo, chaves] of Object.entries(SINONIMOS)) {
    let achado: string | null = null

    // exato primeiro; só depois "contém", para "largura" não roubar a coluna de "largura da fita"
    for (const chave of chaves) {
      const exato = normalizados.find((h) => h.norm === chave && !usados.has(h.original))
      if (exato) { achado = exato.original; break }
    }
    if (!achado) {
      for (const chave of chaves) {
        const parcial = normalizados.find((h) => h.norm.includes(chave) && !usados.has(h.original))
        if (parcial) { achado = parcial.original; break }
      }
    }

    mapa[campo] = achado
    if (achado) usados.add(achado)
  }

  return mapa
}

export type ChapaRef = { id: number; nome: string; cor_padrao: string; espessura_mm: number | string }
export type FitaRef = { id: number; nome: string; cor_padrao: string; chapa_id: number | null }

/** Casa o texto da planilha com uma chapa cadastrada, por nome ou por cor. */
function acharChapa(texto: string, chapas: ChapaRef[]): ChapaRef | null {
  const alvo = normalizar(texto)
  if (!alvo) return null

  return (
    chapas.find((c) => normalizar(c.nome) === alvo) ||
    chapas.find((c) => normalizar(c.cor_padrao) === alvo) ||
    chapas.find((c) => alvo.includes(normalizar(c.nome))) ||
    chapas.find((c) => normalizar(c.cor_padrao) && alvo.includes(normalizar(c.cor_padrao))) ||
    null
  )
}

export function importarPecas(
  linhas: LinhaPlanilha[],
  chapas: ChapaRef[],
  fitas: FitaRef[]
): ResultadoImport {
  const avisos: string[] = []
  const chapasNaoEncontradas = new Set<string>()
  const pecas: PecaImportada[] = []

  if (linhas.length === 0) {
    return { pecas: [], avisos: ['A planilha está vazia.'], chapasNaoEncontradas: [] }
  }

  const colunas = mapearColunas(Object.keys(linhas[0]))

  if (!colunas.nome) avisos.push('Coluna de nome da peça não encontrada — usando a 1ª coluna de texto.')
  if (!colunas.comprimento || !colunas.largura) {
    return {
      pecas: [],
      avisos: ['Não encontrei as colunas de comprimento e largura. Renomeie os cabeçalhos para "Comprimento" e "Largura".'],
      chapasNaoEncontradas: [],
    }
  }

  const pegar = (linha: LinhaPlanilha, campo: string) =>
    colunas[campo] ? linha[colunas[campo]!] : undefined

  linhas.forEach((linha, idx) => {
    const comprimento = parseNumero(pegar(linha, 'comprimento'))
    const largura = parseNumero(pegar(linha, 'largura'))

    // linha de total, subtotal ou separador: sai sem alarde
    if (comprimento <= 0 || largura <= 0) return

    const nome = String(pegar(linha, 'nome') ?? '').trim() || `Peça ${idx + 1}`
    const chapaTexto = String(pegar(linha, 'chapa') ?? '').trim() || null
    const chapa = chapaTexto ? acharChapa(chapaTexto, chapas) : null
    if (chapaTexto && !chapa) chapasNaoEncontradas.add(chapaTexto)

    const codigoFita = String(pegar(linha, 'fita') ?? '').trim().toUpperCase() || null
    const bordas: Bordas = bordasDoCodigo(codigoFita)

    // fita combinante da chapa, quando cadastrada
    const fita = chapa ? fitas.find((f) => f.chapa_id === chapa.id) : undefined

    pecas.push({
      codigo: String(pegar(linha, 'codigo') ?? '').trim() || null,
      nome,
      modulo: String(pegar(linha, 'modulo') ?? '').trim() || null,
      chapa_id: chapa?.id ?? null,
      chapaTexto,
      comprimento_mm: comprimento,
      largura_mm: largura,
      espessura_mm: parseNumero(pegar(linha, 'espessura')) || (chapa ? Number(chapa.espessura_mm) : null),
      quantidade: parseNumero(pegar(linha, 'quantidade')) || 1,
      fita_id: bordas.c1 || bordas.c2 || bordas.l1 || bordas.l2 ? fita?.id ?? null : null,
      codigo_fita: codigoFita,
      fita_c1: bordas.c1,
      fita_c2: bordas.c2,
      fita_l1: bordas.l1,
      fita_l2: bordas.l2,
    })
  })

  if (pecas.length === 0) {
    avisos.push('Nenhuma linha com comprimento e largura válidos.')
  }
  if (chapasNaoEncontradas.size > 0) {
    avisos.push(
      `${chapasNaoEncontradas.size} material(is) da planilha não batem com nenhuma chapa cadastrada. ` +
      'As peças entram sem chapa — defina depois na lista, ou cadastre as chapas e importe de novo.'
    )
  }

  return { pecas, avisos, chapasNaoEncontradas: [...chapasNaoEncontradas] }
}
