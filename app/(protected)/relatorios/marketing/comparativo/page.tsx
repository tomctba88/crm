'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import {
  calcularDashboardMarketing,
  type MarketingLead,
} from '@/lib/dashboard/marketing'

type CanalResumo = {
  leads: number
  orcamentos: number
  pedidos: number
  valorPedidos: number
  txQualificacao: number
  txConversao: number
  orcamentosEmAberto: number
  ticketPedidos: number
  valorOrcamento: number
  ticketOrcamento: number
  txConversaoValor: number
  valorEmAberto: number
}

type DadosComparativo = {
  geral: CanalResumo
  google: CanalResumo
  organico: CanalResumo
}

type CanalKey = 'google' | 'organico'

type EvolucaoMensalItem = {
  mes: string
  googleValorPedidos: number
  organicoValorPedidos: number
  googleLeads: number
  organicoLeads: number
  googlePedidos: number
  organicoPedidos: number
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function getMesKey(ano: number, mes: string) {
  if (mes === 'Todos') return undefined
  return `${ano}-${mes}`
}

async function buscarTodosOsLeads(supabase: ReturnType<typeof createClient>) {
  const limite = 1000
  let inicio = 0
  let todos: MarketingLead[] = []

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .range(inicio, inicio + limite - 1)

    if (error) throw error

    const lote = (data || []) as MarketingLead[]
    todos = [...todos, ...lote]

    if (lote.length < limite) break
    inicio += limite
  }

  return todos
}

