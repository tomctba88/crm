/**
 * Marcenaria — cálculos de peça, chapa e fita.
 *
 * O que muda em relação à estofaria:
 *   · a unidade que flui pela fábrica é a PEÇA, não o produto acabado
 *   · a maior "perda" é sobra de nesting, que é inerente — mede-se com
 *     APROVEITAMENTO (m² virados peça ÷ m² de chapa), não com motivo+custo
 *   · fita se mede em METRO LINEAR, e depende de quais das 4 bordas levam fita
 *
 * Módulo puro (sem React/Supabase), como lib/producao/indicadores.ts.
 */

import { num, percentil } from './indicadores'

/* ---------------------------------------------------------------------------
 * Tipos
 * ------------------------------------------------------------------------- */

export type Chapa = {
  id: number
  codigo: string | null
  nome: string
  material: string
  cor_padrao: string
  espessura_mm: number | string
  comprimento_mm: number | string
  largura_mm: number | string
  custo_chapa: number | string | null
}

export type Fita = {
  id: number
  nome: string
  cor_padrao: string
  largura_mm: number | string
  custo_metro: number | string | null
  /** chapa combinante — só para pré-selecionar a fita certa ao cadastrar peças */
  chapa_id: number | null
}

export type Peca = {
  id: number
  ordem_id: number
  ordem_item_id: number | null
  codigo: string | null
  nome: string
  modulo: string | null
  chapa_id: number | null
  comprimento_mm: number | string
  largura_mm: number | string
  espessura_mm: number | string | null
  quantidade: number | string
  fita_id: number | null
  fita_c1: boolean
  fita_c2: boolean
  fita_l1: boolean
  fita_l2: boolean
  codigo_fita: string | null
  furos: number
  status: string
}

export type ChapaConsumida = {
  id: number
  ordem_id: number
  chapa_id: number
  quantidade: number | string
  custo_total: number | string
  data_ref: string
}

export type Maquina = {
  id: number
  nome: string
  tipo: string
  capacidade_hora: number | string | null
  unidade_capacidade: string
  custo_hora: number | string | null
  ativo: boolean
}

/* ---------------------------------------------------------------------------
 * Fitagem de borda
 *
 * Cada peça tem 4 bordas: duas de comprimento (as maiores) e duas de largura.
 * O Promob traz um código resumido; guardamos as 4 bandeiras porque casos fora
 * do padrão (só um lado menor, por exemplo) não cabem em nenhum código.
 * ------------------------------------------------------------------------- */

export type Bordas = { c1: boolean; c2: boolean; l1: boolean; l2: boolean }

export const SEM_FITA: Bordas = { c1: false, c2: false, l1: false, l2: false }

/** Códigos confirmados com o usuário: TL, 1+, 2+, SF. */
export function bordasDoCodigo(codigo: string | null | undefined): Bordas {
  const c = (codigo || '').trim().toUpperCase()
  if (c === 'TL') return { c1: true, c2: true, l1: true, l2: true }
  if (c === '2+') return { c1: true, c2: true, l1: false, l2: false }
  if (c === '1+') return { c1: true, c2: false, l1: false, l2: false }
  return { ...SEM_FITA } // SF e desconhecidos
}

/** Volta ao código quando as bandeiras batem com um; senão devolve null. */
export function codigoDasBordas(b: Bordas): string | null {
  if (b.c1 && b.c2 && b.l1 && b.l2) return 'TL'
  if (b.c1 && b.c2 && !b.l1 && !b.l2) return '2+'
  if (b.c1 && !b.c2 && !b.l1 && !b.l2) return '1+'
  if (!b.c1 && !b.c2 && !b.l1 && !b.l2) return 'SF'
  return null
}

export function bordasDaPeca(p: Peca): Bordas {
  return { c1: p.fita_c1, c2: p.fita_c2, l1: p.fita_l1, l2: p.fita_l2 }
}

/** Código resumido da fitagem da peça, ou null quando é personalizada. */
export function codigoDaPeca(p: Peca): string | null {
  return codigoDasBordas(bordasDaPeca(p))
}

export function quantidadeBordas(p: Peca) {
  return [p.fita_c1, p.fita_c2, p.fita_l1, p.fita_l2].filter(Boolean).length
}

