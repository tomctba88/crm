'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LabelList,
  Rectangle,
  type BarShapeProps,
} from 'recharts'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { createClient } from '@/lib/supabase/browser-client'
import {
  agruparPor,
  calcularAbertos,
  calcularCiclos,
  calcularEstatisticas,
  curvaConversao,
  distribuirEmFaixas,
  evolucaoMensal,
  formatarDataBR,
  formatarDias,
  formatCurrency,
  indiceDaFaixa,
  mesDaData,
  percentil,
  toISODate,
  ESTATISTICAS_VAZIAS,
  type LeadCiclo,
} from '@/lib/relatorios/ciclo-vendas'

/* --------------------------------------------------------------------------
 * Paleta dos gráficos
 * Uma única série por gráfico → um único matiz (azul), sem rampa de valor.
 * A ordem já é carregada pelo eixo; a cor não precisa repetir a informação.
 * Validado contra a superfície branca dos cards (contraste 4.2:1).
 * ------------------------------------------------------------------------ */
const COR_SERIE = '#2563eb'
const COR_DESTAQUE = '#1e4ca1'
const COR_GRID = '#e2e8f0'
const COR_EIXO = '#94a3b8'
const COR_TEXTO_EIXO = '#64748b'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TODOS = 'TODOS'

type BasePeriodo = 'entrada' | 'fechamento'

async function buscarTodosOsLeads(supabase: ReturnType<typeof createClient>) {
  const limite = 1000
  let inicio = 0
  let todos: LeadCiclo[] = []

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select(
        'id, created_at, data_contato, data_fechamento, status, tipo_contato, vendedor, uf, nome_cliente, nome_empresa, produto_interesse, valor_orcamento'
      )
      .order('id', { ascending: true })
      .range(inicio, inicio + limite - 1)

    if (error) throw error

    const lote = (data || []) as LeadCiclo[]
    todos = [...todos, ...lote]

    if (lote.length < limite) break
    inicio += limite
  }

  const vistos = new Set<number>()
  return todos.filter((lead) => {
    if (vistos.has(lead.id)) return false
    vistos.add(lead.id)
    return true
  })
}

