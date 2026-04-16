'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import {
  calcularDashboardMarketing,
  type MarketingLead,
} from '@/lib/dashboard/marketing'

type KpiMarketing = {
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
  conversaoProduto: {
    produto: string
    leads: number
    orcamentos: number
    pedidos: number
    txQualificacao: number
    txConversao: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
    orcamentosEmAberto: number
  }[]
  conversaoProdutoNaoClassificados: {
    produto: string
    leads: number
    orcamentos: number
    pedidos: number
    txQualificacao: number
    txConversao: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
    orcamentosEmAberto: number
  }
  conversaoProdutoResultado: {
    leads: number
    orcamentos: number
    pedidos: number
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
    orcamentosEmAberto: number
  }
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function getMesKeyFromSelect(value: string) {
  if (value === 'Todos') return undefined
  return `2026-${value}`
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

    if (error) {
      throw error
    }

    const lote = (data || []) as MarketingLead[]
    todos = [...todos, ...lote]

    if (lote.length < limite) {
      break
    }

    inicio += limite
  }

  return todos
}

export default function MarketingGooglePage() {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState('Todos')
  const [dados, setDados] = useState<KpiMarketing | null>(null)

  useEffect(() => {
    buscarDados()
  }, [mes])

  async function buscarDados() {
    setLoading(true)

    let leads: MarketingLead[] = []

    try {
      leads = await buscarTodosOsLeads(supabase)
    } catch (error) {
      console.error('Erro ao buscar dados de marketing Google:', error)
      setLoading(false)
      return
    }
    const mesKey = getMesKeyFromSelect(mes)
    const dashboard = calcularDashboardMarketing(leads, 'google', mesKey)

    setDados({
      leads: dashboard.resumo.leads,
      orcamentos: dashboard.resumo.orcamentos,
      pedidos: dashboard.resumo.pedidos,
      valorPedidos: dashboard.resumo.valorPedidos,
      txQualificacao: dashboard.resumo.txQualificacao,
      txConversao: dashboard.resumo.txConversao,
      orcamentosEmAberto: dashboard.resumo.orcamentosEmAberto,
      ticketPedidos: dashboard.resumo.ticketPedidos,
      valorOrcamento: dashboard.resumo.valorOrcamento,
      ticketOrcamento: dashboard.resumo.ticketOrcamento,
      txConversaoValor: dashboard.resumo.txConversaoValor,
      valorEmAberto: dashboard.resumo.valorEmAberto,
      conversaoProduto: dashboard.conversaoProduto,
      conversaoProdutoNaoClassificados: dashboard.conversaoProdutoNaoClassificados,
      conversaoProdutoResultado: dashboard.conversaoProdutoResultado,
    })

    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Relatórios de marketing
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Dashboard de Marketing Google
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Indicadores filtrados pelas origens Google, Email e Site.
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
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="Todos">Todos os meses</option>
                <option value="01">Janeiro</option>
                <option value="02">Fevereiro</option>
                <option value="03">Março</option>
                <option value="04">Abril</option>
                <option value="05">Maio</option>
                <option value="06">Junho</option>
                <option value="07">Julho</option>
                <option value="08">Agosto</option>
                <option value="09">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Origem considerada
              </label>
              <input
                value="Google / Email / Site"
                readOnly
                className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-slate-600 outline-none"
              />
            </div>
          </div>
        </div>

        {loading || !dados ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando dashboard de marketing Google...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Leads" value={String(dados.leads)} classes="bg-blue-600 text-white" />
              <KpiCard title="Orçamentos" value={String(dados.orcamentos)} classes="bg-teal-700 text-white" />
              <KpiCard title="Pedidos" value={String(dados.pedidos)} classes="bg-violet-600 text-white" />
              <KpiCard title="Valor de Pedidos" value={formatCurrency(dados.valorPedidos)} classes="bg-orange-500 text-white" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Tx. Qualificação" value={`${dados.txQualificacao.toFixed(2)}%`} classes="bg-slate-700 text-white" />
              <KpiCard title="Tx. de Conversão" value={`${dados.txConversao.toFixed(2)}%`} classes="bg-slate-600 text-white" />
              <KpiCard title="Orçamentos em Aberto" value={String(dados.orcamentosEmAberto)} classes="bg-yellow-600 text-white" />
              <KpiCard title="Ticket Médio Pedido" value={formatCurrency(dados.ticketPedidos)} classes="bg-slate-800 text-white" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Valor Orçamento" value={formatCurrency(dados.valorOrcamento)} classes="bg-red-600 text-white" />
              <KpiCard title="Ticket Orçamento" value={formatCurrency(dados.ticketOrcamento)} classes="bg-indigo-800 text-white" />
              <KpiCard title="Tx de Conversão por Valor" value={`${dados.txConversaoValor.toFixed(2)}%`} classes="bg-slate-700 text-white" />
              <KpiCard title="Valor de Orçamentos em Aberto" value={formatCurrency(dados.valorEmAberto)} classes="bg-pink-700 text-white" />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-2xl font-black text-slate-900">
                  Conversão por Produto
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Relatório consolidado por grupo de produto, filtrado por Google, Email e Site.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-bold">Produto</th>
                      <th className="px-4 py-3 font-bold">Leads</th>
                      <th className="px-4 py-3 font-bold">Orçamentos</th>
                      <th className="px-4 py-3 font-bold">Pedidos</th>
                      <th className="px-4 py-3 font-bold">Tx. Qualificação</th>
                      <th className="px-4 py-3 font-bold">Tx. Conversão</th>
                      <th className="px-4 py-3 font-bold">Valor Orçamento</th>
                      <th className="px-4 py-3 font-bold">Valor Pedidos</th>
                      <th className="px-4 py-3 font-bold">Orç. em Aberto</th>
                      <th className="px-4 py-3 font-bold">Valor em Aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.conversaoProduto.map((item) => (
                      <tr key={item.produto} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-bold text-slate-900">{item.produto}</td>
                        <td className="px-4 py-3">{item.leads}</td>
                        <td className="px-4 py-3">{item.orcamentos}</td>
                        <td className="px-4 py-3">{item.pedidos}</td>
                        <td className="px-4 py-3">{item.txQualificacao.toFixed(2)}%</td>
                        <td className="px-4 py-3">{item.txConversao.toFixed(2)}%</td>
                        <td className="px-4 py-3">{formatCurrency(item.valorOrcamento)}</td>
                        <td className="px-4 py-3">{formatCurrency(item.valorPedidos)}</td>
                        <td className="px-4 py-3">{item.orcamentosEmAberto}</td>
                        <td className="px-4 py-3">{formatCurrency(item.valorEmAberto)}</td>
                      </tr>
                    ))}

                    <tr className="border-t border-slate-200 bg-yellow-50">
                      <td className="px-4 py-3 font-bold text-slate-900">{dados.conversaoProdutoNaoClassificados.produto}</td>
                      <td className="px-4 py-3">{dados.conversaoProdutoNaoClassificados.leads}</td>
                      <td className="px-4 py-3">{dados.conversaoProdutoNaoClassificados.orcamentos}</td>
                      <td className="px-4 py-3">{dados.conversaoProdutoNaoClassificados.pedidos}</td>
                      <td className="px-4 py-3">{dados.conversaoProdutoNaoClassificados.txQualificacao.toFixed(2)}%</td>
                      <td className="px-4 py-3">{dados.conversaoProdutoNaoClassificados.txConversao.toFixed(2)}%</td>
                      <td className="px-4 py-3">{formatCurrency(dados.conversaoProdutoNaoClassificados.valorOrcamento)}</td>
                      <td className="px-4 py-3">{formatCurrency(dados.conversaoProdutoNaoClassificados.valorPedidos)}</td>
                      <td className="px-4 py-3">{dados.conversaoProdutoNaoClassificados.orcamentosEmAberto}</td>
                      <td className="px-4 py-3">{formatCurrency(dados.conversaoProdutoNaoClassificados.valorEmAberto)}</td>
                    </tr>

                    <tr className="border-t-2 border-slate-300 bg-slate-50">
                      <td className="px-4 py-3 font-black text-slate-900">RESULTADO</td>
                      <td className="px-4 py-3 font-bold">{dados.conversaoProdutoResultado.leads}</td>
                      <td className="px-4 py-3 font-bold">{dados.conversaoProdutoResultado.orcamentos}</td>
                      <td className="px-4 py-3 font-bold">{dados.conversaoProdutoResultado.pedidos}</td>
                      <td className="px-4 py-3">-</td>
                      <td className="px-4 py-3">-</td>
                      <td className="px-4 py-3 font-bold">{formatCurrency(dados.conversaoProdutoResultado.valorOrcamento)}</td>
                      <td className="px-4 py-3 font-bold">{formatCurrency(dados.conversaoProdutoResultado.valorPedidos)}</td>
                      <td className="px-4 py-3 font-bold">{dados.conversaoProdutoResultado.orcamentosEmAberto}</td>
                      <td className="px-4 py-3 font-bold">{formatCurrency(dados.conversaoProdutoResultado.valorEmAberto)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ChartPlaceholder
                title="Leads, Orçamentos e Pedidos"
                subtitle="Gráfico por produto será conectado na próxima etapa."
              />
              <ChartPlaceholder
                title="Valor Orçado, Pedidos e Vlr. Aberto"
                subtitle="Gráfico por produto será conectado na próxima etapa."
              />
            </div>

            <ChartPlaceholder
              title="Leads, Orçamentos e Pedidos por mês"
              subtitle="Evolução mensal será conectada na próxima etapa."
            />
          </div>
        )}
      </section>
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

function ChartPlaceholder({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-2xl font-black text-slate-900">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {subtitle}
        </p>
      </div>

      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Área reservada para gráfico
      </div>
    </div>
  )
}
