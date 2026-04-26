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
  data_retorno?: string | null
  created_at?: string | null
}

type VendedorItem = {
  vendedor: string
  leads: number
  orcamentos: number
  vendas: number
  valorVendido: number
  valorOrcado: number
  ticketMedio: number
  conversao: number
  perdidos: number
  valorPerdido: number
  meta: number
  faltaMeta: number
  atingimentoMeta: number
  participacao: number
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

function getLeadMonthKey(lead: Lead) {
  return (
    getMonthKey(lead.data_contato) ||
    getMonthKey(lead.data_retorno) ||
    getMonthKey(lead.created_at)
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
        .range(inicio, inicio + limite - 1)

      if (error) throw error

      const lote = (data || []) as Lead[]
      todos = [...todos, ...lote]

      if (lote.length < limite) break
      inicio += limite
    }

    return todos
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

      const leadsFiltrados = leadsData.filter((lead) => {
        const vendedorAtual = (lead.vendedor || '').trim()
        const mesLead = getLeadMonthKey(lead)

        const bateVendedor =
          vendedorFiltro === 'TODOS' || vendedorAtual === vendedorFiltro

        const bateMes =
          mesFiltro === 0
            ? mesLead
              ? mesLead.startsWith(`${anoFiltro}-`)
              : true
            : mesLead
              ? mesLead === `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`
              : true

        return bateVendedor && bateMes
      })

      const totalVendidoGeral = leadsFiltrados
        .filter((lead) => temValorOrcamento(lead.valor_orcamento) && isPedido(lead.status))
        .reduce(
          (acc, lead) => acc + parseMoney(lead.valor_orcamento) + parseMoney(lead.valor_frete),
          0
        )

      const rankingMap = new Map<string, VendedorItem>()

      leadsFiltrados.forEach((lead) => {
        const vendedor = (lead.vendedor || 'Não informado').trim() || 'Não informado'

        const atual = rankingMap.get(vendedor) || {
          vendedor,
          leads: 0,
          orcamentos: 0,
          vendas: 0,
          valorVendido: 0,
          valorOrcado: 0,
          ticketMedio: 0,
          conversao: 0,
          perdidos: 0,
          valorPerdido: 0,
          meta: META_MENSAL_VENDEDOR * (mesFiltro === 0 ? 12 : 1),
          faltaMeta: 0,
          atingimentoMeta: 0,
          participacao: 0,
        }

        atual.leads += 1

        if (temValorOrcamento(lead.valor_orcamento)) {
          atual.orcamentos += 1
          atual.valorOrcado += parseMoney(lead.valor_orcamento) + parseMoney(lead.valor_frete)
        }

        if (temValorOrcamento(lead.valor_orcamento) && isPedido(lead.status)) {
          atual.vendas += 1
          atual.valorVendido += parseMoney(lead.valor_orcamento) + parseMoney(lead.valor_frete)
        }

        if (isCancelado(lead.status)) {
          atual.perdidos += 1
          atual.valorPerdido += parseMoney(lead.valor_orcamento)
        }

        rankingMap.set(vendedor, atual)
      })

      const rankingFinal = Array.from(rankingMap.values())
        .map((item) => ({
          ...item,
          ticketMedio: item.vendas > 0 ? item.valorVendido / item.vendas : 0,
          conversao: item.orcamentos > 0 ? (item.vendas / item.orcamentos) * 100 : 0,
          faltaMeta: Math.max(item.meta - item.valorVendido, 0),
          atingimentoMeta: item.meta > 0 ? (item.valorVendido / item.meta) * 100 : 0,
          participacao:
            totalVendidoGeral > 0 ? (item.valorVendido / totalVendidoGeral) * 100 : 0,
        }))
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        <h2 className="mb-4 text-2xl font-black text-slate-900">
          Tabela detalhada
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-bold">Vendedor</th>
                <th className="px-4 py-3 text-right font-bold">Valor vendido</th>
                <th className="px-4 py-3 text-right font-bold">Meta</th>
                <th className="px-4 py-3 text-right font-bold">Falta meta</th>
                <th className="px-4 py-3 text-right font-bold">% Meta</th>
                <th className="px-4 py-3 text-right font-bold">Vendas</th>
                <th className="px-4 py-3 text-right font-bold">Ticket médio</th>
                <th className="px-4 py-3 text-right font-bold">Leads</th>
                <th className="px-4 py-3 text-right font-bold">Orçamentos</th>
                <th className="px-4 py-3 text-right font-bold">Conversão</th>
                <th className="px-4 py-3 text-right font-bold">Perdidos</th>
                <th className="px-4 py-3 text-right font-bold">Valor perdido</th>
                <th className="px-4 py-3 text-right font-bold">% Faturamento</th>
              </tr>
            </thead>

            <tbody>
              {ranking.map((item) => (
                <tr key={item.vendedor} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-black text-slate-900">{item.vendedor}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(item.valorVendido)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.meta)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.faltaMeta)}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.atingimentoMeta.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right">{item.vendas}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.ticketMedio)}</td>
                  <td className="px-4 py-3 text-right">{item.leads}</td>
                  <td className="px-4 py-3 text-right">{item.orcamentos}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.conversao.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right">{item.perdidos}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.valorPerdido)}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.participacao.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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