export default function ComparativoMarketingPage() {
  const supabase = useMemo(() => createClient(), [])
  const hoje = new Date()

  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState('Todos')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [dados, setDados] = useState<DadosComparativo | null>(null)
  const [evolucaoMensal, setEvolucaoMensal] = useState<EvolucaoMensalItem[]>([])
  const [indicadorEvolucao, setIndicadorEvolucao] = useState<
    'valorPedidos' | 'leads' | 'pedidos'
  >('valorPedidos')

  const anosDisponiveis = useMemo(() => {
    const anoAtual = hoje.getFullYear()
    return [anoAtual - 1, anoAtual, anoAtual + 1]
  }, [hoje])

  useEffect(() => {
    buscarDados()
  }, [mes, ano])

  async function buscarDados() {
    setLoading(true)

    try {
      const leads = await buscarTodosOsLeads(supabase)
      const mesKey = getMesKey(ano, mes)

      const geral = calcularDashboardMarketing(leads, 'geral', mesKey)
      const google = calcularDashboardMarketing(leads, 'google', mesKey)
      const organico = calcularDashboardMarketing(
        leads,
        'organico_retorno',
        mesKey
      )

      setDados({
        geral: geral.resumo,
        google: google.resumo,
        organico: organico.resumo,
      })

      const mesesBase =
        mes === 'Todos'
          ? MESES.map((mesNome, index) => ({
              label: mesNome.slice(0, 3).toUpperCase(),
              key: `${ano}-${String(index + 1).padStart(2, '0')}`,
            }))
          : [
              {
                label: MESES[Number(mes) - 1].slice(0, 3).toUpperCase(),
                key: `${ano}-${mes}`,
              },
            ]

      const evolucao = mesesBase.map((item) => {
        const googleMes = calcularDashboardMarketing(leads, 'google', item.key)
        const organicoMes = calcularDashboardMarketing(
          leads,
          'organico_retorno',
          item.key
        )

        return {
          mes: item.label,
          googleValorPedidos: googleMes.resumo.valorPedidos,
          organicoValorPedidos: organicoMes.resumo.valorPedidos,
          googleLeads: googleMes.resumo.leads,
          organicoLeads: organicoMes.resumo.leads,
          googlePedidos: googleMes.resumo.pedidos,
          organicoPedidos: organicoMes.resumo.pedidos,
        }
      })

      setEvolucaoMensal(evolucao)
    } catch (error) {
      console.error('Erro ao buscar comparativo de marketing:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !dados) {
    return (
      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando comparativo de marketing...
          </div>
        </section>
      </div>
    )
  }

  const canais: {
    key: CanalKey
    nome: string
    classe: string
    resumo: CanalResumo
  }[] = [
    {
      key: 'google',
      nome: 'Marketing Google',
      classe: 'bg-violet-600 text-white',
      resumo: dados.google,
    },
    {
      key: 'organico',
      nome: 'Orgânico / Retorno',
      classe: 'bg-emerald-600 text-white',
      resumo: dados.organico,
    },
  ]

  const topLeads = [...canais].sort((a, b) => b.resumo.leads - a.resumo.leads)[0]
  const topConversao = [...canais].sort(
    (a, b) => b.resumo.txConversao - a.resumo.txConversao
  )[0]
  const topValor = [...canais].sort(
    (a, b) => b.resumo.valorPedidos - a.resumo.valorPedidos
  )[0]
  const maiorAberto = [...canais].sort(
    (a, b) => b.resumo.valorEmAberto - a.resumo.valorEmAberto
  )[0]

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">
              Relatórios de marketing
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Comparativo de Marketing
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Comparação entre os canais específicos, com visão total separada para referência.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Filtro de mês
              </label>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="Todos">Todos os meses</option>
                {MESES.map((mesNome, index) => (
                  <option key={mesNome} value={String(index + 1).padStart(2, '0')}>
                    {mesNome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Ano
              </label>
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                {anosDisponiveis.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InsightCard
          titulo="Maior volume de leads"
          valor={topLeads.nome}
          apoio={`${topLeads.resumo.leads} leads`}
          classes="bg-blue-50 border-blue-200"
        />
        <InsightCard
          titulo="Melhor conversão"
          valor={topConversao.nome}
          apoio={`${topConversao.resumo.txConversao.toFixed(2)}%`}
          classes="bg-emerald-50 border-emerald-200"
        />
        <InsightCard
          titulo="Maior faturamento"
          valor={topValor.nome}
          apoio={formatCurrency(topValor.resumo.valorPedidos)}
          classes="bg-violet-50 border-violet-200"
        />
        <InsightCard
          titulo="Maior valor em aberto"
          valor={maiorAberto.nome}
          apoio={formatCurrency(maiorAberto.resumo.valorEmAberto)}
          classes="bg-amber-50 border-amber-200"
        />
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-2xl font-black text-slate-900">
            Visão total do marketing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            O Geral aparece apenas como total consolidado e não entra nos comparativos entre canais.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Leads Totais"
            value={String(dados.geral.leads)}
            classes="bg-blue-600 text-white"
          />
          <KpiCard
            title="Orçamentos Totais"
            value={String(dados.geral.orcamentos)}
            classes="bg-teal-700 text-white"
          />
          <KpiCard
            title="Pedidos Totais"
            value={String(dados.geral.pedidos)}
            classes="bg-violet-600 text-white"
          />
          <KpiCard
            title="Valor de Pedidos"
            value={formatCurrency(dados.geral.valorPedidos)}
            classes="bg-orange-500 text-white"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Tx. Qualificação"
            value={`${dados.geral.txQualificacao.toFixed(2)}%`}
            classes="bg-slate-700 text-white"
          />
          <KpiCard
            title="Tx. Conversão"
            value={`${dados.geral.txConversao.toFixed(2)}%`}
            classes="bg-slate-600 text-white"
          />
          <KpiCard
            title="Valor Orçamento"
            value={formatCurrency(dados.geral.valorOrcamento)}
            classes="bg-red-600 text-white"
          />
          <KpiCard
            title="Valor em Aberto"
            value={formatCurrency(dados.geral.valorEmAberto)}
            classes="bg-pink-700 text-white"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {canais.map((canal) => (
          <div
            key={canal.key}
            className={`rounded-[24px] border border-slate-200 p-6 shadow-sm ${canal.classe}`}
          >
            <p className="text-sm font-bold uppercase tracking-[0.14em] opacity-90">
              {canal.nome}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <MiniInfo label="Leads" value={String(canal.resumo.leads)} />
              <MiniInfo label="Orçamentos" value={String(canal.resumo.orcamentos)} />
              <MiniInfo label="Pedidos" value={String(canal.resumo.pedidos)} />
              <MiniInfo
                label="Conversão"
                value={`${canal.resumo.txConversao.toFixed(2)}%`}
              />
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <LinhaResumo
                label="Valor de pedidos"
                value={formatCurrency(canal.resumo.valorPedidos)}
              />
              <LinhaResumo
                label="Valor orçamento"
                value={formatCurrency(canal.resumo.valorOrcamento)}
              />
              <LinhaResumo
                label="Valor em aberto"
                value={formatCurrency(canal.resumo.valorEmAberto)}
              />
              <LinhaResumo
                label="Ticket médio"
                value={formatCurrency(canal.resumo.ticketPedidos)}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Leads, Orçamentos e Pedidos"
          subtitle="Comparação de volume entre Google e Orgânico / Retorno"
        >
          <ComparativoAgrupado
            canais={canais}
            itens={[
              { chave: 'leads', nome: 'Leads', classe: 'bg-blue-600' },
              { chave: 'orcamentos', nome: 'Orçamentos', classe: 'bg-teal-600' },
              { chave: 'pedidos', nome: 'Pedidos', classe: 'bg-violet-600' },
            ]}
            formatador={(valor) => String(valor)}
          />
        </ChartCard>

        <ChartCard
          title="Valor Orçado, Pedidos e Em Aberto"
          subtitle="Comparação financeira entre Google e Orgânico / Retorno"
        >
          <ComparativoAgrupado
            canais={canais}
            itens={[
              { chave: 'valorOrcamento', nome: 'Valor orçamento', classe: 'bg-red-600' },
              { chave: 'valorPedidos', nome: 'Valor pedidos', classe: 'bg-orange-500' },
              { chave: 'valorEmAberto', nome: 'Valor em aberto', classe: 'bg-pink-700' },
            ]}
            formatador={(valor) => formatCurrency(valor)}
          />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Conversões e qualificação"
          subtitle="Eficiência dos canais na passagem do funil"
        >
          <ComparativoAgrupado
            canais={canais}
            itens={[
              { chave: 'txQualificacao', nome: 'Tx. qualificação', classe: 'bg-slate-700' },
              { chave: 'txConversao', nome: 'Tx. conversão', classe: 'bg-slate-500' },
              { chave: 'txConversaoValor', nome: 'Tx. conv. valor', classe: 'bg-indigo-700' },
            ]}
            formatador={(valor) => `${valor.toFixed(2)}%`}
          />
        </ChartCard>

        <ChartCard
          title="Tickets e orçamento em aberto"
          subtitle="Leitura de valor médio e potencial parado por canal"
        >
          <ComparativoAgrupado
            canais={canais}
            itens={[
              { chave: 'ticketPedidos', nome: 'Ticket pedido', classe: 'bg-slate-800' },
              { chave: 'ticketOrcamento', nome: 'Ticket orçamento', classe: 'bg-indigo-800' },
              { chave: 'valorEmAberto', nome: 'Valor em aberto', classe: 'bg-yellow-600' },
            ]}
            formatador={(valor) => formatCurrency(valor)}
          />
        </ChartCard>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              Evolução mensal comparativa
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Comparação mensal entre Google e Orgânico / Retorno por indicador.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIndicadorEvolucao('valorPedidos')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                indicadorEvolucao === 'valorPedidos'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Valor de Pedidos
            </button>

            <button
              onClick={() => setIndicadorEvolucao('leads')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                indicadorEvolucao === 'leads'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Leads
            </button>

            <button
              onClick={() => setIndicadorEvolucao('pedidos')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                indicadorEvolucao === 'pedidos'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Pedidos
            </button>
          </div>
        </div>

        <EvolucaoMensalComparativa
          items={evolucaoMensal}
          indicador={indicadorEvolucao}
        />
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-2xl font-black text-slate-900">
            Tabela executiva comparativa
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Comparação direta apenas entre os canais específicos.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-bold">Canal</th>
                <th className="px-4 py-3 font-bold">Leads</th>
                <th className="px-4 py-3 font-bold">Orçamentos</th>
                <th className="px-4 py-3 font-bold">Pedidos</th>
                <th className="px-4 py-3 font-bold">Tx. Qualificação</th>
                <th className="px-4 py-3 font-bold">Tx. Conversão</th>
                <th className="px-4 py-3 font-bold">Valor Pedidos</th>
                <th className="px-4 py-3 font-bold">Valor Orçamento</th>
                <th className="px-4 py-3 font-bold">Valor em Aberto</th>
                <th className="px-4 py-3 font-bold">Ticket Pedido</th>
              </tr>
            </thead>
            <tbody>
              {canais.map((canal) => (
                <tr key={canal.key} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-black text-slate-900">
                    {canal.nome}
                  </td>
                  <td className="px-4 py-3">{canal.resumo.leads}</td>
                  <td className="px-4 py-3">{canal.resumo.orcamentos}</td>
                  <td className="px-4 py-3">{canal.resumo.pedidos}</td>
                  <td className="px-4 py-3">
                    {canal.resumo.txQualificacao.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3">
                    {canal.resumo.txConversao.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(canal.resumo.valorPedidos)}
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(canal.resumo.valorOrcamento)}
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(canal.resumo.valorEmAberto)}
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(canal.resumo.ticketPedidos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function InsightCard({
  titulo,
  valor,
  apoio,
  classes,
}: {
  titulo: string
  valor: string
  apoio: string
  classes: string
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">
        {titulo}
      </p>
      <p className="mt-3 text-2xl font-black text-slate-900">{valor}</p>
      <p className="mt-2 text-sm text-slate-600">{apoio}</p>
    </div>
  )
}

function KpiCard({
  title,
  value,
  classes,
}: {
  title: string
  value: string
  classes: string
}) {
  return (
    <div className={`min-w-0 rounded-2xl p-5 shadow-sm ${classes}`}>
      <p className="text-sm font-bold uppercase tracking-[0.12em] opacity-90">
        {title}
      </p>
      <p className="mt-4 truncate text-lg font-black md:text-xl xl:text-2xl">
        {value}
      </p>
    </div>
  )
}

function MiniInfo({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-90">
        {label}
      </p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  )
}

function LinhaResumo({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 last:border-0 last:pb-0">
      <span className="text-white/80">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-2xl font-black text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function EvolucaoMensalComparativa({
  items,
  indicador,
}: {
  items: EvolucaoMensalItem[]
  indicador: 'valorPedidos' | 'leads' | 'pedidos'
}) {
  const getGoogleValor = (item: EvolucaoMensalItem) => {
    if (indicador === 'leads') return item.googleLeads
    if (indicador === 'pedidos') return item.googlePedidos
    return item.googleValorPedidos
  }

  const getOrganicoValor = (item: EvolucaoMensalItem) => {
    if (indicador === 'leads') return item.organicoLeads
    if (indicador === 'pedidos') return item.organicoPedidos
    return item.organicoValorPedidos
  }

  const formatar = (valor: number) => {
    if (indicador === 'valorPedidos') return formatCurrency(valor)
    return String(valor)
  }

  const max = Math.max(
    ...items.flatMap((item) => [getGoogleValor(item), getOrganicoValor(item)]),
    1
  )

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {items.map((item) => {
        const googleValor = getGoogleValor(item)
        const organicoValor = getOrganicoValor(item)

        const larguraGoogle =
          googleValor > 0 ? Math.max((googleValor / max) * 100, 4) : 0
        const larguraOrganico =
          organicoValor > 0 ? Math.max((organicoValor / max) * 100, 4) : 0

        return (
          <div
            key={item.mes}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-black text-slate-900">{item.mes}</h4>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-700">
                    Google
                  </span>
                  <span className="whitespace-nowrap text-sm font-black text-slate-900">
                    {formatar(googleValor)}
                  </span>
                </div>
                <div className="h-4 rounded-full bg-slate-200">
                  <div
                    className="h-4 rounded-full bg-violet-600"
                    style={{ width: `${larguraGoogle}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-700">
                    Orgânico / Retorno
                  </span>
                  <span className="whitespace-nowrap text-sm font-black text-slate-900">
                    {formatar(organicoValor)}
                  </span>
                </div>
                <div className="h-4 rounded-full bg-slate-200">
                  <div
                    className="h-4 rounded-full bg-emerald-600"
                    style={{ width: `${larguraOrganico}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ComparativoAgrupado({
  canais,
  itens,
  formatador,
}: {
  canais: {
    key: CanalKey
    nome: string
    resumo: CanalResumo
  }[]
  itens: {
    chave: keyof CanalResumo
    nome: string
    classe: string
  }[]
  formatador: (valor: number) => string
}) {
  const maiorValor = Math.max(
    ...canais.flatMap((canal) =>
      itens.map((item) => Number(canal.resumo[item.chave]) || 0)
    ),
    1
  )

  return (
    <div className="space-y-6">
      {canais.map((canal) => (
        <div
          key={canal.key}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="mb-4">
            <h4 className="text-lg font-black text-slate-900">{canal.nome}</h4>
          </div>

          <div className="space-y-4">
            {itens.map((item) => {
              const valor = Number(canal.resumo[item.chave]) || 0
              const largura =
                valor > 0 ? Math.max((valor / maiorValor) * 100, 6) : 0

              return (
                <div key={`${canal.key}-${String(item.chave)}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-700">
                      {item.nome}
                    </span>
                    <span className="whitespace-nowrap text-sm font-black text-slate-900">
                      {formatador(valor)}
                    </span>
                  </div>

                  <div className="h-4 rounded-full bg-slate-200">
                    <div
                      className={`h-4 rounded-full ${item.classe}`}
                      style={{ width: `${largura}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}