export default function CicloVendasPage() {
  const supabase = useMemo(() => createClient(), [])
  const anoAtual = new Date().getFullYear()

  const [leads, setLeads] = useState<LeadCiclo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // Filtros — uma única linha acima de tudo, escopando todos os blocos abaixo.
  const [ano, setAno] = useState(anoAtual)
  const [mes, setMes] = useState(0)
  const [basePeriodo, setBasePeriodo] = useState<BasePeriodo>('fechamento')
  const [origem, setOrigem] = useState(TODOS)
  const [vendedor, setVendedor] = useState(TODOS)
  const [uf, setUf] = useState(TODOS)

  /**
   * Metade da base fecha no mesmo dia em que entra (D0): são pedidos registrados
   * já prontos — recompra, site, telefone — que nunca tiveram negociação.
   * Misturados aos demais, eles dominam a mediana e ela deixa de medir
   * velocidade comercial. Este filtro separa as duas populações.
   */
  const [excluirD0, setExcluirD0] = useState(false)

  const [ordemTabela, setOrdemTabela] = useState<'dias-desc' | 'dias-asc' | 'valor' | 'data'>('dias-desc')

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setLoading(true)
      setErro('')

      try {
        const dados = await buscarTodosOsLeads(supabase)
        if (ativo) setLeads(dados)
      } catch (e) {
        console.error('Erro ao carregar leads do ciclo de vendas:', e)
        if (ativo) setErro('Não foi possível carregar os leads. Tente recarregar a página.')
      } finally {
        if (ativo) setLoading(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase])

  const hojeISO = useMemo(() => toISODate(new Date().toISOString()) || '', [])

  const base = useMemo(() => calcularCiclos(leads), [leads])
  const abertosTodos = useMemo(() => calcularAbertos(leads, hojeISO), [leads, hojeISO])

  const opcoes = useMemo(() => {
    const origens = new Set<string>()
    const vendedores = new Set<string>()
    const ufs = new Set<string>()
    const anos = new Set<number>()

    for (const ciclo of base.ciclos) {
      origens.add(ciclo.origem)
      vendedores.add(ciclo.vendedor)
      if (ciclo.uf && ciclo.uf !== '-') ufs.add(ciclo.uf)
      anos.add(Number(ciclo.entrada.slice(0, 4)))
      anos.add(Number(ciclo.fechamento.slice(0, 4)))
    }

    return {
      origens: Array.from(origens).sort((a, b) => a.localeCompare(b)),
      vendedores: Array.from(vendedores).sort((a, b) => a.localeCompare(b)),
      ufs: Array.from(ufs).sort((a, b) => a.localeCompare(b)),
      anos: Array.from(anos)
        .filter((valor) => Number.isFinite(valor))
        .sort((a, b) => b - a),
    }
  }, [base.ciclos])

  function dentroDoPeriodo(dataISO: string, anoAlvo: number, mesAlvo: number) {
    const chave = mesDaData(dataISO)
    if (!chave) return false
    return mesAlvo === 0
      ? chave.startsWith(`${anoAlvo}-`)
      : chave === `${anoAlvo}-${String(mesAlvo).padStart(2, '0')}`
  }

  function passaDimensoes(item: { origem: string; vendedor: string; uf?: string }) {
    if (origem !== TODOS && item.origem !== origem) return false
    if (vendedor !== TODOS && item.vendedor !== vendedor) return false
    if (uf !== TODOS && item.uf !== uf) return false
    return true
  }

  // Recorte do período e das dimensões, ainda com os fechamentos em D0 dentro.
  const ciclosPeriodo = useMemo(() => {
    return base.ciclos.filter((ciclo) => {
      const dataBase = basePeriodo === 'entrada' ? ciclo.entrada : ciclo.fechamento
      return dentroDoPeriodo(dataBase, ano, mes) && passaDimensoes(ciclo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.ciclos, ano, mes, basePeriodo, origem, vendedor, uf])

  const totalD0 = useMemo(
    () => ciclosPeriodo.filter((ciclo) => ciclo.dias === 0).length,
    [ciclosPeriodo]
  )

  const percentualD0 = ciclosPeriodo.length > 0 ? (totalD0 / ciclosPeriodo.length) * 100 : 0

  const ciclos = useMemo(
    () => (excluirD0 ? ciclosPeriodo.filter((ciclo) => ciclo.dias > 0) : ciclosPeriodo),
    [ciclosPeriodo, excluirD0]
  )

  // Período anterior equivalente, para o delta dos KPIs.
  const ciclosAnteriores = useMemo(() => {
    const anoAnterior = mes === 0 ? ano - 1 : mes === 1 ? ano - 1 : ano
    const mesAnterior = mes === 0 ? 0 : mes === 1 ? 12 : mes - 1

    return base.ciclos.filter((ciclo) => {
      if (excluirD0 && ciclo.dias === 0) return false
      const dataBase = basePeriodo === 'entrada' ? ciclo.entrada : ciclo.fechamento
      return dentroDoPeriodo(dataBase, anoAnterior, mesAnterior) && passaDimensoes(ciclo)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.ciclos, ano, mes, basePeriodo, origem, vendedor, uf, excluirD0])

  // A carteira aberta é uma foto de HOJE — não faz sentido recortá-la por mês,
  // então só as dimensões (origem/vendedor/UF) a filtram.
  const abertos = useMemo(
    () => abertosTodos.filter((item) => passaDimensoes(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [abertosTodos, origem, vendedor, uf]
  )

  const stats = useMemo(() => calcularEstatisticas(ciclos), [ciclos])
  const statsAnterior = useMemo(() => calcularEstatisticas(ciclosAnteriores), [ciclosAnteriores])

  const idadeCarteira = useMemo(() => {
    if (abertos.length === 0) return ESTATISTICAS_VAZIAS
    return calcularEstatisticas(abertos.map((item) => ({ dias: item.idade, valor: item.valor })))
  }, [abertos])

  const faixas = useMemo(() => distribuirEmFaixas(ciclos), [ciclos])
  const porOrigem = useMemo(() => agruparPor(ciclos, (item) => item.origem), [ciclos])
  const porVendedor = useMemo(() => agruparPor(ciclos, (item) => item.vendedor), [ciclos])
  const evolucao = useMemo(
    () => evolucaoMensal(ciclos, basePeriodo === 'fechamento'),
    [ciclos, basePeriodo]
  )
  const conversao = useMemo(() => curvaConversao(ciclos), [ciclos])
  const faixaDaMediana = useMemo(() => indiceDaFaixa(Math.round(stats.mediana)), [stats.mediana])

  // Leads abertos já mais velhos que o P90 do próprio funil — risco real de perda.
  const envelhecendo = useMemo(() => {
    const limite = stats.p90 > 0 ? stats.p90 : percentil(
      abertos.map((item) => item.idade).sort((a, b) => a - b),
      0.9
    )
    return abertos
      .filter((item) => item.idade > limite)
      .sort((a, b) => b.idade - a.idade)
  }, [abertos, stats.p90])

  const tabela = useMemo(() => {
    const copia = [...ciclos]
    if (ordemTabela === 'dias-desc') copia.sort((a, b) => b.dias - a.dias)
    if (ordemTabela === 'dias-asc') copia.sort((a, b) => a.dias - b.dias)
    if (ordemTabela === 'valor') copia.sort((a, b) => b.valor - a.valor)
    if (ordemTabela === 'data') copia.sort((a, b) => b.fechamento.localeCompare(a.fechamento))
    return copia
  }, [ciclos, ordemTabela])

  function limparFiltros() {
    setAno(anoAtual)
    setMes(0)
    setBasePeriodo('fechamento')
    setOrigem(TODOS)
    setVendedor(TODOS)
    setUf(TODOS)
    setExcluirD0(false)
  }

  function exportarExcel() {
    const linhas = tabela.map((item) => ({
      ID: item.id,
      Cliente: item.cliente,
      Empresa: item.empresa,
      Origem: item.origem,
      Vendedor: item.vendedor,
      UF: item.uf,
      Produto: item.produto,
      'Entrada do lead': formatarDataBR(item.entrada),
      Fechamento: formatarDataBR(item.fechamento),
      'Dias para fechar': item.dias,
      'Valor do orçamento': item.valor,
    }))

    const ws = XLSX.utils.json_to_sheet(linhas)
    ws['!cols'] = [
      { wch: 8 }, { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 20 },
      { wch: 6 }, { wch: 22 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ciclo de vendas')

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    saveAs(blob, `ciclo-vendas_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const rotuloPeriodo = mes === 0 ? `${ano}` : `${MESES[mes - 1]}/${ano}`
  const rotuloBase = basePeriodo === 'fechamento' ? 'data de fechamento' : 'data de entrada'

  const deltaMediana = stats.mediana - statsAnterior.mediana
  const temComparativo = statsAnterior.quantidade > 0 && stats.quantidade > 0

  return (
    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
      {/* Cabeçalho */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
          Velocidade comercial
        </p>
        <h1 className="text-3xl font-black text-slate-900">Ciclo de Vendas</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Quanto tempo o lead leva da entrada até o fechamento. O número principal é a{' '}
          <strong className="font-bold text-slate-700">mediana</strong> — um lead esquecido por
          400 dias distorce a média, mas não a mediana.
        </p>

        {/* Filtros — uma linha, escopam todos os blocos abaixo */}
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-7">
          {/* Não muda o cálculo do ciclo (sempre fechamento - entrada); muda só
              em qual mês cada lead é contado. */}
          <Campo label="O período filtra">
            <select
              value={basePeriodo}
              onChange={(e) => setBasePeriodo(e.target.value as BasePeriodo)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
            >
              <option value="fechamento">Vendas fechadas no período</option>
              <option value="entrada">Leads que entraram no período</option>
            </select>
          </Campo>

          <Campo label="Ano">
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
            >
              {(opcoes.anos.length > 0 ? opcoes.anos : [anoAtual]).map((valor) => (
                <option key={valor} value={valor}>{valor}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Mês">
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
            >
              <option value={0}>Ano inteiro</option>
              {MESES.map((nome, indice) => (
                <option key={nome} value={indice + 1}>{nome}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Origem">
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
            >
              <option value={TODOS}>Todas</option>
              {opcoes.origens.map((valor) => (
                <option key={valor} value={valor}>{valor}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Vendedor">
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
            >
              <option value={TODOS}>Todos</option>
              {opcoes.vendedores.map((valor) => (
                <option key={valor} value={valor}>{valor}</option>
              ))}
            </select>
          </Campo>

          <Campo label="UF">
            <select
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
            >
              <option value={TODOS}>Todas</option>
              {opcoes.ufs.map((valor) => (
                <option key={valor} value={valor}>{valor}</option>
              ))}
            </select>
          </Campo>

          <div className="flex items-end">
            <button
              type="button"
              onClick={limparFiltros}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* O filtro de base de período confunde: deixa explícito que o cálculo
            é sempre o mesmo, e avisa do viés das safras recentes. */}
        <p className="mt-3 text-xs text-slate-500">
          {basePeriodo === 'fechamento'
            ? 'O ciclo é sempre contado da entrada do lead até o fechamento. Aqui você está vendo as vendas fechadas no período — a visão que bate com o faturamento do mês.'
            : 'O ciclo é sempre contado da entrada do lead até o fechamento. Aqui você está vendo a safra de leads que entrou no período.'}
        </p>

        {basePeriodo === 'entrada' && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
            Atenção: safras recentes ainda estão incompletas. Os leads que entraram no período e
            <strong> ainda não fecharam</strong> não aparecem aqui, então os meses mais novos
            parecem mais rápidos do que realmente são. Para comparar meses, use safras já maduras.
          </p>
        )}

        {/* Separa pedido registrado de lead negociado — ver comentário no state. */}
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
          <input
            type="checkbox"
            checked={excluirD0}
            onChange={(e) => setExcluirD0(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
          />
          <span>
            <span className="block text-sm font-bold text-slate-800">
              Considerar apenas leads que negociaram
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Tira da conta os fechamentos no mesmo dia da entrada (D0) — recompra, site e
              telefone, que entram no CRM já fechados e nunca passaram por negociação.
            </span>
          </span>
        </label>

        <p className="mt-3 text-xs text-slate-500">
          {loading
            ? 'Carregando leads...'
            : `${stats.quantidade} lead(s) fechado(s) em ${rotuloPeriodo}, contados pela ${rotuloBase}${
                excluirD0 ? `, excluindo ${totalD0} fechamento(s) em D0` : ''
              }.`}
        </p>

        {erro && (
          <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {erro}
          </p>
        )}

        {(base.inconsistentes > 0 || base.semData > 0) && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
            Fora da conta:{' '}
            {base.semData > 0 && `${base.semData} lead(s) fechado(s) sem data de entrada ou de fechamento`}
            {base.semData > 0 && base.inconsistentes > 0 && ' · '}
            {base.inconsistentes > 0 &&
              `${base.inconsistentes} com fechamento anterior à entrada (data inconsistente)`}
            . Corrija as datas no cadastro do lead para que entrem no cálculo.
          </p>
        )}
      </section>

      {/* Hero + KPIs */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="rounded-[28px] border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
            Ciclo mediano de venda
          </p>
          <p className="mt-4 text-6xl font-black leading-none text-slate-900">
            {stats.quantidade > 0 ? Math.round(stats.mediana) : '—'}
            {stats.quantidade > 0 && (
              <span className="ml-2 text-2xl font-bold text-slate-500">dias</span>
            )}
          </p>

          {temComparativo ? (
            <p className="mt-4 text-sm font-bold">
              <span
                className={
                  deltaMediana < 0
                    ? 'text-emerald-700'
                    : deltaMediana > 0
                      ? 'text-rose-700'
                      : 'text-slate-500'
                }
              >
                {deltaMediana < 0 ? '▼' : deltaMediana > 0 ? '▲' : '='}{' '}
                {Math.abs(Math.round(deltaMediana))} dia(s)
              </span>{' '}
              <span className="font-medium text-slate-600">vs. período anterior</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Sem período anterior para comparar.</p>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Metade dos leads fecha em até {Math.round(stats.mediana)} dias; a outra metade demora mais.
          </p>

          {/* O % de D0 é, em si, um indicador: mede o quanto o CRM registra
              negociação em vez de só arquivar pedido pronto. */}
          {ciclosPeriodo.length > 0 && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-white/70 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Fechados no mesmo dia (D0)
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {percentualD0.toFixed(0)}%
                <span className="ml-2 text-sm font-bold text-slate-500">
                  {totalD0} de {ciclosPeriodo.length}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {excluirD0
                  ? 'Fora da conta acima — o ciclo mostrado é só de quem negociou.'
                  : 'Entram no ciclo acima e puxam a mediana para baixo.'}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Média" valor={stats.quantidade > 0 ? formatarDias(stats.media) : '—'} apoio="Sensível a outliers" />
          <StatTile label="P25 — os rápidos" valor={stats.quantidade > 0 ? formatarDias(stats.p25) : '—'} apoio="25% fecham até aqui" />
          <StatTile label="P75" valor={stats.quantidade > 0 ? formatarDias(stats.p75) : '—'} apoio="75% fecham até aqui" />
          <StatTile label="P90 — os lentos" valor={stats.quantidade > 0 ? formatarDias(stats.p90) : '—'} apoio="Limite de paciência do funil" destaque />
          <StatTile label="Leads fechados" valor={String(stats.quantidade)} apoio={formatCurrency(stats.valorTotal)} />
          <StatTile
            label="Carteira em aberto"
            valor={abertos.length > 0 ? formatarDias(idadeCarteira.mediana) : '—'}
            apoio={`${abertos.length} lead(s) vivos hoje`}
          />
        </div>
      </section>

      {/* Distribuição */}
      <ChartCard
        titulo="Distribuição do ciclo"
        subtitulo="Quantos leads fecham em cada faixa de tempo. Dois picos = dois tipos de venda diferentes."
        vazio={ciclos.length === 0}
        tabela={
          <TabelaSimples
            colunas={['Faixa (dias)', 'Leads', '% do total', 'Valor fechado']}
            linhas={faixas.map((faixa) => [
              faixa.label,
              String(faixa.total),
              `${faixa.percentual.toFixed(1)}%`,
              formatCurrency(faixa.valorTotal),
            ])}
          />
        }
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={faixas} margin={{ top: 28, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid stroke={COR_GRID} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: COR_EIXO }}
              tick={{ fill: COR_TEXTO_EIXO, fontSize: 12 }}
              label={{ value: 'dias até fechar', position: 'insideBottom', offset: -4, fill: COR_TEXTO_EIXO, fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{ fill: COR_TEXTO_EIXO, fontSize: 12 }}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(37,99,235,0.06)' }}
              content={<TooltipFaixa />}
            />
            <Bar
              dataKey="total"
              maxBarSize={56}
              isAnimationActive={false}
              shape={(props: BarShapeProps) => (
                <Rectangle
                  {...props}
                  radius={[4, 4, 0, 0]}
                  fill={props.index === faixaDaMediana ? COR_DESTAQUE : COR_SERIE}
                />
              )}
            >
              <LabelList
                dataKey="total"
                position="top"
                offset={8}
                fill="#0f172a"
                fontSize={12}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {stats.quantidade > 0 && faixaDaMediana >= 0 && (
          <p className="mt-3 text-xs text-slate-500">
            A coluna escura é a faixa onde cai a mediana ({Math.round(stats.mediana)} dias).
          </p>
        )}
      </ChartCard>

      {/* Origem e vendedor */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          titulo="Ciclo por origem"
          subtitulo="Mediana de dias até o fechamento em cada canal de entrada."
          vazio={porOrigem.length === 0}
          tabela={
            <TabelaSimples
              colunas={['Origem', 'Mediana', 'P90', 'Leads', 'Valor']}
              linhas={porOrigem.map((grupo) => [
                grupo.chave,
                formatarDias(grupo.mediana),
                formatarDias(grupo.p90),
                String(grupo.quantidade),
                formatCurrency(grupo.valorTotal),
              ])}
            />
          }
        >
          <GraficoBarrasHorizontais dados={porOrigem} />
        </ChartCard>

        <ChartCard
          titulo="Ciclo por vendedor"
          subtitulo={
            excluirD0
              ? 'Quem fecha mais rápido entre os leads que realmente negociaram.'
              : 'Quem fecha mais rápido. Mediana 0 significa que o vendedor cadastra o lead já fechado — ligue o filtro acima para separar.'
          }
          vazio={porVendedor.length === 0}
          tabela={
            <TabelaSimples
              colunas={['Vendedor', 'Mediana', 'P90', 'Leads', 'Valor']}
              linhas={porVendedor.map((grupo) => [
                grupo.chave,
                formatarDias(grupo.mediana),
                formatarDias(grupo.p90),
                String(grupo.quantidade),
                formatCurrency(grupo.valorTotal),
              ])}
            />
          }
        >
          <GraficoBarrasHorizontais dados={porVendedor} />
        </ChartCard>
      </section>

      {/* Evolução e curva */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          titulo="Evolução do ciclo mediano"
          subtitulo={`Mês a mês, agrupado pela ${rotuloBase}. Linha caindo = processo acelerando.`}
          vazio={evolucao.length === 0}
          tabela={
            <TabelaSimples
              colunas={['Mês', 'Mediana (dias)', 'Leads fechados']}
              linhas={evolucao.map((ponto) => [
                ponto.label,
                String(ponto.mediana),
                String(ponto.quantidade),
              ])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucao} margin={{ top: 20, right: 28, left: 4, bottom: 8 }}>
              <CartesianGrid stroke={COR_GRID} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: COR_EIXO }}
                tick={{ fill: COR_TEXTO_EIXO, fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fill: COR_TEXTO_EIXO, fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip content={<TooltipEvolucao />} />
              {stats.quantidade > 0 && (
                <ReferenceLine
                  y={Math.round(stats.mediana)}
                  stroke={COR_EIXO}
                  strokeWidth={1}
                  label={{
                    value: `mediana do período: ${Math.round(stats.mediana)}d`,
                    position: 'insideTopRight',
                    fill: COR_TEXTO_EIXO,
                    fontSize: 11,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="mediana"
                stroke={COR_SERIE}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: COR_SERIE, stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: COR_SERIE, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="mediana"
                  position="top"
                  offset={10}
                  fontSize={11}
                  fontWeight={700}
                  fill="#0f172a"
                  content={<RotuloUltimoPonto total={evolucao.length} />}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          titulo="Curva de conversão acumulada"
          subtitulo="Dos leads que fecharam, quantos % já tinham fechado até N dias. Onde a curva achata, insistir rende pouco."
          vazio={ciclos.length === 0}
          tabela={
            <TabelaSimples
              colunas={['Até N dias', 'Leads acumulados', '% do total']}
              linhas={conversao.map((ponto) => [
                `${ponto.dias} dias`,
                String(ponto.acumulado),
                `${ponto.percentual.toFixed(1)}%`,
              ])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={conversao} margin={{ top: 20, right: 28, left: 4, bottom: 8 }}>
              <CartesianGrid stroke={COR_GRID} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: COR_EIXO }}
                tick={{ fill: COR_TEXTO_EIXO, fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(valor: number) => `${valor}%`}
                tick={{ fill: COR_TEXTO_EIXO, fontSize: 12 }}
              />
              <Tooltip content={<TooltipConversao />} />
              <ReferenceLine
                y={50}
                stroke={COR_EIXO}
                strokeWidth={1}
                label={{ value: '50%', position: 'insideTopLeft', fill: COR_TEXTO_EIXO, fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="percentual"
                stroke={COR_SERIE}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: COR_SERIE, stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: COR_SERIE, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {/* Leads envelhecendo */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-2xl font-black text-slate-900">Leads envelhecendo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Leads ainda abertos hoje que já passaram do P90 do funil
            {stats.p90 > 0 ? ` (${Math.round(stats.p90)} dias)` : ''} — estatisticamente,
            a chance de fecharem caiu muito.
          </p>
        </div>

        {envelhecendo.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            Nenhum lead aberto acima do limite. Carteira saudável.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Entrada</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Dias em aberto</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {envelhecendo.slice(0, 40).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.cliente}</td>
                    <td className="px-4 py-3 text-slate-600">{item.origem}</td>
                    <td className="px-4 py-3 text-slate-600">{item.vendedor}</td>
                    <td className="px-4 py-3 text-slate-600">{item.status}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                      {formatarDataBR(item.entrada)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums">
                      {item.idade}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                      {formatCurrency(item.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {envelhecendo.length > 40 && (
          <p className="mt-3 text-right text-xs text-slate-400">
            Mostrando os 40 mais antigos de {envelhecendo.length}.
          </p>
        )}
      </section>

      {/* Detalhe por cliente */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Detalhe por cliente</h2>
            <p className="mt-1 text-sm text-slate-500">
              Todos os leads fechados do período, lead a lead. É aqui que você audita um número
              que pareceu estranho nos gráficos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              ['dias-desc', 'Mais lentos'],
              ['dias-asc', 'Mais rápidos'],
              ['valor', 'Maior valor'],
              ['data', 'Fechamento'],
            ] as const).map(([chave, rotulo]) => (
              <button
                key={chave}
                type="button"
                onClick={() => setOrdemTabela(chave)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  ordemTabela === chave
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {rotulo}
              </button>
            ))}

            <button
              type="button"
              onClick={exportarExcel}
              disabled={tabela.length === 0}
              className="rounded-full bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] px-4 py-2 text-xs font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Exportar Excel
            </button>
          </div>
        </div>

        {tabela.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
            Nenhum lead fechado com os filtros atuais.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3">UF</th>
                  <th className="px-4 py-3 whitespace-nowrap">Entrada</th>
                  <th className="px-4 py-3 whitespace-nowrap">Fechamento</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Dias</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {tabela.slice(0, 300).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{item.cliente}</p>
                      {item.empresa && (
                        <p className="text-xs text-slate-500">{item.empresa}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.origem}</td>
                    <td className="px-4 py-3 text-slate-600">{item.vendedor}</td>
                    <td className="px-4 py-3 text-slate-600">{item.uf}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                      {formatarDataBR(item.entrada)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                      {formatarDataBR(item.fechamento)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                      {item.dias}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                      {formatCurrency(item.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tabela.length > 300 && (
          <p className="mt-3 text-right text-xs text-slate-400">
            Mostrando 300 de {tabela.length} leads. Use a exportação para a lista completa.
          </p>
        )}
      </section>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * Componentes de apoio
 * ------------------------------------------------------------------------ */

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-slate-600">{label}</label>
      {children}
    </div>
  )
}

function StatTile({
  label,
  valor,
  apoio,
  destaque = false,
}: {
  label: string
  valor: string
  apoio: string
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        destaque ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black leading-tight text-slate-900">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{apoio}</p>
    </div>
  )
}

/**
 * Card de gráfico com alternância Gráfico/Tabela — o tooltip enriquece a leitura,
 * mas nenhum valor fica preso atrás do mouse.
 */
function ChartCard({
  titulo,
  subtitulo,
  children,
  tabela,
  vazio,
}: {
  titulo: string
  subtitulo: string
  children: React.ReactNode
  tabela: React.ReactNode
  vazio: boolean
}) {
  const [modo, setModo] = useState<'grafico' | 'tabela'>('grafico')

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">{titulo}</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">{subtitulo}</p>
        </div>

        <div className="flex shrink-0 gap-1 rounded-full bg-slate-100 p-1">
          {([
            ['grafico', 'Gráfico'],
            ['tabela', 'Tabela'],
          ] as const).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setModo(chave)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                modo === chave ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {vazio ? (
        <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
          Sem dados para os filtros atuais.
        </p>
      ) : modo === 'grafico' ? (
        children
      ) : (
        tabela
      )}
    </div>
  )
}

function TabelaSimples({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {colunas.map((coluna, indice) => (
              <th key={coluna} className={`px-4 py-3 ${indice > 0 ? 'text-right' : ''}`}>
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.join('|')} className="border-t border-slate-100">
              {linha.map((celula, indice) => (
                <td
                  key={`${linha[0]}-${indice}`}
                  className={`px-4 py-3 ${
                    indice > 0
                      ? 'text-right tabular-nums text-slate-700'
                      : 'font-medium text-slate-800'
                  }`}
                >
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Barras horizontais em HTML — mesma linguagem visual dos outros relatórios do CRM. */
function GraficoBarrasHorizontais({
  dados,
}: {
  dados: { chave: string; mediana: number; p90: number; quantidade: number; valorTotal: number }[]
}) {
  const maior = Math.max(...dados.map((item) => item.mediana), 1)

  return (
    <div className="space-y-4">
      {dados.map((item) => {
        const largura = item.mediana > 0 ? Math.max((item.mediana / maior) * 100, 3) : 0

        return (
          <div
            key={item.chave}
            className="group rounded-xl px-2 py-1 transition hover:bg-slate-50"
            title={`${item.chave} — mediana ${formatarDias(item.mediana)}, P90 ${formatarDias(item.p90)}, ${item.quantidade} lead(s)`}
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-bold text-slate-700">{item.chave}</span>
              <span className="shrink-0 text-sm font-black text-slate-900 tabular-nums">
                {Math.round(item.mediana)}d
                <span className="ml-2 text-xs font-medium text-slate-500">
                  {item.quantidade} lead{item.quantidade !== 1 ? 's' : ''}
                </span>
              </span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-3 rounded-full transition-all"
                style={{ width: `${largura}%`, backgroundColor: COR_SERIE }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Rotula apenas o último ponto da linha — um número em cada ponto vira ruído. */
function RotuloUltimoPonto(props: {
  index?: number
  x?: number
  y?: number
  value?: number
  total: number
}) {
  const { index, x, y, value, total } = props
  if (index !== total - 1 || x === undefined || y === undefined) return null

  return (
    <text x={x} y={y - 12} textAnchor="middle" fill="#0f172a" fontSize={12} fontWeight={700}>
      {value}d
    </text>
  )
}

/* ---- Tooltips: valor em destaque, rótulo secundário ---- */

function CaixaTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      {children}
    </div>
  )
}

type TooltipProps<T> = { active?: boolean; payload?: { payload: T }[] }

function TooltipFaixa({ active, payload }: TooltipProps<{ label: string; total: number; percentual: number; valorTotal: number }>) {
  if (!active || !payload?.length) return null
  const dado = payload[0].payload

  return (
    <CaixaTooltip>
      <p className="text-lg font-black text-slate-900">
        {dado.total} <span className="text-sm font-bold text-slate-500">lead(s)</span>
      </p>
      <p className="text-xs text-slate-500">fecharam em {dado.label} dias</p>
      <p className="mt-1 text-xs font-medium text-slate-600">
        {dado.percentual.toFixed(1)}% do total · {formatCurrency(dado.valorTotal)}
      </p>
    </CaixaTooltip>
  )
}

function TooltipEvolucao({ active, payload }: TooltipProps<{ label: string; mediana: number; quantidade: number }>) {
  if (!active || !payload?.length) return null
  const dado = payload[0].payload

  return (
    <CaixaTooltip>
      <p className="text-lg font-black text-slate-900">
        {dado.mediana} <span className="text-sm font-bold text-slate-500">dias</span>
      </p>
      <p className="text-xs text-slate-500">mediana em {dado.label}</p>
      <p className="mt-1 text-xs font-medium text-slate-600">
        {dado.quantidade} lead(s) fechado(s)
      </p>
    </CaixaTooltip>
  )
}

function TooltipConversao({ active, payload }: TooltipProps<{ dias: number; acumulado: number; percentual: number }>) {
  if (!active || !payload?.length) return null
  const dado = payload[0].payload

  return (
    <CaixaTooltip>
      <p className="text-lg font-black text-slate-900">
        {dado.percentual.toFixed(1)}%
      </p>
      <p className="text-xs text-slate-500">dos leads fecharam em até {dado.dias} dias</p>
      <p className="mt-1 text-xs font-medium text-slate-600">{dado.acumulado} lead(s)</p>
    </CaixaTooltip>
  )
}
