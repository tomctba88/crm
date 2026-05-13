'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Lead = {
  id: number
  status: string | null
  valor_orcamento: number | null
  valor_frete: number | null
  tipo_contato: string | null
  produto_interesse: string | null
  uf: string | null
  vendedor: string | null
  data_contato: string | null
  data_fechamento: string | null
  created_at: string | null
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const CANAIS_PAGO = new Set(['GOOGLE', 'SITE', 'EMAIL', 'E-MAIL'])
const CANAIS_INSTAGRAM = new Set(['INSTAGRAM'])
const CANAIS_ORGANICO = new Set([
  'RECOMPRA', 'RETORNO', 'INDICACAO', 'INDICACAO/PARTICULAR',
  'PARTICULAR', 'ORGANICO', 'MEGAFLEX', 'LOJISTA', 'REVENDA',
  'LOJISTA/REVENDA', 'TELEFONE',
])

function normalizeText(value: string | null | undefined) {
  return (value || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  if (isFechado(lead.status) && lead.data_fechamento) {
    return getMonthKey(lead.data_fechamento)
  }
  return getMonthKey(lead.data_contato) || getMonthKey(lead.created_at)
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
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function isFechado(status: string | null | undefined) {
  const s = normalizeText(status)
  return s === 'FECHADO' || s === 'PEDIDO'
}

function temValor(value: unknown) {
  return parseMoney(value) > 0
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`
}

function getCanalCategoria(tipoContato: string | null | undefined) {
  const s = normalizeText(tipoContato)
  if (CANAIS_PAGO.has(s)) return 'pago'
  if (CANAIS_INSTAGRAM.has(s)) return 'instagram'
  if (CANAIS_ORGANICO.has(s)) return 'organico'
  return 'outros'
}

type CanalMetrica = {
  canal: string
  leads: number
  fechados: number
  conversao: number
  vendido: number
}

type ProdutoMetrica = {
  produto: string
  leads: number
  orcados: number
  txOrcamento: number
  fechados: number
  txConversao: number
  ticketMedio: number
  faturamento: number
}

type VendedorMetrica = {
  vendedor: string
  leads: number
  fechados: number
  conversao: number
  vendido: number
  produtos: { produto: string; fechados: number; faturamento: number }[]
}

type EstadoMetrica = {
  uf: string
  leads: number
  fechamentos: number
  faturamento: number
}

type StatusMetrica = { status: string; count: number }

type DadosMarketing = {
  totalLeads: number
  totalFechados: number
  totalVendido: number
  ticketMedio: number
  totalOrcado: number
  orcadoPago: number
  orcadoOrganico: number
  canalPago: CanalMetrica
  canalInstagram: CanalMetrica
  canalOrganico: CanalMetrica
  canaisPagoDetalhe: CanalMetrica[]
  vendedores: VendedorMetrica[]
  estados: EstadoMetrica[]
  statusResumo: StatusMetrica[]
  produtos: ProdutoMetrica[]
  produtoVolume: { produto: string; leads: number }[]
}

function calcular(leads: Lead[]): DadosMarketing {
  const totalLeads = leads.length
  const fechados = leads.filter((l) => isFechado(l.status))
  const totalFechados = fechados.length
  const totalVendido = fechados.reduce((acc, l) => acc + parseMoney(l.valor_orcamento), 0)
  const ticketMedio = totalFechados > 0 ? totalVendido / totalFechados : 0
  const totalOrcado = leads.filter((l) => temValor(l.valor_orcamento))
    .reduce((acc, l) => acc + parseMoney(l.valor_orcamento), 0)

  // Canais
  const leadsPago = leads.filter((l) => getCanalCategoria(l.tipo_contato) === 'pago')
  const leadsInstagram = leads.filter((l) => getCanalCategoria(l.tipo_contato) === 'instagram')
  const leadsOrganico = leads.filter((l) => getCanalCategoria(l.tipo_contato) === 'organico')

  function metricaCanal(items: Lead[], nome: string): CanalMetrica {
    const f = items.filter((l) => isFechado(l.status))
    const v = f.reduce((acc, l) => acc + parseMoney(l.valor_orcamento), 0)
    return {
      canal: nome,
      leads: items.length,
      fechados: f.length,
      conversao: items.length > 0 ? (f.length / items.length) * 100 : 0,
      vendido: v,
    }
  }

  const canalPago = metricaCanal(leadsPago, 'Tráfego Pago')
  const canalInstagram = metricaCanal(leadsInstagram, 'Instagram')
  const canalOrganico = metricaCanal(leadsOrganico, 'Orgânico')

  const orcadoPago = leadsPago.filter((l) => temValor(l.valor_orcamento))
    .reduce((acc, l) => acc + parseMoney(l.valor_orcamento), 0)
  const orcadoOrganico = leadsOrganico.filter((l) => temValor(l.valor_orcamento))
    .reduce((acc, l) => acc + parseMoney(l.valor_orcamento), 0)

  // Canais pagos em detalhe
  const canaisNomes = ['GOOGLE', 'SITE', 'EMAIL', 'INSTAGRAM']
  const canaisPagoDetalhe: CanalMetrica[] = canaisNomes.map((canal) => {
    const items = leads.filter((l) => normalizeText(l.tipo_contato) === canal)
    return metricaCanal(items, canal.charAt(0) + canal.slice(1).toLowerCase())
  })

  // Vendedores
  const vendedorMap = new Map<string, { leads: Lead[]; prodMap: Map<string, { fechados: number; faturamento: number }> }>()
  for (const lead of leads) {
    const v = (lead.vendedor || 'Não informado').trim() || 'Não informado'
    if (!vendedorMap.has(v)) vendedorMap.set(v, { leads: [], prodMap: new Map() })
    const entry = vendedorMap.get(v)!
    entry.leads.push(lead)
    if (isFechado(lead.status)) {
      const prod = (lead.produto_interesse || 'Não informado').trim() || 'Não informado'
      const pm = entry.prodMap.get(prod) || { fechados: 0, faturamento: 0 }
      pm.fechados += 1
      pm.faturamento += parseMoney(lead.valor_orcamento)
      entry.prodMap.set(prod, pm)
    }
  }

  const vendedores: VendedorMetrica[] = Array.from(vendedorMap.entries()).map(([vendedor, { leads: vLeads, prodMap }]) => {
    const f = vLeads.filter((l) => isFechado(l.status))
    const v = f.reduce((acc, l) => acc + parseMoney(l.valor_orcamento), 0)
    const produtos = Array.from(prodMap.entries())
      .map(([produto, dados]) => ({ produto, ...dados }))
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 5)
    return {
      vendedor,
      leads: vLeads.length,
      fechados: f.length,
      conversao: vLeads.length > 0 ? (f.length / vLeads.length) * 100 : 0,
      vendido: v,
      produtos,
    }
  }).sort((a, b) => b.vendido - a.vendido)

  // Estados
  const estadoMap = new Map<string, EstadoMetrica>()
  for (const lead of leads) {
    const uf = normalizeText(lead.uf) || 'N/I'
    const atual = estadoMap.get(uf) || { uf, leads: 0, fechamentos: 0, faturamento: 0 }
    atual.leads += 1
    if (isFechado(lead.status)) {
      atual.fechamentos += 1
      atual.faturamento += parseMoney(lead.valor_orcamento)
    }
    estadoMap.set(uf, atual)
  }
  const estados = Array.from(estadoMap.values())
    .filter((e) => e.fechamentos > 0)
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 8)

  // Status
  const statusMap = new Map<string, number>()
  for (const lead of leads) {
    const s = lead.status || 'Sem status'
    statusMap.set(s, (statusMap.get(s) || 0) + 1)
  }
  const statusResumo = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)

  // Produtos - tabela completa
  const prodMap2 = new Map<string, { leads: number; orcados: number; fechados: number; faturamento: number }>()
  for (const lead of leads) {
    const prod = (lead.produto_interesse || 'Não informado').trim() || 'Não informado'
    const atual = prodMap2.get(prod) || { leads: 0, orcados: 0, fechados: 0, faturamento: 0 }
    atual.leads += 1
    if (temValor(lead.valor_orcamento)) atual.orcados += 1
    if (isFechado(lead.status)) {
      atual.fechados += 1
      atual.faturamento += parseMoney(lead.valor_orcamento)
    }
    prodMap2.set(prod, atual)
  }

  const produtos: ProdutoMetrica[] = Array.from(prodMap2.entries()).map(([produto, dados]) => ({
    produto,
    leads: dados.leads,
    orcados: dados.orcados,
    txOrcamento: dados.leads > 0 ? (dados.orcados / dados.leads) * 100 : 0,
    fechados: dados.fechados,
    txConversao: dados.orcados > 0 ? (dados.fechados / dados.orcados) * 100 : 0,
    ticketMedio: dados.fechados > 0 ? dados.faturamento / dados.fechados : 0,
    faturamento: dados.faturamento,
  })).sort((a, b) => b.faturamento - a.faturamento)

  const produtoVolume = Array.from(prodMap2.entries())
    .map(([produto, dados]) => ({ produto, leads: dados.leads }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8)

  return {
    totalLeads, totalFechados, totalVendido, ticketMedio,
    totalOrcado, orcadoPago, orcadoOrganico,
    canalPago, canalInstagram, canalOrganico, canaisPagoDetalhe,
    vendedores, estados, statusResumo, produtos, produtoVolume,
  }
}

export default function MarketingResumoPage() {
  const supabase = useMemo(() => createClient(), [])
  const hoje = new Date()

  const [loading, setLoading] = useState(true)
  const [dados, setDados] = useState<DadosMarketing | null>(null)
  const [anoFiltro, setAnoFiltro] = useState(hoje.getFullYear())
  const [mesFiltro, setMesFiltro] = useState(0)
  const [rankingProduto, setRankingProduto] = useState<'txConversao' | 'leads' | 'orcados' | 'fechados' | 'faturamento' | 'ticketMedio'>('txConversao')
  const [produtosExpandido, setProdutosExpandido] = useState(false)

  const anosDisponiveis = useMemo(() => {
    const a = hoje.getFullYear()
    return [a - 1, a, a + 1]
  }, [])

  useEffect(() => {
    buscarDados()
  }, [anoFiltro, mesFiltro])

  async function buscarDados() {
    setLoading(true)
    try {
      const limite = 1000
      let inicio = 0
      let todos: Lead[] = []
      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('id,status,valor_orcamento,valor_frete,tipo_contato,produto_interesse,uf,vendedor,data_contato,data_fechamento,created_at')
          .order('id', { ascending: true })
          .range(inicio, inicio + limite - 1)
        if (error) throw error
        const lote = (data || []) as Lead[]
        todos = [...todos, ...lote]
        if (lote.length < limite) break
        inicio += limite
      }

      const vistos = new Set<number>()
      todos = todos.filter((lead) => {
        if (vistos.has(lead.id)) return false
        vistos.add(lead.id)
        return true
      })

      const filtrados = todos.filter((lead) => {
        const mk = getLeadMonthKey(lead)
        if (!mk) return false
        if (mesFiltro === 0) return mk.startsWith(`${anoFiltro}-`)
        return mk === `${anoFiltro}-${String(mesFiltro).padStart(2, '0')}`
      })

      setDados(calcular(filtrados))
    } catch (err) {
      console.error('Erro ao carregar dados de marketing:', err)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm text-slate-500">
        Carregando relatório de marketing...
      </div>
    )
  }

  if (!dados) return null

  const maxEstado = dados.estados[0]?.faturamento || 1
  const maxProdVol = dados.produtoVolume[0]?.leads || 1
  const maxVendedor = dados.vendedores[0]?.vendido || 1

  return (
    <div className="space-y-6">

      {/* FILTROS */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Relatório de marketing</p>
            <h1 className="text-3xl font-black text-slate-900">Resumo Comercial</h1>
            <p className="mt-1 text-sm text-slate-500">Visão completa de canais, produtos, vendedores e estados.</p>
          </div>
          <div className="flex gap-3">
            <select value={mesFiltro} onChange={(e) => setMesFiltro(Number(e.target.value))}
              className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 outline-none">
              <option value={0}>Todos os meses</option>
              {MESES.map((mes, i) => (
                <option key={mes} value={i + 1}>{mes}</option>
              ))}
            </select>
            <select value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))}
              className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 outline-none">
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>{ano}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* VISÃO GERAL */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Total de leads" value={String(dados.totalLeads)} sub="contatos no mês" accent />
        <KpiCard label="Pedidos fechados" value={String(dados.totalFechados)} sub={`taxa de ${formatPct(dados.totalLeads > 0 ? (dados.totalFechados / dados.totalLeads) * 100 : 0)}`} />
        <KpiCard label="Total vendido" value={formatCurrency(dados.totalVendido)} sub="valor dos pedidos" />
        <KpiCard label="Ticket médio" value={formatCurrency(dados.ticketMedio)} sub="por pedido fechado" />
      </section>

      {/* TRÁFEGO PAGO vs ORGÂNICO */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* PAGO */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Tráfego pago</span>
            <span className="text-xs text-slate-400">Google · Site · Email</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricMini label="Leads" value={String(dados.canalPago.leads)} highlight />
            <MetricMini label="Fechados" value={String(dados.canalPago.fechados)} />
            <MetricMini label="Conversão" value={formatPct(dados.canalPago.conversao)} />
            <MetricMini label="Vendido" value={formatCurrency(dados.canalPago.vendido)} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-2 text-left text-xs font-bold text-slate-400">Canal</th>
                <th className="pb-2 text-right text-xs font-bold text-slate-400">Leads</th>
                <th className="pb-2 text-right text-xs font-bold text-slate-400">Fechados</th>
                <th className="pb-2 text-right text-xs font-bold text-slate-400">Conv.</th>
                <th className="pb-2 text-right text-xs font-bold text-slate-400">Vendido</th>
              </tr>
            </thead>
            <tbody>
              {dados.canaisPagoDetalhe.filter((c) => c.canal !== 'Instagram').map((canal) => (
                <tr key={canal.canal} className="border-b border-slate-50">
                  <td className="py-2 font-medium text-blue-600">{canal.canal}</td>
                  <td className="py-2 text-right text-slate-600">{canal.leads}</td>
                  <td className="py-2 text-right text-slate-600">{canal.fechados}</td>
                  <td className="py-2 text-right font-bold text-slate-900">{formatPct(canal.conversao)}</td>
                  <td className="py-2 text-right text-slate-700">{formatCurrency(canal.vendido)}</td>
                </tr>
              ))}
              {/* Instagram separado */}
              <tr className="border-l-2 border-red-300 bg-red-50/50">
                <td className="py-2 pl-2 font-medium text-red-500">Instagram</td>
                <td className="py-2 text-right text-slate-400">{dados.canalInstagram.leads}</td>
                <td className="py-2 text-right text-slate-400">{dados.canalInstagram.fechados}</td>
                <td className="py-2 text-right font-bold text-red-500">{formatPct(dados.canalInstagram.conversao)}</td>
                <td className="py-2 text-right text-slate-400">{formatCurrency(dados.canalInstagram.vendido)}</td>
              </tr>
            </tbody>
          </table>
          {dados.canalInstagram.leads > 0 && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
              Instagram fora do escopo atual — {dados.canalInstagram.leads} leads com apenas {dados.canalInstagram.fechados} fechamento(s) ({formatPct(dados.canalInstagram.conversao)} de conversão).
            </div>
          )}
        </div>

        {/* ORGÂNICO */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">Orgânico</span>
            <span className="text-xs text-slate-400">Recompra · Retorno · Indicação</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricMini label="Leads" value={String(dados.canalOrganico.leads)} highlight green />
            <MetricMini label="Fechados" value={String(dados.canalOrganico.fechados)} />
            <MetricMini label="Conversão" value={formatPct(dados.canalOrganico.conversao)} />
            <MetricMini label="Vendido" value={formatCurrency(dados.canalOrganico.vendido)} />
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 leading-relaxed">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Insight</p>
            Orgânico representa{' '}
            <span className="font-bold text-green-700">
              {formatPct(dados.totalLeads > 0 ? (dados.canalOrganico.leads / dados.totalLeads) * 100 : 0)}
            </span>{' '}
            dos leads mas gera{' '}
            <span className="font-bold text-green-700">{formatCurrency(dados.canalOrganico.vendido)}</span>{' '}
            em vendas — conversão{' '}
            {dados.canalPago.conversao > 0
              ? `${(dados.canalOrganico.conversao / dados.canalPago.conversao).toFixed(1)}x maior que o tráfego pago.`
              : 'superior ao tráfego pago.'}
          </div>
        </div>
      </section>

      {/* VOLUME ORÇADO */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OrcCard label="Total orçado no mês" value={formatCurrency(dados.totalOrcado)} sub="soma de todos os orçamentos" pct={100} color="blue" />
        <OrcCard label="Orçado via tráfego pago" value={formatCurrency(dados.orcadoPago)}
          sub={`${formatPct(dados.totalOrcado > 0 ? (dados.orcadoPago / dados.totalOrcado) * 100 : 0)} do volume total`}
          pct={dados.totalOrcado > 0 ? (dados.orcadoPago / dados.totalOrcado) * 100 : 0} color="blue" />
        <OrcCard label="Orçado via orgânico" value={formatCurrency(dados.orcadoOrganico)}
          sub={`${formatPct(dados.totalOrcado > 0 ? (dados.orcadoOrganico / dados.totalOrcado) * 100 : 0)} do volume total`}
          pct={dados.totalOrcado > 0 ? (dados.orcadoOrganico / dados.totalOrcado) * 100 : 0} color="green" />
      </section>

      {/* VENDEDORES + TOP ESTADOS */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* VENDEDORES */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-slate-900">Performance por vendedor</h2>
          <div className="space-y-4">
            {dados.vendedores.map((v) => (
              <div key={v.vendedor} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{v.vendedor}</span>
                  <span className="font-black text-slate-900">{formatCurrency(v.vendido)}</span>
                </div>
                <p className="text-xs text-slate-400">{v.leads} leads · {v.fechados} fechados · {formatPct(v.conversao)} conversão</p>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-blue-600 transition-all"
                    style={{ width: `${maxVendedor > 0 ? Math.max((v.vendido / maxVendedor) * 100, 4) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ESTADOS */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-slate-900">Top estados por venda</h2>
          <div className="space-y-3">
            {dados.estados.map((e, i) => (
              <div key={e.uf} className="flex items-center gap-3">
                <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                <span className="w-10 font-bold text-slate-700">{e.uf}</span>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.max((e.faturamento / maxEstado) * 100, 4)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{e.fechamentos} fechamentos · {e.leads} leads</p>
                </div>
                <span className="whitespace-nowrap font-black text-slate-900">{formatCurrency(e.faturamento)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATUS + VOLUME POR PRODUTO */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* STATUS */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-slate-900">Status dos leads</h2>
          <div className="grid grid-cols-2 gap-3">
            {dados.statusResumo.map((s) => {
              const cor =
                isFechado(s.status) ? 'bg-emerald-50 text-emerald-700'
                : normalizeText(s.status) === 'CANCELADO' ? 'bg-red-50 text-red-600'
                : normalizeText(s.status) === 'DESQUALIFICADO' ? 'bg-slate-100 text-slate-500'
                : normalizeText(s.status).includes('AGUARD') ? 'bg-amber-50 text-amber-700'
                : normalizeText(s.status).includes('NEGOC') ? 'bg-blue-50 text-blue-700'
                : 'bg-slate-50 text-slate-600'
              return (
                <div key={s.status} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${cor}`}>
                  <span className="text-xs font-bold">{s.status}</span>
                  <span className="text-2xl font-black">{s.count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* VOLUME POR PRODUTO */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-black text-slate-900">Volume por produto</h2>
          <div className="space-y-3">
            {dados.produtoVolume.map((p) => (
              <div key={p.produto} className="flex items-center gap-3">
                <span className="w-40 truncate text-sm text-slate-600" title={p.produto}>{p.produto}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.max((p.leads / maxProdVol) * 100, 4)}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-bold text-slate-700">{p.leads}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TABELA COMPLETA POR PRODUTO */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-slate-900">Conversão por produto</h2>
          <select
            value={rankingProduto}
            onChange={(e) => setRankingProduto(e.target.value as typeof rankingProduto)}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="txConversao">Maior conversão</option>
            <option value="leads">Mais leads</option>
            <option value="orcados">Mais orçamentos</option>
            <option value="fechados">Mais pedidos</option>
            <option value="faturamento">Maior faturamento</option>
            <option value="ticketMedio">Maior ticket médio</option>
          </select>
        </div>

        {(() => {
          const ordenado = [...dados.produtos].sort((a, b) => b[rankingProduto] - a[rankingProduto])
          const exibidos = produtosExpandido ? ordenado : ordenado.slice(0, 5)

          return (
            <>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[900px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold">#</th>
                      <th className="px-4 py-3 font-bold">Produto</th>
                      <th className="px-4 py-3 text-right font-bold">Leads</th>
                      <th className="px-4 py-3 text-right font-bold">Orçados</th>
                      <th className="px-4 py-3 text-right font-bold">Tx. orç.</th>
                      <th className="px-4 py-3 text-right font-bold">Pedidos</th>
                      <th className="px-4 py-3 text-right font-bold">Tx. conv.</th>
                      <th className="px-4 py-3 text-right font-bold">Ticket médio</th>
                      <th className="px-4 py-3 text-right font-bold">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exibidos.map((p, i) => {
                      const corConv =
                        p.txConversao >= 40 ? 'text-emerald-700 font-black'
                        : p.txConversao >= 15 ? 'text-slate-900 font-bold'
                        : p.txConversao > 0 ? 'text-amber-700 font-bold'
                        : 'text-red-500 font-bold'
                      const destaque = rankingProduto !== 'txConversao'
                        ? 'bg-blue-50 font-black text-blue-700'
                        : corConv
                      return (
                        <tr key={p.produto} className={`border-t border-slate-100 hover:bg-slate-50 ${i === 0 ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-4 py-3 text-xs font-bold text-slate-400">{i + 1}º</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{p.produto}</td>
                          <td className={`px-4 py-3 text-right ${rankingProduto === 'leads' ? destaque : 'text-slate-600'}`}>{p.leads}</td>
                          <td className={`px-4 py-3 text-right ${rankingProduto === 'orcados' ? destaque : 'text-slate-600'}`}>{p.orcados}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{formatPct(p.txOrcamento)}</td>
                          <td className={`px-4 py-3 text-right ${rankingProduto === 'fechados' ? destaque : 'text-slate-600'}`}>{p.fechados}</td>
                          <td className={`px-4 py-3 text-right ${rankingProduto === 'txConversao' ? corConv : 'text-slate-600'}`}>{formatPct(p.txConversao)}</td>
                          <td className={`px-4 py-3 text-right ${rankingProduto === 'ticketMedio' ? destaque : 'text-slate-700'}`}>{p.fechados > 0 ? formatCurrency(p.ticketMedio) : '—'}</td>
                          <td className={`px-4 py-3 text-right ${rankingProduto === 'faturamento' ? destaque : 'font-black text-slate-900'}`}>{p.faturamento > 0 ? formatCurrency(p.faturamento) : 'R$ 0'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {dados.produtos.length > 5 && (
                <button
                  type="button"
                  onClick={() => setProdutosExpandido((v) => !v)}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
                >
                  {produtosExpandido
                    ? 'Mostrar menos'
                    : `Ver todos os ${dados.produtos.length} produtos`}
                </button>
              )}
            </>
          )
        })()}
      </section>

      {/* PRODUTOS POR VENDEDOR */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-black text-slate-900">Produtos por vendedor</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {dados.vendedores.filter((v) => v.fechados > 0).map((v) => {
            const maxFat = v.produtos[0]?.faturamento || 1
            return (
              <div key={v.vendedor} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-sm font-black text-blue-700">{v.vendedor}</p>
                <div className="space-y-2">
                  {v.produtos.map((p) => (
                    <div key={p.produto} className="flex items-center gap-2">
                      <span className="w-28 truncate text-xs text-slate-500" title={p.produto}>{p.produto}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200">
                        <div className="h-1.5 rounded-full bg-blue-500"
                          style={{ width: `${Math.max((p.faturamento / maxFat) * 100, 4)}%` }} />
                      </div>
                      <span className="w-5 text-right text-xs text-slate-500">{p.fechados}</span>
                      <span className="w-24 text-right text-xs font-bold text-slate-700">{formatCurrency(p.faturamento)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

    </div>
  )
}

function KpiCard({ label, value, sub, accent, green }: { label: string; value: string; sub: string; accent?: boolean; green?: boolean }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-black leading-tight ${accent ? 'text-blue-600' : green ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  )
}

function MetricMini({ label, value, highlight, green }: { label: string; value: string; highlight?: boolean; green?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-black ${highlight && green ? 'text-emerald-600' : highlight ? 'text-blue-600' : 'text-slate-700'}`}>{value}</p>
    </div>
  )
}

function OrcCard({ label, value, sub, pct, color }: { label: string; value: string; sub: string; pct: number; color: 'blue' | 'green' }) {
  const barColor = color === 'green' ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
      <div className="mt-3 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  )
}