/** Metros lineares de fita da peça, já multiplicados pela quantidade. */
export function metrosDeFita(p: Peca): number {
  const comp = num(p.comprimento_mm)
  const larg = num(p.largura_mm)
  const mm =
    (p.fita_c1 ? comp : 0) + (p.fita_c2 ? comp : 0) +
    (p.fita_l1 ? larg : 0) + (p.fita_l2 ? larg : 0)
  return (mm / 1000) * num(p.quantidade)
}

/* ---------------------------------------------------------------------------
 * Área
 * ------------------------------------------------------------------------- */

/** m² úteis da peça (comprimento × largura × quantidade). */
export function areaDaPeca(p: Peca): number {
  return (num(p.comprimento_mm) * num(p.largura_mm)) / 1_000_000 * num(p.quantidade)
}

export function areaDaChapa(c: Chapa): number {
  return (num(c.comprimento_mm) * num(c.largura_mm)) / 1_000_000
}

export function custoM2(c: Chapa): number {
  const area = areaDaChapa(c)
  return area > 0 ? num(c.custo_chapa) / area : 0
}

/* ---------------------------------------------------------------------------
 * Aproveitamento de chapa
 *
 * O indicador que substitui "controle de perda" na marcenaria. Sobra de nesting
 * não é erro de ninguém — é consequência do plano de corte. O que se administra
 * é o percentual, não a ocorrência.
 * ------------------------------------------------------------------------- */

export type Aproveitamento = {
  chaveChapa: string
  chapaId: number | null
  m2Uteis: number
  m2Consumidos: number
  chapasConsumidas: number
  percentual: number
  m2Sobra: number
  custoSobra: number
}

export function calcularAproveitamento(
  pecas: Peca[],
  consumos: ChapaConsumida[],
  chapas: Chapa[]
): Aproveitamento[] {
  const porId = new Map(chapas.map((c) => [c.id, c]))
  const mapa = new Map<number, Aproveitamento>()

  const garantir = (chapaId: number): Aproveitamento => {
    let alvo = mapa.get(chapaId)
    if (!alvo) {
      const chapa = porId.get(chapaId)
      alvo = {
        chaveChapa: chapa?.nome || `Chapa #${chapaId}`,
        chapaId,
        m2Uteis: 0, m2Consumidos: 0, chapasConsumidas: 0,
        percentual: 0, m2Sobra: 0, custoSobra: 0,
      }
      mapa.set(chapaId, alvo)
    }
    return alvo
  }

  for (const p of pecas) {
    if (!p.chapa_id) continue
    garantir(p.chapa_id).m2Uteis += areaDaPeca(p)
  }

  for (const c of consumos) {
    const alvo = garantir(c.chapa_id)
    const chapa = porId.get(c.chapa_id)
    alvo.chapasConsumidas += num(c.quantidade)
    alvo.m2Consumidos += num(c.quantidade) * (chapa ? areaDaChapa(chapa) : 0)
  }

  for (const a of mapa.values()) {
    a.percentual = a.m2Consumidos > 0 ? (a.m2Uteis / a.m2Consumidos) * 100 : 0
    a.m2Sobra = Math.max(0, a.m2Consumidos - a.m2Uteis)
    const chapa = a.chapaId ? porId.get(a.chapaId) : undefined
    a.custoSobra = chapa ? a.m2Sobra * custoM2(chapa) : 0
  }

  return [...mapa.values()].sort((x, y) => y.m2Consumidos - x.m2Consumidos)
}

export type ResumoAproveitamento = {
  m2Uteis: number
  m2Consumidos: number
  chapasConsumidas: number
  percentual: number
  m2Sobra: number
  custoSobra: number
}

export const RESUMO_APROVEITAMENTO_VAZIO: ResumoAproveitamento = {
  m2Uteis: 0, m2Consumidos: 0, chapasConsumidas: 0,
  percentual: 0, m2Sobra: 0, custoSobra: 0,
}

export function resumirAproveitamento(linhas: Aproveitamento[]): ResumoAproveitamento {
  if (linhas.length === 0) return { ...RESUMO_APROVEITAMENTO_VAZIO }
  const m2Uteis = linhas.reduce((s, l) => s + l.m2Uteis, 0)
  const m2Consumidos = linhas.reduce((s, l) => s + l.m2Consumidos, 0)
  return {
    m2Uteis,
    m2Consumidos,
    chapasConsumidas: linhas.reduce((s, l) => s + l.chapasConsumidas, 0),
    percentual: m2Consumidos > 0 ? (m2Uteis / m2Consumidos) * 100 : 0,
    m2Sobra: Math.max(0, m2Consumidos - m2Uteis),
    custoSobra: linhas.reduce((s, l) => s + l.custoSobra, 0),
  }
}

