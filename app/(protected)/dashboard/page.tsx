'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Lead = {
  id: number
  status: string | null
  valor_orcamento: number | null
  vendedor: string | null
  tipo_contato: string | null
  data_contato: string | null
  data_ultima_movimentacao: string | null
  data_retorno: string | null
  nome_cliente: string
}

type ItemGrafico = {
  nome: string
  total: number
  valor?: number
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateTimeBR(value: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function toDateOnlyString(date: Date) {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function addDays(date: Date, days: number) {
  const nova = new Date(date)
  nova.setDate(nova.getDate() + days)
  return nova
}

async function buscarTodosOsLeads(supabase: ReturnType<typeof createClient>) {
  const limite = 1000
  let inicio = 0
  let todos: Lead[] = []

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .range(inicio, inicio + limite - 1)

    if (error) {
      throw error
    }

    const lote = (data || []) as Lead[]
    todos = [...todos, ...lote]

    if (lote.length < limite) {
      break
    }

    inicio += limite
  }

  return todos
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [totalLeads, setTotalLeads] = useState(0)
  const [emAtendimento, setEmAtendimento] = useState(0)
  const [propostasEnviadas, setPropostasEnviadas] = useState(0)
  const [vendasFechadas, setVendasFechadas] = useState(0)
  const [valorFechado, setValorFechado] = useState(0)
  const [origens, setOrigens] = useState<{ nome: string; total: number }[]>([])
  const [vendedores, setVendedores] = useState<{ nome: string; total: number }[]>([])
  const [movimentadosRecentes, setMovimentadosRecentes] = useState<Lead[]>([])
  const [tarefasAtrasadas, setTarefasAtrasadas] = useState(0)
  const [tarefasHoje, setTarefasHoje] = useState(0)
  const [tarefasAmanha, setTarefasAmanha] = useState(0)
  const [taxaConversao, setTaxaConversao] = useState(0)
  const [ticketMedio, setTicketMedio] = useState(0)
  const [leadsComRetorno, setLeadsComRetorno] = useState(0)
  const [statusResumo, setStatusResumo] = useState<ItemGrafico[]>([])
  const [leadsPorMes, setLeadsPorMes] = useState<ItemGrafico[]>([])
  const [vendedoresFechamento, setVendedoresFechamento] = useState<ItemGrafico[]>([])

  useEffect(() => {
    buscarDados()
  }, [])

  async function buscarDados() {
    setLoading(true)

    let leads: Lead[] = []

    try {
      leads = await buscarTodosOsLeads(supabase)
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error)
      setLoading(false)
      return
    }

    setTotalLeads(leads.length)

    const atendimento = leads.filter(
      (lead) =>
        lead.status === 'AGUARDANDO' ||
        lead.status === 'NEGOCIANDO'
    ).length
    setEmAtendimento(atendimento)

    const propostas = leads.filter(
      (lead) => lead.status === 'ORÇAR'
    ).length
    setPropostasEnviadas(propostas)

    const fechados = leads.filter(
      (lead) => lead.status === 'FECHADO'
    )
    setVendasFechadas(fechados.length)

    const totalFechado = fechados.reduce(
      (acc, lead) => acc + (lead.valor_orcamento || 0),
      0
    )
    setValorFechado(totalFechado)

    const conversao = leads.length > 0 ? (fechados.length / leads.length) * 100 : 0
    setTaxaConversao(conversao)

    const ticket = fechados.length > 0 ? totalFechado / fechados.length : 0
    setTicketMedio(ticket)

    setLeadsComRetorno(
      leads.filter((lead) => {
        const data = normalizarData(lead.data_retorno)
        return !!data
      }).length
    )

    function normalizarData(value: string | null) {
  if (!value) return null
  return value.slice(0, 10)
}

const hoje = new Date()
hoje.setHours(0, 0, 0, 0)

const hojeStr = toDateOnlyString(hoje)

const amanha = new Date(hoje)
amanha.setDate(amanha.getDate() + 1)

const amanhaStr = toDateOnlyString(amanha)

setTarefasAtrasadas(
  leads.filter((lead) => {
    const data = normalizarData(lead.data_retorno)
    return data && data < hojeStr
  }).length
)

setTarefasHoje(
  leads.filter((lead) => {
    const data = normalizarData(lead.data_retorno)
    return data === hojeStr
  }).length
)

setTarefasAmanha(
  leads.filter((lead) => {
    const data = normalizarData(lead.data_retorno)
    return data === amanhaStr
  }).length
)

    setTarefasAmanha(
      leads.filter(
        (lead) => lead.data_retorno === amanhaStr
      ).length
    )

    const origemMap = new Map<string, number>()
    const vendedorMap = new Map<string, number>()

    for (const lead of leads) {
      const origem = lead.tipo_contato || 'Não informado'
      origemMap.set(origem, (origemMap.get(origem) || 0) + 1)

      const vendedor = lead.vendedor || 'Não informado'
      vendedorMap.set(vendedor, (vendedorMap.get(vendedor) || 0) + 1)
    }

    setOrigens(
      Array.from(origemMap.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    )

    setVendedores(
      Array.from(vendedorMap.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    )

    const statusMap = new Map<string, number>()
    const mesMap = new Map<string, number>()
    const vendedorFechadoMap = new Map<string, { total: number; valor: number }>()

    for (const lead of leads) {
      const status = lead.status || 'Sem status'
      statusMap.set(status, (statusMap.get(status) || 0) + 1)

      const mesBase = lead.data_contato || lead.data_ultima_movimentacao || null
      if (mesBase) {
        const data = new Date(mesBase)
        if (!Number.isNaN(data.getTime())) {
          const chave = data.toLocaleDateString('pt-BR', {
            month: '2-digit',
            year: 'numeric',
          })
          mesMap.set(chave, (mesMap.get(chave) || 0) + 1)
        }
      }

      if (lead.status === 'FECHADO') {
        const vendedor = lead.vendedor || 'Não informado'
        const atual = vendedorFechadoMap.get(vendedor) || { total: 0, valor: 0 }
        atual.total += 1
        atual.valor += lead.valor_orcamento || 0
        vendedorFechadoMap.set(vendedor, atual)
      }
    }

    setStatusResumo(
      Array.from(statusMap.entries())
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total)
    )

    setLeadsPorMes(
      Array.from(mesMap.entries())
        .map(([nome, total]) => ({ nome, total }))
        .slice(-6)
    )

    setVendedoresFechamento(
      Array.from(vendedorFechadoMap.entries())
        .map(([nome, dados]) => ({
          nome,
          total: dados.total,
          valor: dados.valor,
        }))
        .sort((a, b) => (b.valor || 0) - (a.valor || 0))
        .slice(0, 5)
    )

    setMovimentadosRecentes(
      [...leads]
        .filter((lead) => lead.data_ultima_movimentacao)
        .sort((a, b) => {
          const aTime = a.data_ultima_movimentacao
            ? new Date(a.data_ultima_movimentacao).getTime()
            : 0
          const bTime = b.data_ultima_movimentacao
            ? new Date(b.data_ultima_movimentacao).getTime()
            : 0
          return bTime - aTime
        })
        .slice(0, 5)
    )

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Visão geral
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Dashboard Operacional
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Resumo geral do CRM com foco operacional e acompanhamento diário.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {loading ? 'Atualizando dados...' : 'Dados carregados do CRM'}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Leads Totais"
          value={String(totalLeads)}
          subtitle={loading ? 'Carregando...' : 'Base geral do CRM'}
        />
        <MetricCard
          title="Em Atendimento"
          value={String(emAtendimento)}
          subtitle={loading ? 'Carregando...' : 'Aguardando + negociando'}
        />
        <MetricCard
          title="Propostas Enviadas"
          value={String(propostasEnviadas)}
          subtitle={loading ? 'Carregando...' : 'Status ORÇAR'}
        />
        <MetricCard
          title="Vendas Fechadas"
          value={String(vendasFechadas)}
          subtitle={loading ? 'Carregando...' : formatCurrency(valorFechado)}
          accent="green"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Taxa de Conversão"
          value={`${taxaConversao.toFixed(1)}%`}
          subtitle={loading ? 'Carregando...' : 'Fechados / total de leads'}
        />
        <MetricCard
          title="Ticket Médio"
          value={formatCurrency(ticketMedio)}
          subtitle={loading ? 'Carregando...' : 'Valor médio por venda fechada'}
        />
        <MetricCard
          title="Leads com Retorno"
          value={String(leadsComRetorno)}
          subtitle={loading ? 'Carregando...' : 'Leads com data de retorno definida'}
        />
        <MetricCard
          title="Valor Fechado"
          value={formatCurrency(valorFechado)}
          subtitle={loading ? 'Carregando...' : 'Total em vendas fechadas'}
          accent="green"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-900">
              Desempenho Comercial
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Resumo operacional com base nos lançamentos dos leads.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoListCard
              title="Origem dos leads"
              emptyText="Sem dados de origem."
              items={origens}
            />
            <InfoListCard
              title="Ranking de vendedores"
              emptyText="Sem dados de vendedores."
              items={vendedores}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-900">
              Alertas Comerciais
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhamento rápido das tarefas e fechamentos.
            </p>
          </div>

          <div className="space-y-4">
            <a href="/tarefas?urgencia=Atrasado" className="block">
              <AlertCard
                color="red"
                text={`${tarefasAtrasadas} tarefa(s) atrasada(s)`}
              />
            </a>

            <a href="/tarefas?urgencia=Hoje" className="block">
              <AlertCard
                color="yellow"
                text={`${tarefasHoje} tarefa(s) para hoje`}
              />
            </a>

            <a href="/tarefas?urgencia=Amanhã" className="block">
              <AlertCard
                color="blue"
                text={`${tarefasAmanha} tarefa(s) para amanhã`}
              />
            </a>

            <AlertCard
              color="green"
              text={`${vendasFechadas} lead(s) fechados`}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <VisualListCard
          title="Funil por status"
          subtitle="Distribuição atual dos leads no CRM."
          items={statusResumo}
          mode="total"
        />

        <VisualListCard
          title="Leads por mês"
          subtitle="Últimos meses com movimentação comercial."
          items={leadsPorMes}
          mode="total"
        />

        <VisualListCard
          title="Vendedores por fechamento"
          subtitle="Ranking por valor fechado."
          items={vendedoresFechamento}
          mode="currency"
        />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-900">
            Últimas movimentações do pipeline
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Leads mais recentemente movidos entre etapas.
          </p>
        </div>

        {movimentadosRecentes.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
            Nenhuma movimentação registrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold">Lead</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Vendedor</th>
                  <th className="px-4 py-3 font-bold">Valor</th>
                  <th className="px-4 py-3 font-bold">Última movimentação</th>
                </tr>
              </thead>
              <tbody>
                {movimentadosRecentes.map((lead) => (
                  <tr key={lead.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {lead.nome_cliente}
                    </td>
                    <td className="px-4 py-3">{lead.status || '-'}</td>
                    <td className="px-4 py-3">{lead.vendedor || '-'}</td>
                    <td className="px-4 py-3">
                      {formatCurrency(lead.valor_orcamento || 0)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTimeBR(lead.data_ultima_movimentacao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  accent = 'default',
}: {
  title: string
  value: string
  subtitle: string
  accent?: 'default' | 'green'
}) {
  const accentClasses =
    accent === 'green'
      ? 'border-green-200 bg-green-50'
      : 'border-slate-200 bg-white'

  return (
    <div className={`min-h-[140px] rounded-[28px] border p-6 shadow-sm ${accentClasses}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="mt-3 break-words text-3xl font-black leading-tight text-slate-900 xl:text-4xl">
        {value}
      </h3>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

function InfoListCard({
  title,
  items,
  emptyText,
}: {
  title: string
  items: { nome: string; total: number }[]
  emptyText: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-lg font-black text-slate-900">{title}</h3>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div
              key={item.nome}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-3"
            >
              <span className="text-sm font-medium text-slate-700">
                {item.nome}
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {item.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function VisualListCard({
  title,
  subtitle,
  items,
  mode = 'total',
}: {
  title: string
  subtitle: string
  items: ItemGrafico[]
  mode?: 'total' | 'currency'
}) {
  const maior = items.length > 0 ? Math.max(...items.map((item) => item.total || 0), 1) : 1

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-xl font-black text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
          Sem dados para exibir.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const largura = `${Math.max((item.total / maior) * 100, 8)}%`

            return (
              <div key={item.nome} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-700">{item.nome}</span>
                  <span className="text-sm font-bold text-slate-900">
                    {mode === 'currency'
                      ? formatCurrency(item.valor || 0)
                      : item.total}
                  </span>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: largura }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AlertCard({
  color,
  text,
}: {
  color: 'red' | 'yellow' | 'blue' | 'green'
  text: string
}) {
  const classes =
    color === 'red'
      ? 'bg-red-50 text-red-700'
      : color === 'yellow'
      ? 'bg-yellow-50 text-yellow-800'
      : color === 'blue'
      ? 'bg-blue-50 text-blue-700'
      : 'bg-green-50 text-green-700'

  return (
    <div className={`rounded-2xl px-4 py-4 text-sm font-bold ${classes}`}>
      {text}
    </div>
  )
}