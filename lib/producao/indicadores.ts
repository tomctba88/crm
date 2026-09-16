/**
 * Indicadores da produção — estofaria de cadeiras.
 *
 * Cinco métricas, todas ancoradas em producao_ordem_itens:
 *   volume        · peças produzidas por dia/mês/ano, modelo e cor
 *   curva ABC     · modelos rankeados por faturamento (regra 80/95)
 *   perda         · material e peça refugada, com motivo e custo
 *   produtividade · peças por hora e por dia de cada estofador
 *   tempo         · da geração da OP até a finalização
 *
 * Módulo puro (sem React/Supabase) para poder ser testado isoladamente.
 */

/* ---------------------------------------------------------------------------
 * Tipos de entrada — espelham o SELECT feito na página
 * ------------------------------------------------------------------------- */

export type OrdemIndicador = {
  id: number
  numero: string
  status: string
  created_at: string
  iniciada_em: string | null
  concluida_em: string | null
  data_prevista: string | null
  responsavel: string | null
}

export type ItemIndicador = {
  id: number
  ordem_id: number
  produto_id: number | null
  descricao: string | null
  revestimento_id: number | null
  qtd_planejada: number | string
  qtd_produzida: number | string
  qtd_perdida: number | string
  valor_unitario: number | string
  custo_unitario: number | string
}

export type RevestimentoIndicador = {
  id: number
  nome: string
  cor: string
  material: string
}

export type ApontamentoIndicador = {
  id: number
  funcionario_id: number
  ordem_id: number | null
  data_ref: string
  inicio: string | null
  fim: string | null
  horas: number | string | null
  pecas: number | string
}

export type FuncionarioIndicador = {
  id: number
  nome: string
  funcao: string
  jornada_horas: number | string
  ativo: boolean
}