/* ---------------------------------------------------------------------------
 * Consumo de fita
 * ------------------------------------------------------------------------- */

export type ConsumoFita = {
  chave: string
  fitaId: number | null
  metros: number
  pecas: number
  custo: number
}

export function consumoDeFita(pecas: Peca[], fitas: Fita[]): ConsumoFita[] {
  const porId = new Map(fitas.map((f) => [f.id, f]))
  const mapa = new Map<number, ConsumoFita>()

  for (const p of pecas) {
    const metros = metrosDeFita(p)
    if (metros <= 0) continue
    const id = p.fita_id ?? -1
    let alvo = mapa.get(id)
    if (!alvo) {
      const fita = id > 0 ? porId.get(id) : undefined
      alvo = {
        chave: fita ? `${fita.nome} · ${fita.cor_padrao}` : 'Fita não definida',
        fitaId: id > 0 ? id : null,
        metros: 0, pecas: 0, custo: 0,
      }
      mapa.set(id, alvo)
    }
    alvo.metros += metros
    alvo.pecas += num(p.quantidade)
    const fita = id > 0 ? porId.get(id) : undefined
    alvo.custo += metros * num(fita?.custo_metro)
  }

  return [...mapa.values()].sort((a, b) => b.metros - a.metros)
}

/* ---------------------------------------------------------------------------
 * Fila de produção por etapa
 *
 * O painel operacional: quantas peças esperam em cada ponto da fábrica.
 * Diferente da estofaria, aqui o gargalo é visível peça a peça.
 * ------------------------------------------------------------------------- */

export const STATUS_PECA = ['PENDENTE', 'CORTADA', 'FITADA', 'ACABADA', 'MONTADA'] as const
export type StatusPeca = (typeof STATUS_PECA)[number]

export const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: 'Aguardando corte',
  CORTADA: 'Na fila de fitagem',
  FITADA: 'Aguardando acabamento',
  ACABADA: 'Aguardando montagem',
  MONTADA: 'Pronta',
  REFUGADA: 'Refugada',
}

export type FilaEtapa = {
  status: string
  rotulo: string
  pecas: number
  m2: number
  metrosFita: number
}

export function filaPorEtapa(pecas: Peca[]): FilaEtapa[] {
  const mapa = new Map<string, FilaEtapa>()

  for (const p of pecas) {
    let alvo = mapa.get(p.status)
    if (!alvo) {
      alvo = {
        status: p.status,
        rotulo: ROTULO_STATUS[p.status] || p.status,
        pecas: 0, m2: 0, metrosFita: 0,
      }
      mapa.set(p.status, alvo)
    }
    alvo.pecas += num(p.quantidade)
    alvo.m2 += areaDaPeca(p)
    alvo.metrosFita += metrosDeFita(p)
  }

  // ordem do processo, não alfabética: a fila precisa ser lida na sequência
  const ordem = [...STATUS_PECA, 'REFUGADA'] as string[]
  return [...mapa.values()].sort(
    (a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status)
  )
}

/* ---------------------------------------------------------------------------
 * Produtividade de máquina
 *
 * Denominador diferente do humano: a CNC rende chapas/hora, a coladeira
 * metros/hora. Comparar com capacidade_hora dá a ocupação real do equipamento.
 * ------------------------------------------------------------------------- */

export type ApontamentoMaquina = {
  id: number
  maquina_id: number | null
  data_ref: string
  inicio: string | null
  fim: string | null
  horas: number | string | null
  pecas: number | string
  metros: number | string
  chapas: number | string
}

export type ProdutividadeMaquina = {
  maquinaId: number
  nome: string
  tipo: string
  unidade: string
  horas: number
  dias: number
  chapas: number
  metros: number
  pecas: number
  /** rendimento na unidade própria da máquina */
  porHora: number
  capacidade: number
  /** realizado ÷ capacidade nominal */
  eficiencia: number
  custo: number
}

/** Qual grandeza a máquina produz, conforme a unidade cadastrada. */
function grandeza(unidade: string, a: { chapas: number; metros: number; pecas: number }) {
  if (unidade === 'metros') return a.metros
  if (unidade === 'pecas') return a.pecas
  return a.chapas
}

