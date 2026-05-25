'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Lead = {
  id: number
  status: string | null
  valor_orcamento: number | string | null
  valor_frete?: number | string | null
  vendedor: string | null
  tipo_contato?: string | null
  data_contato: string | null
  data_fechamento?: string | null
  data_cancelamento?: string | null
  data_finalizacao?: string | null
  data_retorno?: string | null
  created_at?: string | null
}

type VendedorItem = {
  vendedor: string
  leads: number
  orcamentos: number
  vendas: number
  valorVendido: number
  valorVendidoSemFrete: number
  valorFrete: number
  valorOrcado: number
  ticketMedio: number
  conversao: number
  perdidos: number
  valorPerdido: number
  meta: number
  faltaMeta: number
  atingimentoMeta: number
  participacao: number
  percentualComissao: number
  valorComissao: number
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const META_MENSAL_VENDEDOR = 150000

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  let raw = String(value).trim().replace(/[R$\s]/g, '')
  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')

  if (hasComma && hasDot) raw = raw.replace(/\./g, '').replace(',', '.')
  else if (hasComma && !hasDot) raw = raw.replace(',', '.')

  raw = raw.replace(/[^\d.-]/g, '')

  const number = Number(raw)
  return Number.isFinite(number) ? number : 0
}

function temValorOrcamento(value: unknown) {
  return parseMoney(value) > 0
}

function calcularComissaoVendedor(valorVendido: number) {
  if (valorVendido <= 0) {
    return {
      percentualComissao: 0,
      valorComissao: 0,
    }
  }

  if (valorVendido <= 80000) {
    return {
      percentualComissao: 1,
      valorComissao: valorVendido * 0.01,
    }
  }

  if (valorVendido <= 150000) {
    return {
      percentualComissao: 2,
      valorComissao: valorVendido * 0.02,
    }
  }

  return {
    percentualComissao: 3,
    valorComissao: valorVendido * 0.03,
  }
}

function isPedido(status: string | null | undefined) {
  return normalizeText(status) === 'FECHADO'
}

function isCancelado(status: string | null | undefined) {
  const statusNormalizado = normalizeText(status)
  return statusNormalizado === 'CANCELADO' || statusNormalizado === 'CANCELADA'
}

