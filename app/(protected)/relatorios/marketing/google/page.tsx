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

function getMesKeyFromSelect(ano: number, value: string) {
  if (value === 'Todos') return undefined
  return `${ano}-${value}`
}

const ORIGENS_MARKETING = [
  'GOOGLE',
  'EMAIL',
  'E-MAIL',
  'SITE',
  'RECOMPRA',
  'RETORNO',
  'MEGAFLEX',
  'LOJISTA',
  'REVENDA',
  'INDICACAO',
  'PARTICULAR',
  'TELEFONE',
  'ORGANICO',
  'INSTAGRAM',
  'LOJA',
]

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function filtrarLeadsPorOrigens(leads: MarketingLead[], origens: string[]) {
  if (origens.length === 0) return []

  return leads.filter((lead) => {
    const origemLead = normalizeText(lead.tipo_contato)
    return origens.some((origem) => origemLead.includes(origem))
  })
}

function calcularDashboardMarketingPersonalizado(
  leads: MarketingLead[],
  mesKey?: string
) {
  const leadsFiltrados = leads.filter((lead) => {
    if (!mesKey) return true

    const dataBase = lead.data_contato || ''

    return String(dataBase).startsWith(mesKey)
  })

  const isFechado = (status: string | null | undefined) => {
    const s = normalizeText(status)
    return s === 'FECHADO' || s === 'PEDIDO'
  }

  const isAberto = (status: string | null | undefined) => {
    const statusNormalizado = normalizeText(status)
    return (
      statusNormalizado.includes('AGUARDANDO') ||
      statusNormalizado.includes('NEGOCIANDO') ||
      statusNormalizado.includes('ORCAR') ||
      statusNormalizado.includes('ORÇAR')
    )
  }

  const valorOrcamentoLead = (lead: MarketingLead) =>
    Number(lead.valor_orcamento || 0)

  const leadsComOrcamento = leadsFiltrados.filter(
    (lead) => Number(lead.valor_orcamento || 0) > 0
  )

  const pedidos = leadsComOrcamento.filter((lead) => isFechado(lead.status))
  const emAberto = leadsComOrcamento.filter((lead) => isAberto(lead.status))

  const valorOrcamento = leadsComOrcamento.reduce(
    (acc, lead) => acc + valorOrcamentoLead(lead),
    0
  )

  const valorPedidos = pedidos.reduce(
    (acc, lead) => acc + valorOrcamentoLead(lead),
    0
  )

  const valorEmAberto = emAberto.reduce(
    (acc, lead) => acc + valorOrcamentoLead(lead),
    0
  )

  const produtoMap = new Map<
    string,
    {
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
  >()

  leadsFiltrados.forEach((lead) => {
    const produto = lead.produto_interesse || 'Não classificados'

    const atual =
      produtoMap.get(produto) || {
        produto,
        leads: 0,
        orcamentos: 0,
        pedidos: 0,
        txQualificacao: 0,
        txConversao: 0,
        valorOrcamento: 0,
        valorPedidos: 0,
        valorEmAberto: 0,
        orcamentosEmAberto: 0,
      }

    atual.leads += 1

    if (Number(lead.valor_orcamento || 0) > 0) {
      atual.orcamentos += 1
      atual.valorOrcamento += valorOrcamentoLead(lead)
    }

    if (Number(lead.valor_orcamento || 0) > 0 && isFechado(lead.status)) {
      atual.pedidos += 1
      atual.valorPedidos += valorOrcamentoLead(lead)
    }

    if (Number(lead.valor_orcamento || 0) > 0 && isAberto(lead.status)) {
      atual.orcamentosEmAberto += 1
      atual.valorEmAberto += valorOrcamentoLead(lead)
    }

    produtoMap.set(produto, atual)
  })

  const produtos = Array.from(produtoMap.values()).map((item) => ({
    ...item,
    txQualificacao: item.leads > 0 ? (item.orcamentos / item.leads) * 100 : 0,
    txConversao: item.orcamentos > 0 ? (item.pedidos / item.orcamentos) * 100 : 0,
  }))

  const naoClassificados =
    produtos.find((item) => normalizeText(item.produto).includes('NAO CLASSIFICADOS')) || {
      produto: 'Não classificados',
      leads: 0,
      orcamentos: 0,
      pedidos: 0,
      txQualificacao: 0,
      txConversao: 0,
      valorOrcamento: 0,
      valorPedidos: 0,
      valorEmAberto: 0,
      orcamentosEmAberto: 0,
    }

  const conversaoProduto = produtos.filter(
    (item) => !normalizeText(item.produto).includes('NAO CLASSIFICADOS')
  )

  return {
    resumo: {
      leads: leadsFiltrados.length,
      orcamentos: leadsComOrcamento.length,
      pedidos: pedidos.length,
      valorPedidos,
      txQualificacao:
        leadsFiltrados.length > 0
          ? (leadsComOrcamento.length / leadsFiltrados.length) * 100
          : 0,
      txConversao:
        leadsComOrcamento.length > 0
          ? (pedidos.length / leadsComOrcamento.length) * 100
          : 0,
      orcamentosEmAberto: emAberto.length,
      ticketPedidos: pedidos.length > 0 ? valorPedidos / pedidos.length : 0,
      valorOrcamento,
      ticketOrcamento:
        leadsComOrcamento.length > 0 ? valorOrcamento / leadsComOrcamento.length : 0,
      txConversaoValor:
        valorOrcamento > 0 ? (valorPedidos / valorOrcamento) * 100 : 0,
      valorEmAberto,
    },
    conversaoProduto,
    conversaoProdutoNaoClassificados: naoClassificados,
    conversaoProdutoResultado: {
      leads: leadsFiltrados.length,
      orcamentos: leadsComOrcamento.length,
      pedidos: pedidos.length,
      valorOrcamento,
      valorPedidos,
      valorEmAberto,
      orcamentosEmAberto: emAberto.length,
    },
  }
}

async function buscarTodosOsLeads(supabase: ReturnType<typeof createClient>) {
  const limite = 1000
  let inicio = 0
  let todos: MarketingLead[] = []

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('id', { ascending: true })
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

  const vistos = new Set<number>()
  return todos.filter((lead) => {
    if (!lead.id || vistos.has(lead.id)) return false
    vistos.add(lead.id)
    return true
  })
}

export default function MarketingGooglePage() {
  const supabase = useMemo(() => createClient(), [])

  const hoje = new Date()
  const [loading, setLoading] = useState(true)
const [mes, setMes] = useState('Todos')
const [ano, setAno] = useState(hoje.getFullYear())
const [origensSelecionadas, setOrigensSelecionadas] = useState<string[]>([
  'GOOGLE',
  'EMAIL',
  'SITE',
])
const [menuOrigensAberto, setMenuOrigensAberto] = useState(false)
const [dados, setDados] = useState<KpiMarketing | null>(null)
const [graficoQtdProduto, setGraficoQtdProduto] = useState<
  {
    label: string
    leads: number
    orcamentos: number
    pedidos: number
  }[]
>([])
const [graficoValorProduto, setGraficoValorProduto] = useState<
  {
    label: string
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
  }[]
>([])
const [graficoMensal, setGraficoMensal] = useState<
  {
    mes: string
    leads: number
    orcamentos: number
    pedidos: number
  }[]
>([])

  useEffect(() => {
    buscarDados()
  }, [mes, ano, origensSelecionadas])

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
    const mesKey = getMesKeyFromSelect(ano, mes)
    const leadsFiltradosPorOrigem = filtrarLeadsPorOrigens(leads, origensSelecionadas)
    const dashboard = calcularDashboardMarketingPersonalizado(leadsFiltradosPorOrigem, mesKey)

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

const baseProdutos = [
  ...dashboard.conversaoProduto,
  dashboard.conversaoProdutoNaoClassificados,
].filter((item) => item.leads > 0 || item.orcamentos > 0 || item.pedidos > 0)

setGraficoQtdProduto(
  baseProdutos
    .map((item) => ({
      label: item.produto,
      leads: item.leads,
      orcamentos: item.orcamentos,
      pedidos: item.pedidos,
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8)
)

setGraficoValorProduto(
  baseProdutos
    .map((item) => ({
      label: item.produto,
      valorOrcamento: item.valorOrcamento,
      valorPedidos: item.valorPedidos,
      valorEmAberto: item.valorEmAberto,
    }))
    .sort((a, b) => b.valorPedidos - a.valorPedidos)
    .slice(0, 8)
)

setGraficoMensal(
  [
    { mes: 'JAN', num: '01' },
    { mes: 'FEV', num: '02' },
    { mes: 'MAR', num: '03' },
    { mes: 'ABR', num: '04' },
    { mes: 'MAI', num: '05' },
    { mes: 'JUN', num: '06' },
    { mes: 'JUL', num: '07' },
    { mes: 'AGO', num: '08' },
    { mes: 'SET', num: '09' },
    { mes: 'OUT', num: '10' },
    { mes: 'NOV', num: '11' },
    { mes: 'DEZ', num: '12' },
  ].map((item) => {
    const mensal = calcularDashboardMarketingPersonalizado(leadsFiltradosPorOrigem, `${ano}-${item.num}`)
    return {
      mes: item.mes,
      leads: mensal.resumo.leads,
      orcamentos: mensal.resumo.orcamentos,
      pedidos: mensal.resumo.pedidos,
    }
  })
)

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
              Dashboard de Marketing
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Indicadores filtrados pelas origens selecionadas.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[160px_160px_360px] xl:justify-end">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Ano
              </label>
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

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

            <div className="relative">
  <label className="mb-2 block text-sm font-bold text-slate-700">
    Origens consideradas
  </label>

  <button
    type="button"
    onClick={() => setMenuOrigensAberto((prev) => !prev)}
    className="flex h-14 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-left text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
  >
    <span className="truncate">
      {origensSelecionadas.length === 0
        ? 'Nenhuma origem selecionada'
        : origensSelecionadas.length === ORIGENS_MARKETING.length
          ? 'Todas as origens'
          : `${origensSelecionadas.length} origens selecionadas`}
    </span>

    <span className="text-sm text-slate-400">
      {menuOrigensAberto ? '▲' : '▼'}
    </span>
  </button>

  {menuOrigensAberto ? (
    <div className="absolute right-0 z-50 mt-2 w-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOrigensSelecionadas(ORIGENS_MARKETING)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          Marcar todas
        </button>

        <button
          type="button"
          onClick={() => setOrigensSelecionadas([])}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          Limpar
        </button>
      </div>

      <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
        {ORIGENS_MARKETING.map((origem) => {
          const checked = origensSelecionadas.includes(origem)

          return (
            <button
              key={origem}
              type="button"
              onClick={() => {
                if (checked) {
                  setOrigensSelecionadas((prev) =>
                    prev.filter((item) => item !== origem)
                  )
                } else {
                  setOrigensSelecionadas((prev) => [...prev, origem])
                }
              }}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition ${
                checked
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{origem}</span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                  checked
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-transparent'
                }`}
              >
                ✓
              </span>
            </button>
          )
        })}
      </div>
    </div>
  ) : null}
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
  <KpiCard title="Leads" value={String(dados.leads)} classes="bg-orange-50 text-orange-700 border border-orange-100" />
  <KpiCard title="Orçamentos" value={String(dados.orcamentos)} classes="bg-orange-100 text-orange-800 border border-orange-200" />
  <KpiCard title="Pedidos" value={String(dados.pedidos)} classes="bg-green-50 text-green-700 border border-green-100" />
  <KpiCard title="Valor de Pedidos" value={formatCurrency(dados.valorPedidos)} classes="bg-green-100 text-green-800 border border-green-200" />
</div>

<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
  <KpiCard title="Tx. Qualificação" value={`${dados.txQualificacao.toFixed(2)}%`} classes="bg-blue-50 text-blue-700 border border-blue-100" />
  <KpiCard title="Tx. de Conversão" value={`${dados.txConversao.toFixed(2)}%`} classes="bg-blue-100 text-blue-800 border border-blue-200" />
  <KpiCard title="Orçamentos em Aberto" value={String(dados.orcamentosEmAberto)} classes="bg-amber-50 text-amber-700 border border-amber-100" />
  <KpiCard title="Ticket Médio Pedido" value={formatCurrency(dados.ticketPedidos)} classes="bg-green-50 text-green-700 border border-green-100" />
</div>

<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
  <KpiCard title="Valor Orçamento" value={formatCurrency(dados.valorOrcamento)} classes="bg-orange-50 text-orange-700 border border-orange-100" />
  <KpiCard title="Ticket Orçamento" value={formatCurrency(dados.ticketOrcamento)} classes="bg-orange-100 text-orange-800 border border-orange-200" />
  <KpiCard title="Tx de Conversão por Valor" value={`${dados.txConversaoValor.toFixed(2)}%`} classes="bg-blue-50 text-blue-700 border border-blue-100" />
  <KpiCard title="Valor de Orçamentos em Aberto" value={formatCurrency(dados.valorEmAberto)} classes="bg-amber-100 text-amber-800 border border-amber-200" />
</div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-2xl font-black text-slate-900">
                  Conversão por Produto
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Relatório consolidado por grupo de produto, conforme as origens selecionadas.
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
  <ChartCard
    title="Leads, Orçamentos e Pedidos"
    subtitle="Comparativo por produto conforme as origens selecionadas."
  >
    <ProdutoQuantidadeChart items={graficoQtdProduto} />
  </ChartCard>

  <ChartCard
    title="Valor Orçado, Pedidos e Vlr. Aberto"
    subtitle="Comparativo financeiro por produto."
  >
    <ProdutoValorChart items={graficoValorProduto} />
  </ChartCard>
</div>

<ChartCard
  title="Leads, Orçamentos e Pedidos por mês"
  subtitle="Evolução mensal das origens selecionadas."
>
  <MarketingMesChart items={graficoMensal} />
</ChartCard>
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
        <h3 className="text-2xl font-black text-slate-900">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {subtitle}
        </p>
      </div>

      {children}
    </div>
  )
}

function ProdutoQuantidadeChart({
  items,
}: {
  items: {
    label: string
    leads: number
    orcamentos: number
    pedidos: number
  }[]
}) {
  const max = Math.max(
    ...items.flatMap((item) => [item.leads, item.orcamentos, item.pedidos]),
    1
  )

  if (items.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Sem dados para exibir.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-bold text-slate-900">{item.label}</p>

          <MiniMetricBar
            label="Leads"
            value={item.leads}
            max={max}
            valueClass="bg-blue-200"
          />
          <MiniMetricBar
            label="Orçamentos"
            value={item.orcamentos}
            max={max}
            valueClass="bg-cyan-200"
          />
          <MiniMetricBar
            label="Pedidos"
            value={item.pedidos}
            max={max}
            valueClass="bg-emerald-200"
          />
        </div>
      ))}
    </div>
  )
}

function ProdutoValorChart({
  items,
}: {
  items: {
    label: string
    valorOrcamento: number
    valorPedidos: number
    valorEmAberto: number
  }[]
}) {
  const max = Math.max(
    ...items.flatMap((item) => [
      item.valorOrcamento,
      item.valorPedidos,
      item.valorEmAberto,
    ]),
    1
  )

  if (items.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Sem dados para exibir.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-bold text-slate-900">{item.label}</p>

          <MiniMetricBar
            label="Orçado"
            value={item.valorOrcamento}
            max={max}
            valueClass="bg-violet-200"
            formatter={formatCurrency}
          />
          <MiniMetricBar
            label="Pedidos"
            value={item.valorPedidos}
            max={max}
            valueClass="bg-emerald-200"
            formatter={formatCurrency}
          />
          <MiniMetricBar
            label="Em aberto"
            value={item.valorEmAberto}
            max={max}
            valueClass="bg-amber-200"
            formatter={formatCurrency}
          />
        </div>
      ))}
    </div>
  )
}

function MarketingMesChart({
  items,
}: {
  items: {
    mes: string
    leads: number
    orcamentos: number
    pedidos: number
  }[]
}) {
  const max = Math.max(
    ...items.flatMap((item) => [item.leads, item.orcamentos, item.pedidos]),
    1
  )

  if (items.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Sem dados para exibir.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-12 gap-3">
        {items.map((item) => (
          <div key={item.mes} className="flex flex-col items-center">
            <div className="mb-2 flex h-[260px] items-end gap-1 rounded-2xl bg-slate-50 px-2 py-3">
              <div
                className="w-3 rounded-t-md bg-blue-200"
                style={{ height: `${item.leads > 0 ? Math.max((item.leads / max) * 100, 6) : 0}%` }}
                title={`${item.mes} - Leads: ${item.leads}`}
              />
              <div
                className="w-3 rounded-t-md bg-cyan-200"
                style={{ height: `${item.orcamentos > 0 ? Math.max((item.orcamentos / max) * 100, 6) : 0}%` }}
                title={`${item.mes} - Orçamentos: ${item.orcamentos}`}
              />
              <div
                className="w-3 rounded-t-md bg-emerald-200"
                style={{ height: `${item.pedidos > 0 ? Math.max((item.pedidos / max) * 100, 6) : 0}%` }}
                title={`${item.mes} - Pedidos: ${item.pedidos}`}
              />
            </div>

            <p className="text-xs font-bold text-slate-600">{item.mes}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-200" />
          Leads
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-cyan-200" />
          Orçamentos
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-200" />
          Pedidos
        </div>
      </div>
    </div>
  )
}

function MiniMetricBar({
  label,
  value,
  max,
  valueClass,
  formatter,
}: {
  label: string
  value: number
  max: number
  valueClass: string
  formatter?: (value: number) => string
}) {
  const width = value > 0 ? Math.max((value / max) * 100, 4) : 0

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
        <span>{label}</span>
        <span>{formatter ? formatter(value) : value}</span>
      </div>

      <div className="h-3 rounded-full bg-white">
        <div
          className={`h-3 rounded-full ${valueClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