export function produtividadePorMaquina(
  apontamentos: ApontamentoMaquina[],
  maquinas: Maquina[],
  horasDe: (a: ApontamentoMaquina) => number
): ProdutividadeMaquina[] {
  const porId = new Map(maquinas.map((m) => [m.id, m]))
  const acumulado = new Map<number, {
    horas: number; dias: Set<string>; chapas: number; metros: number; pecas: number
  }>()

  for (const a of apontamentos) {
    if (!a.maquina_id) continue
    let alvo = acumulado.get(a.maquina_id)
    if (!alvo) {
      alvo = { horas: 0, dias: new Set(), chapas: 0, metros: 0, pecas: 0 }
      acumulado.set(a.maquina_id, alvo)
    }
    alvo.horas += horasDe(a)
    alvo.chapas += num(a.chapas)
    alvo.metros += num(a.metros)
    alvo.pecas += num(a.pecas)
    const dia = a.data_ref?.slice(0, 10)
    if (dia) alvo.dias.add(dia)
  }

  const linhas: ProdutividadeMaquina[] = []
  for (const [maquinaId, d] of acumulado) {
    const maquina = porId.get(maquinaId)
    const unidade = maquina?.unidade_capacidade || 'chapas'
    const produzido = grandeza(unidade, d)
    const porHora = d.horas > 0 ? produzido / d.horas : 0
    const capacidade = num(maquina?.capacidade_hora)

    linhas.push({
      maquinaId,
      nome: maquina?.nome || `Máquina #${maquinaId}`,
      tipo: maquina?.tipo || '—',
      unidade,
      horas: d.horas,
      dias: d.dias.size,
      chapas: d.chapas,
      metros: d.metros,
      pecas: d.pecas,
      porHora,
      capacidade,
      eficiencia: capacidade > 0 ? (porHora / capacidade) * 100 : 0,
      custo: d.horas * num(maquina?.custo_hora),
    })
  }

  return linhas.sort((a, b) => b.horas - a.horas)
}

/* ---------------------------------------------------------------------------
 * Estimativa de chapas necessárias
 *
 * Serve para conferir o consumo antes de comprar. Usa um fator de perda porque
 * nenhum nesting aproveita 100% — 15% é o padrão de mercado para MDF.
 * ------------------------------------------------------------------------- */

export const PERDA_NESTING_PADRAO = 15

export function estimarChapas(
  pecas: Peca[],
  chapa: Chapa,
  perdaPercentual = PERDA_NESTING_PADRAO
): { m2Uteis: number; m2ComPerda: number; chapas: number } {
  const m2Uteis = pecas
    .filter((p) => p.chapa_id === chapa.id)
    .reduce((s, p) => s + areaDaPeca(p), 0)
  const m2ComPerda = m2Uteis * (1 + perdaPercentual / 100)
  const area = areaDaChapa(chapa)
  return {
    m2Uteis,
    m2ComPerda,
    chapas: area > 0 ? Math.ceil(m2ComPerda / area) : 0,
  }
}

/* ---------------------------------------------------------------------------
 * Estatísticas de peça (para o relatório)
 * ------------------------------------------------------------------------- */

export type ResumoPecas = {
  total: number
  m2: number
  metrosFita: number
  furos: number
  medianaArea: number
  pecasComFita: number
}

export const RESUMO_PECAS_VAZIO: ResumoPecas = {
  total: 0, m2: 0, metrosFita: 0, furos: 0, medianaArea: 0, pecasComFita: 0,
}

export function resumirPecas(pecas: Peca[]): ResumoPecas {
  if (pecas.length === 0) return { ...RESUMO_PECAS_VAZIO }
  const areas = pecas.map(areaDaPeca).filter((a) => a > 0)
  return {
    total: pecas.reduce((s, p) => s + num(p.quantidade), 0),
    m2: pecas.reduce((s, p) => s + areaDaPeca(p), 0),
    metrosFita: pecas.reduce((s, p) => s + metrosDeFita(p), 0),
    furos: pecas.reduce((s, p) => s + (p.furos || 0) * num(p.quantidade), 0),
    medianaArea: percentil(areas, 50),
    pecasComFita: pecas.filter((p) => quantidadeBordas(p) > 0)
      .reduce((s, p) => s + num(p.quantidade), 0),
  }
}