function getMonthKey(dateString: string | null | undefined) {
  if (!dateString) return ''

  const value = String(dateString).trim()
  if (!value) return ''

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 7)

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [, mes, ano] = value.split('/')
    return `${ano}-${mes}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getContatoMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_contato) ||
    getMonthKey(lead.created_at)
  )
}

function getVendaMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_fechamento) ||
    getMonthKey(lead.data_contato) ||
    getMonthKey(lead.created_at)
  )
}

function getCancelamentoMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_finalizacao) ||
    getMonthKey(lead.data_cancelamento)
  )
}

export default function RelatorioVendedoresPage() {
  const supabase = useMemo(() => createClient(), [])
  const hoje = new Date()

  const [loading, setLoading] = useState(true)
  const [vendedorFiltro, setVendedorFiltro] = useState('TODOS')
  const [mesFiltro, setMesFiltro] = useState(0)
  const [anoFiltro, setAnoFiltro] = useState(hoje.getFullYear())
  const [ordenacao, setOrdenacao] = useState<'valor' | 'conversao' | 'meta' | 'perdidos'>('valor')
  const [vendedores, setVendedores] = useState<string[]>([])
  const [ranking, setRanking] = useState<VendedorItem[]>([])

  useEffect(() => {
    buscarDados()
  }, [vendedorFiltro, mesFiltro, anoFiltro, ordenacao])

  async function buscarTodosOsLeads() {
    const limite = 1000
    let inicio = 0
    let todos: Lead[] = []

    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('id', { ascending: true })
        .range(inicio, inicio + limite - 1)

      if (error) throw error

      const lote = (data || []) as Lead[]
      todos = [...todos, ...lote]

      if (lote.length < limite) break
      inicio += limite
    }

    // Deduplica por ID caso a paginação retorne registros repetidos
    const vistos = new Set<number>()
    return todos.filter((lead) => {
      if (vistos.has(lead.id)) return false
      vistos.add(lead.id)
      return true
    })
  }

  async function buscarDados() {
    setLoading(true)

    try {
      const leadsData = await buscarTodosOsLeads()

      const vendedoresUnicos = Array.from(
        new Set(
          leadsData
            .map((lead) => (lead.vendedor || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b))

      setVendedores(vendedoresUnicos)

      const metaBase = META_MENSAL_VENDEDOR * (mesFiltro === 0 ? 12 : 1)

      function bateMesFn(mesKey: string) {
        if (!mesKey) return false
        return mesFiltro === 0
          ? mesKey.startsWith(`${anoFiltro}-`)
          : mesKey === `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`
      }

      function bateVendedorFn(lead: Lead) {
        const vendedorAtual = (lead.vendedor || '').trim()
        return vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro
      }

      // leads e orcamentos: filtrados pela data de contato
      const leadsFiltrados = leadsData.filter(
        (lead) => bateVendedorFn(lead) && bateMesFn(getContatoMonthKey(lead))
      )

      // vendas fechadas: filtradas pela data de fechamento
      const pedidosFiltrados = leadsData.filter(
        (lead) =>
          bateVendedorFn(lead) &&
          bateMesFn(getVendaMonthKey(lead)) &&
          temValorOrcamento(lead.valor_orcamento) &&
          isPedido(lead.status)
      )

      // perdidos/cancelados: filtrados pela data de encerramento
      const canceladosFiltrados = leadsData.filter(
        (lead) =>
          bateVendedorFn(lead) &&
          bateMesFn(getCancelamentoMonthKey(lead)) &&
          isCancelado(lead.status)
      )

      const totalVendidoGeral = pedidosFiltrados.reduce(
        (acc, lead) =>
          acc + parseMoney(lead.valor_orcamento) - parseMoney(lead.valor_frete),
        0
      )

      const rankingMap = new Map<string, VendedorItem>()

      function getOrInit(vendedor: string): VendedorItem {
        return rankingMap.get(vendedor) || {
          vendedor,
          leads: 0,
          orcamentos: 0,
          vendas: 0,
          valorVendido: 0,
          valorVendidoSemFrete: 0,
          valorFrete: 0,
          valorOrcado: 0,
          ticketMedio: 0,
          conversao: 0,
          perdidos: 0,
          valorPerdido: 0,
          meta: metaBase,
          faltaMeta: 0,
          atingimentoMeta: 0,
          participacao: 0,
          percentualComissao: 0,
          valorComissao: 0,
        }
      }

      leadsFiltrados.forEach((lead) => {
        const vendedor = (lead.vendedor || 'Não informado').trim() || 'Não informado'
        const atual = getOrInit(vendedor)

        atual.leads += 1

        if (temValorOrcamento(lead.valor_orcamento)) {
          atual.orcamentos += 1
          atual.valorOrcado += parseMoney(lead.valor_orcamento)
        }

        rankingMap.set(vendedor, atual)
      })

      pedidosFiltrados.forEach((lead) => {
        const vendedor = (lead.vendedor || 'Não informado').trim() || 'Não informado'
        const atual = getOrInit(vendedor)

        atual.vendas += 1
        atual.valorVendido +=
          parseMoney(lead.valor_orcamento) - parseMoney(lead.valor_frete)
        atual.valorVendidoSemFrete += parseMoney(lead.valor_orcamento)
        atual.valorFrete += parseMoney(lead.valor_frete)

        rankingMap.set(vendedor, atual)
      })

      canceladosFiltrados.forEach((lead) => {
        const vendedor = (lead.vendedor || 'Não informado').trim() || 'Não informado'
        const atual = getOrInit(vendedor)

        atual.perdidos += 1
        atual.valorPerdido += parseMoney(lead.valor_orcamento)

        rankingMap.set(vendedor, atual)
      })

      const rankingFinal = Array.from(rankingMap.values())
  .map((item) => {
    const comissao = calcularComissaoVendedor(item.valorVendido)

    return {
      ...item,
      ticketMedio: item.vendas > 0 ? item.valorVendido / item.vendas : 0,
      conversao: item.orcamentos > 0 ? (item.vendas / item.orcamentos) * 100 : 0,
      faltaMeta: Math.max(item.meta - item.valorVendido, 0),
      atingimentoMeta: item.meta > 0 ? (item.valorVendido / item.meta) * 100 : 0,
      participacao:
        totalVendidoGeral > 0 ? (item.valorVendido / totalVendidoGeral) * 100 : 0,
      percentualComissao: comissao.percentualComissao,
      valorComissao: comissao.valorComissao,
    }
  })
        .sort((a, b) => {
          if (ordenacao === 'valor') return b.valorVendido - a.valorVendido
          if (ordenacao === 'conversao') return b.conversao - a.conversao
          if (ordenacao === 'meta') return b.atingimentoMeta - a.atingimentoMeta
          if (ordenacao === 'perdidos') return b.perdidos - a.perdidos
          return 0
        })

      setRanking(rankingFinal)
    } catch (error) {
      console.error('Erro ao carregar relatório de vendedores:', error)
      setRanking([])
    }

    setLoading(false)
  }

  const anosDisponiveis = useMemo(() => {
    const anoAtual = hoje.getFullYear()
    return [anoAtual - 1, anoAtual, anoAtual + 1]
  }, [hoje])

  const topVendedor = ranking[0]
  const melhorConversao = [...ranking].sort((a, b) => b.conversao - a.conversao)[0]
  const maiorCancelamento = [...ranking].sort((a, b) => b.perdidos - a.perdidos)[0]

  if (loading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        Carregando relatório de vendedores...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">
              Relatório de Vendedores
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ranking comercial, metas, vendas, conversão e perdas por vendedor.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <select
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
              className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-medium"
            >
              <option value="TODOS">Todos os vendedores</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor} value={vendedor}>
                  {vendedor}
                </option>
              ))}
            </select>

            <select
              value={mesFiltro}
              onChange={(e) => setMesFiltro(Number(e.target.value))}
              className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-medium"
            >
              <option value={0}>Todos os meses</option>
              {MESES.map((mes, index) => (
                <option key={mes} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>

            <select
              value={anoFiltro}
              onChange={(e) => setAnoFiltro(Number(e.target.value))}
              className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-medium"
            >
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ResumoCard
            titulo="Top vendedor"
            valor={topVendedor?.vendedor || '-'}
            apoio={topVendedor ? formatCurrency(topVendedor.valorVendido) : 'Sem dados'}
            cor="bg-emerald-50 border-emerald-200"
          />
          <ResumoCard
            titulo="Melhor conversão"
            valor={melhorConversao?.vendedor || '-'}
            apoio={melhorConversao ? `${melhorConversao.conversao.toFixed(2)}%` : 'Sem dados'}
            cor="bg-sky-50 border-sky-200"
          />
          <ResumoCard
            titulo="Maior perda"
            valor={maiorCancelamento?.vendedor || '-'}
            apoio={maiorCancelamento ? `${maiorCancelamento.perdidos} perdido(s)` : 'Sem dados'}
            cor="bg-rose-50 border-rose-200"
          />
          <ResumoCard
            titulo="Maior comissão"
            valor={
            ranking.length > 0
            ? formatCurrency([...ranking].sort((a, b) => b.valorComissao - a.valorComissao)[0].valorComissao)
            : '-'
  }
  apoio={
    ranking.length > 0
      ? [...ranking].sort((a, b) => b.valorComissao - a.valorComissao)[0].vendedor
      : 'Sem dados'
  }
  cor="bg-violet-50 border-violet-200"
/>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              Comparativo entre vendedores
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ordene pelos principais indicadores comerciais.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ['valor', 'Valor'],
              ['conversao', 'Conversão'],
              ['meta', 'Meta'],
              ['perdidos', 'Perdidos'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOrdenacao(key as typeof ordenacao)}
                className={`rounded-full px-4 py-2 text-xs font-bold ${
                  ordenacao === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RankingBarra
            titulo="Valor vendido"
            items={ranking}
            campo="valorVendido"
            formatter={formatCurrency}
            cor="bg-emerald-600"
          />
          <RankingBarra
            titulo="Atingimento da meta"
            items={ranking}
            campo="atingimentoMeta"
            formatter={(v) => `${v.toFixed(2)}%`}
            cor="bg-amber-500"
          />
          <RankingBarra
            titulo="Conversão"
            items={ranking}
            campo="conversao"
            formatter={(v) => `${v.toFixed(2)}%`}
            cor="bg-sky-600"
          />
          <RankingBarra
            titulo="Perdidos"
            items={ranking}
            campo="perdidos"
            formatter={(v) => String(v)}
            cor="bg-rose-500"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
  <div className="mb-5">
    <h2 className="text-2xl font-black text-slate-900">
      Desempenho detalhado por vendedor
    </h2>
    <p className="mt-1 text-sm text-slate-500">
      Indicadores completos de meta, comissão, vendas, conversão, ticket médio e perdas.
    </p>
  </div>

  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
    {ranking.map((item) => (
      <VendedorDetalheCard key={item.vendedor} item={item} />
    ))}
  </div>
</section>
    </div>
  )
}