export type PerdaIndicador = {
  id: number
  data_ref: string
  tipo: string
  motivo_id: number | null
  funcionario_id: number | null
  ordem_item_id: number | null
  quantidade: number | string
  custo_estimado: number | string
  recuperavel: boolean
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

export const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

export function num(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

/** Pega só a parte da data (YYYY-MM-DD) de um ISO ou timestamptz. */
export function diaDe(iso: string | null | undefined): string | null {
  if (!iso) return null
  const s = String(iso)
  return s.length >= 10 ? s.slice(0, 10) : null
}

export function mesDe(iso: string | null | undefined): string | null {
  const dia = diaDe(iso)
  return dia ? dia.slice(0, 7) : null
}

export function anoDe(iso: string | null | undefined): string | null {
  const dia = diaDe(iso)
  return dia ? dia.slice(0, 4) : null
}

/** "2026-03" → "mar/26" */
export function rotuloMes(chave: string) {
  const [ano, mes] = chave.split('-')
  const idx = Number(mes) - 1
  if (idx < 0 || idx > 11) return chave
  return `${MESES_CURTOS[idx]}/${ano.slice(2)}`
}

/** "2026-03-14" → "14/03/2026" */
export function formatarDataBR(iso: string | null) {
  const dia = diaDe(iso)
  if (!dia) return '—'
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}

export function formatCurrency(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatNumero(valor: number, casas = 1) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

/** Horas entre dois instantes, com uma casa decimal de resolução útil. */
export function horasEntre(inicioISO: string, fimISO: string) {
  const ms = new Date(fimISO).getTime() - new Date(inicioISO).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / 3_600_000
}

export function formatarHoras(valor: number) {
  if (valor <= 0) return '—'
  if (valor < 24) return `${formatNumero(valor, 1)} h`
  return `${formatNumero(valor / 24, 1)} d`
}

/**
 * Horas efetivas de um apontamento: cronômetro quando existe, senão o lançado.
 * Tipado pelo que de fato usa, para servir também ao apontamento de máquina.
 */
export function horasDoApontamento(
  a: { inicio: string | null; fim: string | null; horas: number | string | null }
): number {
  if (a.inicio && a.fim) return horasEntre(a.inicio, a.fim)
  return num(a.horas)
}

export function percentil(valores: number[], p: number) {
  if (valores.length === 0) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  const pos = (ordenados.length - 1) * (p / 100)
  const baixo = Math.floor(pos)
  const alto = Math.ceil(pos)
  if (baixo === alto) return ordenados[baixo]
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (pos - baixo)
}

/* ---------------------------------------------------------------------------
 * 1. VOLUME DE PRODUÇÃO
 * ------------------------------------------------------------------------- */

/**
 * Peça produzida, achatada com o dia em que a OP foi concluída.
 * O volume conta pela CONCLUSÃO, não pela abertura: uma OP aberta em janeiro e
 * entregue em março é produção de março.
 */
export type PecaProduzida = {
  itemId: number
  ordemId: number
  ordemNumero: string
  dia: string
  mes: string
  ano: string
  modelo: string
  produtoId: number | null
  revestimento: string
  cor: string
  material: string
  quantidade: number
  perdida: number
  faturamento: number
  custo: number
}

const SEM_REVESTIMENTO = 'Sem revestimento'
const SEM_MODELO = 'Sem modelo'

export function montarPecas(
  ordens: OrdemIndicador[],
  itens: ItemIndicador[],
  revestimentos: RevestimentoIndicador[]
): PecaProduzida[] {
  const porOrdem = new Map(ordens.map((o) => [o.id, o]))
  const porRevestimento = new Map(revestimentos.map((r) => [r.id, r]))
  const pecas: PecaProduzida[] = []

  for (const item of itens) {
    const ordem = porOrdem.get(item.ordem_id)
    if (!ordem) continue

    const quantidade = num(item.qtd_produzida)
    const perdida = num(item.qtd_perdida)
    if (quantidade <= 0 && perdida <= 0) continue

    // sem conclusão registrada, cai no created_at para não sumir do relatório
    const referencia = ordem.concluida_em || ordem.iniciada_em || ordem.created_at
    const dia = diaDe(referencia)
    if (!dia) continue

    const rev = item.revestimento_id ? porRevestimento.get(item.revestimento_id) : undefined

    pecas.push({
      itemId: item.id,
      ordemId: ordem.id,
      ordemNumero: ordem.numero,
      dia,
      mes: dia.slice(0, 7),
      ano: dia.slice(0, 4),
      modelo: item.descricao?.trim() || SEM_MODELO,
      produtoId: item.produto_id,
      revestimento: rev?.nome || SEM_REVESTIMENTO,
      cor: rev?.cor || SEM_REVESTIMENTO,
      material: rev?.material || '—',
      quantidade,
      perdida,
      faturamento: quantidade * num(item.valor_unitario),
      custo: quantidade * num(item.custo_unitario),
    })
  }

  return pecas
}

export type GrupoVolume = {
  chave: string
  pecas: number
  perdidas: number
  faturamento: number
  custo: number
  ordens: number
}

export function agruparVolume(
  pecas: PecaProduzida[],
  chaveDe: (p: PecaProduzida) => string
): GrupoVolume[] {
  const mapa = new Map<string, GrupoVolume & { _ordens: Set<number> }>()

  for (const p of pecas) {
    const chave = chaveDe(p)
    let grupo = mapa.get(chave)
    if (!grupo) {
      grupo = { chave, pecas: 0, perdidas: 0, faturamento: 0, custo: 0, ordens: 0, _ordens: new Set() }
      mapa.set(chave, grupo)
    }
    grupo.pecas += p.quantidade
    grupo.perdidas += p.perdida
    grupo.faturamento += p.faturamento
    grupo.custo += p.custo
    grupo._ordens.add(p.ordemId)
  }

  return [...mapa.values()].map(({ _ordens, ...g }) => ({ ...g, ordens: _ordens.size }))
}

/** Série temporal ordenada cronologicamente (para os gráficos de barra). */
export function serieVolume(pecas: PecaProduzida[], granularidade: 'dia' | 'mes' | 'ano') {
  const grupos = agruparVolume(pecas, (p) => p[granularidade])
  return grupos
    .sort((a, b) => a.chave.localeCompare(b.chave))
    .map((g) => ({
      ...g,
      rotulo: granularidade === 'mes' ? rotuloMes(g.chave)
        : granularidade === 'dia' ? formatarDataBR(g.chave).slice(0, 5)
        : g.chave,
    }))
}

/* ---------------------------------------------------------------------------
 * 2. CURVA ABC — modelos por faturamento
 *
 * Regra clássica de Pareto: ordena por faturamento decrescente e corta a
 * classe pelo acumulado — A até 80%, B até 95%, C o resto.
 * ------------------------------------------------------------------------- */

export type LinhaABC = {
  posicao: number
  modelo: string
  pecas: number
  faturamento: number
  custo: number
  margem: number
  percentual: number
  acumulado: number
  classe: 'A' | 'B' | 'C'
}

export function curvaABC(pecas: PecaProduzida[]): LinhaABC[] {
  const grupos = agruparVolume(pecas, (p) => p.modelo)
    .filter((g) => g.faturamento > 0)
    .sort((a, b) => b.faturamento - a.faturamento)

  const total = grupos.reduce((s, g) => s + g.faturamento, 0)
  if (total <= 0) return []

  let acumulado = 0
  return grupos.map((g, idx) => {
    const percentual = (g.faturamento / total) * 100
    acumulado += percentual
    const classe: 'A' | 'B' | 'C' = acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C'
    return {
      posicao: idx + 1,
      modelo: g.chave,
      pecas: g.pecas,
      faturamento: g.faturamento,
      custo: g.custo,
      margem: g.faturamento - g.custo,
      percentual,
      acumulado,
      classe,
    }
  })
}

export type ResumoClasse = {
  classe: 'A' | 'B' | 'C'
  modelos: number
  pecas: number
  faturamento: number
  percentual: number
}

export function resumoABC(linhas: LinhaABC[]): ResumoClasse[] {
  const total = linhas.reduce((s, l) => s + l.faturamento, 0)
  return (['A', 'B', 'C'] as const).map((classe) => {
    const doGrupo = linhas.filter((l) => l.classe === classe)
    const faturamento = doGrupo.reduce((s, l) => s + l.faturamento, 0)
    return {
      classe,
      modelos: doGrupo.length,
      pecas: doGrupo.reduce((s, l) => s + l.pecas, 0),
      faturamento,
      percentual: total > 0 ? (faturamento / total) * 100 : 0,
    }
  })
}

/* ---------------------------------------------------------------------------
 * 3. CONTROLE DE PERDA
 * ------------------------------------------------------------------------- */

export type ResumoPerdas = {
  ocorrencias: number
  quantidadeMaterial: number
  pecasRefugadas: number
  custoTotal: number
  custoRecuperavel: number
  custoSucata: number
  /** peças refugadas / (produzidas + refugadas) — o índice de refugo da fábrica */
  taxaRefugo: number
}

export const RESUMO_PERDAS_VAZIO: ResumoPerdas = {
  ocorrencias: 0,
  quantidadeMaterial: 0,
  pecasRefugadas: 0,
  custoTotal: 0,
  custoRecuperavel: 0,
  custoSucata: 0,
  taxaRefugo: 0,
}

export function resumirPerdas(perdas: PerdaIndicador[], pecasProduzidas: number): ResumoPerdas {
  if (perdas.length === 0) return { ...RESUMO_PERDAS_VAZIO }

  let quantidadeMaterial = 0
  let pecasRefugadas = 0
  let custoTotal = 0
  let custoRecuperavel = 0

  for (const p of perdas) {
    const qtd = num(p.quantidade)
    const custo = num(p.custo_estimado)
    if (p.tipo === 'peca') pecasRefugadas += qtd
    else quantidadeMaterial += qtd
    custoTotal += custo
    if (p.recuperavel) custoRecuperavel += custo
  }

  const base = pecasProduzidas + pecasRefugadas
  return {
    ocorrencias: perdas.length,
    quantidadeMaterial,
    pecasRefugadas,
    custoTotal,
    custoRecuperavel,
    custoSucata: custoTotal - custoRecuperavel,
    taxaRefugo: base > 0 ? (pecasRefugadas / base) * 100 : 0,
  }
}

export type GrupoPerda = {
  chave: string
  ocorrencias: number
  quantidade: number
  custo: number
  percentual: number
}

/** Pareto das perdas: ordenado por custo, que é onde a decisão acontece. */
export function agruparPerdas(
  perdas: PerdaIndicador[],
  chaveDe: (p: PerdaIndicador) => string
): GrupoPerda[] {
  const mapa = new Map<string, GrupoPerda>()

  for (const p of perdas) {
    const chave = chaveDe(p)
    let grupo = mapa.get(chave)
    if (!grupo) {
      grupo = { chave, ocorrencias: 0, quantidade: 0, custo: 0, percentual: 0 }
      mapa.set(chave, grupo)
    }
    grupo.ocorrencias += 1
    grupo.quantidade += num(p.quantidade)
    grupo.custo += num(p.custo_estimado)
  }

  const grupos = [...mapa.values()].sort((a, b) => b.custo - a.custo)
  const total = grupos.reduce((s, g) => s + g.custo, 0)
  if (total > 0) grupos.forEach((g) => { g.percentual = (g.custo / total) * 100 })
  return grupos
}

export function serieMensalPerdas(perdas: PerdaIndicador[]) {
  const grupos = agruparPerdas(perdas, (p) => mesDe(p.data_ref) || '—')
  return grupos
    .sort((a, b) => a.chave.localeCompare(b.chave))
    .map((g) => ({ ...g, rotulo: rotuloMes(g.chave) }))
}

/* ---------------------------------------------------------------------------
 * 4. PRODUTIVIDADE DO ESTOFADOR
 *
 * peças/hora usa as horas efetivamente apontadas (denominador honesto: só conta
 * hora em que a pessoa estava na peça). peças/dia usa dias distintos com
 * apontamento, não dias de calendário — férias e falta não derrubam a média.
 * ------------------------------------------------------------------------- */

export type ProdutividadeFuncionario = {
  funcionarioId: number
  nome: string
  funcao: string
  pecas: number
  horas: number
  dias: number
  pecasPorHora: number
  pecasPorDia: number
  horasPorDia: number
  /** horas apontadas / (dias × jornada padrão) — quanto da jornada virou peça */
  ocupacao: number
}

export function produtividadePorFuncionario(
  apontamentos: ApontamentoIndicador[],
  funcionarios: FuncionarioIndicador[]
): ProdutividadeFuncionario[] {
  const porId = new Map(funcionarios.map((f) => [f.id, f]))
  const acumulado = new Map<number, { pecas: number; horas: number; dias: Set<string> }>()

  for (const a of apontamentos) {
    let alvo = acumulado.get(a.funcionario_id)
    if (!alvo) {
      alvo = { pecas: 0, horas: 0, dias: new Set() }
      acumulado.set(a.funcionario_id, alvo)
    }
    alvo.pecas += num(a.pecas)
    alvo.horas += horasDoApontamento(a)
    const dia = diaDe(a.data_ref)
    if (dia) alvo.dias.add(dia)
  }

  const linhas: ProdutividadeFuncionario[] = []
  for (const [funcionarioId, dados] of acumulado) {
    const func = porId.get(funcionarioId)
    const dias = dados.dias.size
    const jornada = num(func?.jornada_horas) || 8
    linhas.push({
      funcionarioId,
      nome: func?.nome || `Funcionário #${funcionarioId}`,
      funcao: func?.funcao || '—',
      pecas: dados.pecas,
      horas: dados.horas,
      dias,
      pecasPorHora: dados.horas > 0 ? dados.pecas / dados.horas : 0,
      pecasPorDia: dias > 0 ? dados.pecas / dias : 0,
      horasPorDia: dias > 0 ? dados.horas / dias : 0,
      ocupacao: dias > 0 ? (dados.horas / (dias * jornada)) * 100 : 0,
    })
  }

  return linhas.sort((a, b) => b.pecasPorHora - a.pecasPorHora)
}

export type PontoProdutividade = {
  chave: string
  rotulo: string
  pecas: number
  horas: number
  pecasPorHora: number
}

export function evolucaoProdutividade(
  apontamentos: ApontamentoIndicador[],
  granularidade: 'dia' | 'mes' = 'mes'
): PontoProdutividade[] {
  const mapa = new Map<string, { pecas: number; horas: number }>()

  for (const a of apontamentos) {
    const chave = (granularidade === 'mes' ? mesDe(a.data_ref) : diaDe(a.data_ref)) || '—'
    const alvo = mapa.get(chave) || { pecas: 0, horas: 0 }
    alvo.pecas += num(a.pecas)
    alvo.horas += horasDoApontamento(a)
    mapa.set(chave, alvo)
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([chave, d]) => ({
      chave,
      rotulo: granularidade === 'mes' ? rotuloMes(chave) : formatarDataBR(chave).slice(0, 5),
      pecas: d.pecas,
      horas: d.horas,
      pecasPorHora: d.horas > 0 ? d.pecas / d.horas : 0,
    }))
}

/* ---------------------------------------------------------------------------
 * 5. TEMPO DE FABRICAÇÃO
 *
 * Lead time  = geração da OP → finalização (o que o cliente sente)
 * Fila       = geração da OP → início da primeira etapa
 * Execução   = início → finalização (o que a fábrica controla)
 *
 * Fila + execução separam "estamos lentos" de "estamos parados esperando".
 * Mediana como número principal: uma OP esquecida por 200 dias arruína a média.
 * ------------------------------------------------------------------------- */

export type TempoOrdem = {
  ordemId: number
  numero: string
  responsavel: string
  concluidaEm: string
  pecas: number
  leadTimeHoras: number
  filaHoras: number
  execucaoHoras: number
  /** conclusão dentro do prazo prometido no pedido */
  noPrazo: boolean | null
}

export function calcularTempos(
  ordens: OrdemIndicador[],
  itens: ItemIndicador[]
): TempoOrdem[] {
  const pecasPorOrdem = new Map<number, number>()
  for (const item of itens) {
    pecasPorOrdem.set(item.ordem_id, (pecasPorOrdem.get(item.ordem_id) || 0) + num(item.qtd_produzida))
  }

  const tempos: TempoOrdem[] = []
  for (const o of ordens) {
    if (!o.concluida_em) continue
    const leadTimeHoras = horasEntre(o.created_at, o.concluida_em)
    if (leadTimeHoras <= 0) continue

    const filaHoras = o.iniciada_em ? horasEntre(o.created_at, o.iniciada_em) : 0
    const execucaoHoras = o.iniciada_em ? horasEntre(o.iniciada_em, o.concluida_em) : leadTimeHoras

    const diaConclusao = diaDe(o.concluida_em)
    tempos.push({
      ordemId: o.id,
      numero: o.numero,
      responsavel: o.responsavel?.trim() || '—',
      concluidaEm: o.concluida_em,
      pecas: pecasPorOrdem.get(o.id) || 0,
      leadTimeHoras,
      filaHoras,
      execucaoHoras,
      noPrazo: o.data_prevista && diaConclusao ? diaConclusao <= o.data_prevista : null,
    })
  }

  return tempos.sort((a, b) => b.concluidaEm.localeCompare(a.concluidaEm))
}

export type EstatisticasTempo = {
  quantidade: number
  medianaLeadTime: number
  mediaLeadTime: number
  p90LeadTime: number
  medianaFila: number
  medianaExecucao: number
  horasPorPeca: number
  percentualNoPrazo: number
}

export const ESTATISTICAS_TEMPO_VAZIAS: EstatisticasTempo = {
  quantidade: 0,
  medianaLeadTime: 0,
  mediaLeadTime: 0,
  p90LeadTime: 0,
  medianaFila: 0,
  medianaExecucao: 0,
  horasPorPeca: 0,
  percentualNoPrazo: 0,
}

export function estatisticasTempo(tempos: TempoOrdem[]): EstatisticasTempo {
  if (tempos.length === 0) return { ...ESTATISTICAS_TEMPO_VAZIAS }

  const leadTimes = tempos.map((t) => t.leadTimeHoras)
  const comPrazo = tempos.filter((t) => t.noPrazo !== null)
  const totalPecas = tempos.reduce((s, t) => s + t.pecas, 0)
  const totalExecucao = tempos.reduce((s, t) => s + t.execucaoHoras, 0)

  return {
    quantidade: tempos.length,
    medianaLeadTime: percentil(leadTimes, 50),
    mediaLeadTime: leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length,
    p90LeadTime: percentil(leadTimes, 90),
    medianaFila: percentil(tempos.map((t) => t.filaHoras), 50),
    medianaExecucao: percentil(tempos.map((t) => t.execucaoHoras), 50),
    horasPorPeca: totalPecas > 0 ? totalExecucao / totalPecas : 0,
    percentualNoPrazo: comPrazo.length > 0
      ? (comPrazo.filter((t) => t.noPrazo).length / comPrazo.length) * 100
      : 0,
  }
}

export function evolucaoTempo(tempos: TempoOrdem[]) {
  const mapa = new Map<string, number[]>()
  for (const t of tempos) {
    const chave = mesDe(t.concluidaEm)
    if (!chave) continue
    const lista = mapa.get(chave) || []
    lista.push(t.leadTimeHoras)
    mapa.set(chave, lista)
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([chave, valores]) => ({
      chave,
      rotulo: rotuloMes(chave),
      ordens: valores.length,
      medianaDias: percentil(valores, 50) / 24,
    }))
}