function VendedorDetalheCard({ item }: { item: VendedorItem }) {
  const metaLimitada = Math.min(item.atingimentoMeta, 100)

  const statusMeta =
    item.atingimentoMeta >= 100
      ? 'Meta batida'
      : item.atingimentoMeta >= 70
        ? 'Próximo da meta'
        : 'Abaixo da meta'

  const corMeta =
    item.atingimentoMeta >= 100
      ? 'bg-emerald-600'
      : item.atingimentoMeta >= 70
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Vendedor
          </p>
          <h3 className="mt-1 text-2xl font-black text-slate-900">
            {item.vendedor}
          </h3>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
            Comissão
          </p>
          <p className="mt-1 text-xl font-black text-violet-900">
            {formatCurrency(item.valorComissao)}
          </p>
          <p className="text-xs font-bold text-violet-700">
            {item.percentualComissao.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-sm font-bold text-slate-700">
            {statusMeta}
          </span>
          <span className="text-sm font-black text-slate-900">
            {item.atingimentoMeta.toFixed(2)}%
          </span>
        </div>

        <div className="h-4 rounded-full bg-slate-200">
          <div
            className={`h-4 rounded-full ${corMeta}`}
            style={{ width: `${Math.max(metaLimitada, 2)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MiniIndicador titulo="Total de faturamento" valor={formatCurrency(item.valorVendidoSemFrete)} destaque />
        <MiniIndicador titulo="Frete" valor={formatCurrency(item.valorFrete)} destaque />
        <MiniIndicador titulo="Total de venda" valor={formatCurrency(item.valorVendido)} destaque />
        <MiniIndicador titulo="Meta" valor={formatCurrency(item.meta)} />
        <MiniIndicador titulo="Falta meta" valor={formatCurrency(item.faltaMeta)} />

        <MiniIndicador titulo="Vendas" valor={String(item.vendas)} />
        <MiniIndicador titulo="Ticket médio" valor={formatCurrency(item.ticketMedio)} />
        <MiniIndicador titulo="% faturamento" valor={`${item.participacao.toFixed(2)}%`} />

        <MiniIndicador titulo="Leads" valor={String(item.leads)} />
        <MiniIndicador titulo="Orçamentos" valor={String(item.orcamentos)} />
        <MiniIndicador titulo="Conversão" valor={`${item.conversao.toFixed(2)}%`} />

        <MiniIndicador titulo="Perdidos" valor={String(item.perdidos)} negativo />
        <MiniIndicador titulo="Valor perdido" valor={formatCurrency(item.valorPerdido)} negativo />
        <MiniIndicador titulo="Valor orçado" valor={formatCurrency(item.valorOrcado)} />
      </div>
    </div>
  )
}

function MiniIndicador({
  titulo,
  valor,
  destaque = false,
  negativo = false,
}: {
  titulo: string
  valor: string
  destaque?: boolean
  negativo?: boolean
}) {
  const tamanho = valor.length

  const tamanhoTexto =
    tamanho <= 8
      ? 'text-2xl'
      : tamanho <= 12
        ? 'text-xl'
        : tamanho <= 16
          ? 'text-lg'
          : 'text-base'

  return (
    <div
      className={`min-w-0 rounded-2xl border px-4 py-5 text-center ${
        destaque
          ? 'border-emerald-200 bg-emerald-50'
          : negativo
            ? 'border-rose-200 bg-rose-50'
            : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {titulo}
      </p>

      <p
        className={`mt-2 whitespace-nowrap font-black leading-tight tracking-tight text-slate-900 ${tamanhoTexto}`}
        title={valor}
      >
        {valor}
      </p>
    </div>
  )
}

function ResumoCard({
  titulo,
  valor,
  apoio,
  cor,
}: {
  titulo: string
  valor: string
  apoio: string
  cor: string
}) {
  return (
    <div className={`rounded-2xl border p-5 ${cor}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {titulo}
      </p>
      <p className="mt-3 truncate text-2xl font-black text-slate-900" title={valor}>
        {valor}
      </p>
      <p className="mt-2 text-sm text-slate-600">{apoio}</p>
    </div>
  )
}

function RankingBarra({
  titulo,
  items,
  campo,
  formatter,
  cor,
}: {
  titulo: string
  items: VendedorItem[]
  campo: keyof VendedorItem
  formatter: (value: number) => string
  cor: string
}) {
  const max = Math.max(...items.map((item) => Number(item[campo]) || 0), 1)

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-black text-slate-900">{titulo}</h3>

      <div className="mt-4 space-y-4">
        {items.map((item) => {
          const value = Number(item[campo]) || 0
          const width = value > 0 ? Math.max((value / max) * 100, 6) : 0

          return (
            <div key={`${titulo}-${item.vendedor}`}>
              <div className="mb-2 flex justify-between gap-3">
                <span className="truncate text-sm font-bold text-slate-700">
                  {item.vendedor}
                </span>
                <span className="whitespace-nowrap text-sm font-black text-slate-900">
                  {formatter(value)}
                </span>
              </div>

              <div className="h-3 rounded-full bg-slate-200">
                <div className={`h-3 rounded-full ${cor}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}