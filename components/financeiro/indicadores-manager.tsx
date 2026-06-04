'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatPct } from '@/lib/financeiro/formatters'

type BalanceteItem = { tipo: string; grupo: string; categoria: string; valor: number }
type VendaItem = {
  cliente: string; cnpj_cpf: string; valor: number; frete: number
  custo: number; valor_lucro: number; percentual_lucro: number; total: number; segmento: string
}
type RecebimentoItem = { valor_recebido: number }

type FiltroTipo = 'mes' | 'trimestre' | 'ano'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - 3 + i).filter(a => a >= 2023)
const MES_ATUAL = new Date().getMonth() + 1

const SEGMENTO_LABEL: Record<string, string> = { corporativo: 'Corporativo', decor: 'Decor', lojista: 'Lojista', outros: 'Outros' }
const SEGMENTO_COR: Record<string, string> = { corporativo: '#1b4fd6', decor: '#16a34a', lojista: '#f59e0b', outros: '#94a3b8' }

type Regime = 'competencia' | 'caixa'

// Mapeamento de grupo Tiny → categoria de resultado
const GRUPO_RESULTADO: Record<string, string> = {}
function getResultadoLabel(grupo: string): string {
  const g = grupo.toLowerCase()
  if (g.includes('custo')) return 'CMV'
  if (g.includes('sócios') || g.includes('socios')) return 'Salários Sócios'
  if (g.includes('financeira')) return 'Despesas Financeiras'
  if (g.includes('operacional')) return 'Despesas Operacionais'
  if (g.includes('trabalhista')) return 'Despesas Trabalhistas'
  if (g.includes('tributária') || g.includes('tributaria')) return 'Despesas Tributárias'
  if (g.includes('imobilizado')) return 'Imobilizado'
  if (g.includes('investimento')) return 'Investimentos'
  if (g.includes('empréstimo') || g.includes('emprestimo')) return 'Empréstimos'
  return 'Sem Grupo'
}

// Ordem dos grupos no DRE
const ORDEM_RESULTADO = [
  'CMV', 'Salários Sócios', 'Despesas Financeiras', 'Despesas Operacionais',
  'Despesas Trabalhistas', 'Despesas Tributárias', 'Imobilizado', 'Investimentos',
  'Empréstimos', 'Sem Grupo',
]

function getMesesAno(tipo: FiltroTipo, ano: number, mes: number): number[] {
  if (tipo === 'mes') return [mes]
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3); const ini = (q - 1) * 3 + 1
    return [ini, ini + 1, ini + 2]
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
}

export default function IndicadoresManager() {
  const [balancete, setBalancete] = useState<BalanceteItem[]>([])
  const [vendasImport, setVendasImport] = useState<VendaItem[]>([])
  const [recebimentosImport, setRecebimentosImport] = useState<RecebimentoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [regime, setRegime] = useState<Regime>('competencia')
  const [filtro, setFiltro] = useState<FiltroTipo>('mes')
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mes, setMes] = useState(MES_ATUAL)
  const [filtroBusca, setFiltroBusca] = useState('')
  const [paginaClientes, setPaginaClientes] = useState(1)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const supabase = createClient()

  const carregar = useCallback(async () => {
    setLoading(true)
    const meses = getMesesAno(filtro, ano, mes)
    const [{ data: bal }, { data: vd }, { data: rec }] = await Promise.all([
      supabase.from('fin_balancete').select('tipo,grupo,categoria,valor').eq('ano', ano).in('mes', meses),
      supabase.from('fin_vendas_import').select('cliente,cnpj_cpf,valor,frete,custo,valor_lucro,percentual_lucro,total,segmento').eq('ano', ano).in('mes', meses),
      supabase.from('fin_recebimentos_import').select('valor_recebido').eq('ano', ano).in('mes', meses),
    ])
    setBalancete((bal ?? []) as BalanceteItem[])
    setVendasImport((vd ?? []) as VendaItem[])
    setRecebimentosImport((rec ?? []) as RecebimentoItem[])
    setPaginaClientes(1)
    setLoading(false)
  }, [filtro, ano, mes])

  useEffect(() => { carregar() }, [carregar])

  const dados = useMemo(() => {
    const bal = balancete
    const vd = vendasImport

    // ── FATURAMENTO ──
    const totalVendas = vd.reduce((s, v) => s + v.valor, 0)
    const fretesCobrados = vd.reduce((s, v) => s + v.frete, 0)
    // Pedidos e ticket médio usam a mesma fonte do faturamento (relatório de Vendas)
    // para que o ticket médio seja matematicamente coerente com o Total Vendas.
    const numPedidos = vd.length
    const ticketMedio = numPedidos > 0 ? totalVendas / numPedidos : 0
    const lucroBrutoVendas = vd.reduce((s, v) => s + v.valor_lucro, 0)
    const margemBruta = totalVendas > 0 ? (lucroBrutoVendas / totalVendas) * 100 : 0
    const temSegmento = vd.some(v => v.segmento && v.segmento !== 'outros')

    // ── SEGMENTOS ──
    const segmentos = ['corporativo', 'decor', 'lojista'].map(seg => {
      const vdSeg = vd.filter(v => v.segmento === seg)
      const total = vdSeg.reduce((s, v) => s + v.valor, 0)
      const lucro = vdSeg.reduce((s, v) => s + v.valor_lucro, 0)
      const margem = total > 0 ? (lucro / total) * 100 : 0
      return { segmento: seg, label: SEGMENTO_LABEL[seg], total, lucro, margem, cor: SEGMENTO_COR[seg] }
    }).filter(s => s.total > 0)

    // ── BALANCETE: agrupado por grupo/categoria ──
    const totalEntradas = bal.filter(b => b.tipo === 'entrada').reduce((s, b) => s + b.valor, 0)
    const gruposMap: Record<string, { categorias: Record<string, number>; total: number; isCusto: boolean }> = {}
    for (const b of bal.filter(b => b.tipo === 'saida')) {
      const g = b.grupo || 'Sem grupo'
      if (!gruposMap[g]) gruposMap[g] = { categorias: {}, total: 0, isCusto: g.toLowerCase().includes('custo') }
      const cat = b.categoria || 'Sem categoria'
      gruposMap[g].categorias[cat] = (gruposMap[g].categorias[cat] || 0) + b.valor
      gruposMap[g].total += b.valor
    }

    // ── RESULTADO DO MÊS: agrupa grupos no painel de resultado ──
    const resultadoAgrupado: Record<string, number> = {}
    for (const [g, v] of Object.entries(gruposMap)) {
      const label = getResultadoLabel(g)
      resultadoAgrupado[label] = (resultadoAgrupado[label] || 0) + v.total
    }
    const totalSaidas = Object.values(gruposMap).reduce((s, v) => s + v.total, 0)
    const cmvBalancete = resultadoAgrupado['CMV'] || 0 // compras pagas no mês (caixa)
    const cmvVendas = vd.reduce((s, v) => s + v.custo, 0) // custo dos produtos vendidos (competência)

    // ── REGIME: alterna entre Competência e Caixa ──
    // Competência: receita = vendas faturadas; CMV = custo do que foi vendido
    // Caixa: receita = entradas recebidas; CMV = compras efetivamente pagas
    const receita = regime === 'caixa' ? totalEntradas : totalVendas
    const cmvTotal = regime === 'caixa' ? cmvBalancete : cmvVendas
    const lucroBruto = receita - cmvTotal
    const basePercentual = receita || 1

    // Despesas não-CMV (operacionais, trabalhistas, etc.) vêm do balancete em ambos os regimes
    const despesasNaoCMV = totalSaidas - cmvBalancete
    const lucroLiquido = regime === 'caixa'
      ? totalEntradas - totalSaidas
      : totalVendas - cmvVendas - despesasNaoCMV

    // EBIT = Receita - CMV - Despesas Operacionais - Despesas Trabalhistas - Sócios
    const ebit = receita - cmvTotal
      - (resultadoAgrupado['Despesas Operacionais'] || 0)
      - (resultadoAgrupado['Despesas Trabalhistas'] || 0)
      - (resultadoAgrupado['Salários Sócios'] || 0)

    // ── FRETES ──
    const despesasFretes = (gruposMap['DESPESAS OPERACIONAIS']?.categorias['Fretes e Carretos'] || 0)
    const fretePagoEmpresa = Math.max(0, despesasFretes - fretesCobrados)
    const fretesPctFaturamento = totalVendas > 0 ? (fretePagoEmpresa / totalVendas) * 100 : 0

    // ── GRUPOS ORDENADOS para DRE detalhado ──
    const gruposOrdenados = Object.entries(gruposMap).sort(([a], [b]) => {
      const ia = ORDEM_RESULTADO.indexOf(getResultadoLabel(a))
      const ib = ORDEM_RESULTADO.indexOf(getResultadoLabel(b))
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      return a.localeCompare(b)
    })

    // ── CLIENTES ──
    const numClientes = vd.length
    const totalRecebido = recebimentosImport.reduce((s, r) => s + r.valor_recebido, 0)

    void GRUPO_RESULTADO

    return {
      totalVendas, fretesCobrados, numPedidos, ticketMedio,
      lucroBrutoVendas, margemBruta, temSegmento, segmentos,
      totalEntradas, totalSaidas, cmvTotal,
      receita, lucroBruto, basePercentual,
      lucroLiquido, ebit, resultadoAgrupado, gruposMap, gruposOrdenados,
      despesasFretes, fretePagoEmpresa, fretesPctFaturamento,
      numClientes, totalRecebido,
    }
  }, [balancete, vendasImport, recebimentosImport, regime])

  const clientesFiltrados = useMemo(() => {
    let r = [...vendasImport].sort((a, b) => b.valor - a.valor)
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      r = r.filter(v => v.cliente?.toLowerCase().includes(b) || v.cnpj_cpf?.includes(b))
    }
    return r
  }, [vendasImport, filtroBusca])

  const POR_PAGINA = 25
  const totalPaginasClientes = Math.ceil(clientesFiltrados.length / POR_PAGINA)
  const clientesPagina = clientesFiltrados.slice((paginaClientes - 1) * POR_PAGINA, paginaClientes * POR_PAGINA)
  const semDados = !loading && balancete.length === 0 && vendasImport.length === 0

  const periodoLabel = filtro === 'mes' ? `${MESES[mes - 1]}/${ano}`
    : filtro === 'trimestre' ? `T${Math.ceil(mes / 3)}/${ano}` : `${ano}`

  const pct = (v: number, base: number) => base > 0 ? formatPct((v / base) * 100) : '—'

  function toggleExpandido(grupo: string) {
    setExpandidos(prev => {
      const s = new Set(prev)
      s.has(grupo) ? s.delete(grupo) : s.add(grupo)
      return s
    })
  }

  function exportarCSV() {
    const linhas: string[][] = [['Cliente', 'Segmento', 'CNPJ/CPF', 'Faturamento', 'Custo', 'Lucro R$', 'Margem %']]
    clientesFiltrados.forEach(v => linhas.push([
      v.cliente, SEGMENTO_LABEL[v.segmento] || v.segmento, v.cnpj_cpf,
      v.valor.toFixed(2), v.custo.toFixed(2), v.valor_lucro.toFixed(2), v.percentual_lucro.toFixed(1),
    ]))
    const csv = linhas.map(r => r.join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `fechamento-${periodoLabel}.csv`; a.click()
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#0b1733]">Fechamento do Mês</h1>
          <p className="mt-1 text-sm text-slate-500">DRE por Competência ou Caixa · Faturamento por segmento · Custos · Margem por cliente</p>
        </div>
        <Link href="/financeiro/importacao" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition self-start">
          Importar Relatórios
        </Link>
      </div>

      {/* Seletor de Regime */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Regime contábil:</span>
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button onClick={() => setRegime('competencia')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${regime === 'competencia' ? 'bg-[#1b4fd6] text-white shadow' : 'text-slate-600 hover:text-slate-800'}`}>
              Competência
            </button>
            <button onClick={() => setRegime('caixa')}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${regime === 'caixa' ? 'bg-[#1b4fd6] text-white shadow' : 'text-slate-600 hover:text-slate-800'}`}>
              Caixa
            </button>
          </div>
          <p className="text-xs text-slate-400 flex-1 min-w-[200px]">
            {regime === 'competencia'
              ? 'Mostra o que foi vendido e o lucro gerado no mês (independente de quando o dinheiro entra).'
              : 'Mostra o dinheiro que efetivamente entrou e saiu no mês (movimentação real do caixa).'}
          </p>
        </div>
      </div>

      {/* Filtro período */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Período:</span>
          {(['mes', 'trimestre', 'ano'] as FiltroTipo[]).map(t => (
            <button key={t} onClick={() => setFiltro(t)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${filtro === t ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t === 'mes' ? 'Mês' : t === 'trimestre' ? 'Trimestre' : 'Ano'}
            </button>
          ))}
        </div>
        {(filtro === 'mes' || filtro === 'trimestre') && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#0b1733] focus:outline-none">
              {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex flex-wrap gap-1">
              {MESES.map((m, i) => (
                <button key={m} onClick={() => setMes(i + 1)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${mes === i + 1 ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        {filtro === 'ano' && (
          <div className="flex flex-wrap gap-2">
            {ANOS.map(a => (
              <button key={a} onClick={() => setAno(a)}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${ano === a ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {a}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-slate-200" />)}</div>
      ) : semDados ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-black text-slate-400">Nenhum dado importado para {periodoLabel}</p>
          <Link href="/financeiro/importacao" className="mt-4 inline-block rounded-xl bg-[#0b1733] px-6 py-2 text-sm font-bold text-white hover:bg-[#1b4fd6] transition">
            Ir para Importação
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            Base: relatórios Tiny · <span className="font-semibold text-[#1b4fd6]">{periodoLabel}</span>{' · '}
            <Link href="/financeiro/importacao" className="underline">Reimportar</Link>
          </p>

          {/* ═══ BLOCO 1: RESULTADO DO MÊS + FATURAMENTO ═══ */}
          <div className="grid gap-6 xl:grid-cols-2">

            {/* Coluna esquerda: Faturamento por Fonte */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#0b1733]">Faturamento</h2>
                <p className="text-xs text-slate-400">Base: Relatório de Vendas</p>
              </div>

              {/* KPIs rápidos */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Vendas', valor: dados.totalVendas, cor: 'text-[#0b1733]' },
                  { label: 'Pedidos Emitidos', valor: dados.numPedidos, cor: 'text-[#1b4fd6]', isMoney: false },
                  { label: 'Ticket Médio', valor: dados.ticketMedio, cor: 'text-slate-700' },
                  { label: 'Fretes Cobrados', valor: dados.fretesCobrados, cor: 'text-slate-500', sub: pct(dados.fretesCobrados, dados.totalVendas) },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl bg-[#eef3fb] p-3">
                    <p className="text-[10px] font-semibold text-slate-500">{k.label}</p>
                    {k.sub && <p className="text-[9px] text-slate-400">{k.sub}</p>}
                    <p className={`mt-1 text-base font-black ${k.cor}`}>
                      {k.isMoney === false ? k.valor : formatBRL(k.valor as number)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Segmentos */}
              {dados.temSegmento ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Por Fonte de Receita</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[10px] font-semibold text-slate-400">
                        <th className="pb-1.5">Fonte</th>
                        <th className="pb-1.5 text-right">Total</th>
                        <th className="pb-1.5 text-right">Lucro</th>
                        <th className="pb-1.5 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.segmentos.map((s, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-1.5 font-semibold" style={{ color: s.cor }}>{s.label}</td>
                          <td className="py-1.5 text-right font-bold text-[#0b1733]">{formatBRL(s.total)}</td>
                          <td className="py-1.5 text-right text-green-700">{formatBRL(s.lucro)}</td>
                          <td className={`py-1.5 text-right font-black text-sm ${s.margem < 25 ? 'text-red-600' : s.margem < 35 ? 'text-orange-500' : 'text-green-700'}`}>{s.margem.toFixed(2)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300 font-black bg-[#eef3fb]">
                        <td className="py-1.5 text-[#0b1733]">Total</td>
                        <td className="py-1.5 text-right text-[#0b1733]">{formatBRL(dados.totalVendas)}</td>
                        <td className="py-1.5 text-right text-green-700">{formatBRL(dados.lucroBrutoVendas)}</td>
                        <td className={`py-1.5 text-right text-sm ${dados.margemBruta < 25 ? 'text-red-600' : dados.margemBruta < 35 ? 'text-orange-500' : 'text-green-700'}`}>{dados.margemBruta.toFixed(2)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center">
                  <p className="text-xs text-slate-400">Para ver Corporativo / Decor / Lojista, exporte o Relatório de Vendas com a coluna <strong>Fonte de Receita</strong> do Tiny.</p>
                </div>
              )}

              {/* Fretes */}
              {dados.despesasFretes > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Fretes</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {[
                        { label: 'Receita Fretes (cobrado)', valor: dados.fretesCobrados, cor: 'text-green-600' },
                        { label: 'Despesas Fretes (Tiny)', valor: dados.despesasFretes, cor: 'text-red-500' },
                        { label: 'Frete pago pela empresa', valor: dados.fretePagoEmpresa, cor: 'text-orange-600' },
                      ].map(r => (
                        <tr key={r.label} className="border-b border-slate-50">
                          <td className="py-1 text-slate-600">{r.label}</td>
                          <td className={`py-1 text-right font-semibold ${r.cor}`}>{formatBRL(r.valor)}</td>
                          <td className="py-1 text-right text-slate-400">{pct(r.valor, dados.totalVendas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Coluna direita: Resultado do Mês */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-black text-[#0b1733]">Resultado do Mês</h2>
                <p className="text-xs text-slate-400">
                  {regime === 'competencia'
                    ? 'Competência: receita = vendas faturadas · CMV = custo do que foi vendido'
                    : 'Caixa: receita = entradas recebidas · CMV = compras pagas (Balancete Tiny)'}
                  {' · '}{periodoLabel}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-semibold text-slate-400">
                    <th className="pb-1.5 text-left">Descrição</th>
                    <th className="pb-1.5 text-right">Valor</th>
                    <th className="pb-1.5 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr className="bg-[#eef3fb] font-black">
                    <td className="py-2 text-[#0b1733]">{regime === 'competencia' ? 'Total Vendas (faturado)' : 'Total Entradas (recebido)'}</td>
                    <td className="py-2 text-right text-[#0b1733]">{formatBRL(dados.receita)}</td>
                    <td className="py-2 text-right text-slate-400">100%</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500 text-xs pl-3">Fretes Cobrados</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{formatBRL(dados.fretesCobrados)}</td>
                    <td className="py-1.5 text-right text-xs text-slate-400">{pct(dados.fretesCobrados, dados.basePercentual)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500 text-xs pl-3">Pedidos Emitidos</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{dados.numPedidos}</td>
                    <td className="py-1.5 text-right text-xs text-slate-400">—</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500 text-xs pl-3">Ticket Médio</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{formatBRL(dados.ticketMedio)}</td>
                    <td className="py-1.5 text-right text-xs text-slate-400">—</td>
                  </tr>

                  {/* Linha separadora */}
                  <tr><td colSpan={3} className="py-0.5" /></tr>

                  {/* CMV */}
                  <tr>
                    <td className="py-1.5 font-semibold text-red-700">CMV {regime === 'competencia' ? '(custo do vendido)' : '(compras pagas)'}</td>
                    <td className="py-1.5 text-right font-semibold text-red-700">{formatBRL(dados.cmvTotal)}</td>
                    <td className="py-1.5 text-right text-red-600">{pct(dados.cmvTotal, dados.basePercentual)}</td>
                  </tr>
                  <tr className="bg-green-50">
                    <td className="py-1.5 font-bold text-green-800 pl-3">Lucro Bruto</td>
                    <td className="py-1.5 text-right font-bold text-green-700">{formatBRL(dados.lucroBruto)}</td>
                    <td className="py-1.5 text-right text-green-600">{pct(dados.lucroBruto, dados.basePercentual)}</td>
                  </tr>

                  {/* Grupos de despesa em ordem */}
                  {ORDEM_RESULTADO.filter(r => r !== 'CMV').map(label => {
                    const val = dados.resultadoAgrupado[label] || 0
                    if (val === 0) return null
                    return (
                      <tr key={label}>
                        <td className="py-1.5 text-slate-600">{label}</td>
                        <td className="py-1.5 text-right text-slate-700 font-semibold">{formatBRL(val)}</td>
                        <td className="py-1.5 text-right text-slate-400">{pct(val, dados.basePercentual)}</td>
                      </tr>
                    )
                  })}

                  {/* EBIT */}
                  <tr className="border-t border-slate-200 bg-blue-50">
                    <td className="py-1.5 font-bold text-[#1b4fd6] pl-3">EBIT</td>
                    <td className={`py-1.5 text-right font-bold ${dados.ebit >= 0 ? 'text-[#1b4fd6]' : 'text-red-600'}`}>{formatBRL(dados.ebit)}</td>
                    <td className="py-1.5 text-right text-slate-400">{pct(dados.ebit, dados.basePercentual)}</td>
                  </tr>

                  {/* Lucro Líquido */}
                  <tr className={`border-t-2 border-slate-300 font-black ${dados.lucroLiquido >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <td className={`py-2 ${dados.lucroLiquido >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                      {regime === 'competencia' ? 'Resultado (Competência)' : 'Resultado (Caixa)'}
                    </td>
                    <td className={`py-2 text-right text-lg ${dados.lucroLiquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(dados.lucroLiquido)}</td>
                    <td className={`py-2 text-right ${dados.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-500'}`}>{pct(dados.lucroLiquido, dados.basePercentual)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ BLOCO 2: DRE DETALHADO POR GRUPO ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-6 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#0b1733]">DRE Detalhado por Grupo</h2>
                <p className="text-xs text-slate-400">Todas as saídas do Balancete agrupadas · % do Total Vendas</p>
              </div>
              <button
                onClick={() => {
                  if (expandidos.size > 0) setExpandidos(new Set())
                  else setExpandidos(new Set(dados.gruposOrdenados.map(([g]) => g)))
                }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                {expandidos.size > 0 ? 'Recolher tudo' : 'Expandir tudo'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f8fafc]">
                  <tr>
                    <th className="px-6 py-2.5 text-left text-xs font-semibold text-slate-500">Grupo / Categoria</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Valor</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">% Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.gruposOrdenados.map(([grupo, gDados]) => {
                    const isExpanded = expandidos.has(grupo)
                    const isCusto = gDados.isCusto
                    const cats = Object.entries(gDados.categorias).sort((a, b) => b[1] - a[1])
                    return [
                      <tr
                        key={`g-${grupo}`}
                        onClick={() => toggleExpandido(grupo)}
                        className={`border-b cursor-pointer select-none ${isCusto ? 'bg-red-50 border-red-100 hover:bg-red-100/60' : 'bg-[#eef3fb] border-blue-100 hover:bg-blue-100/40'}`}
                      >
                        <td className="px-6 py-3 font-black text-[#0b1733]">
                          <span className="mr-2 text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                          {grupo}
                        </td>
                        <td className={`px-4 py-3 text-right font-black ${isCusto ? 'text-red-700' : 'text-[#0b1733]'}`}>{formatBRL(gDados.total)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${isCusto ? 'text-red-600' : 'text-slate-600'}`}>{pct(gDados.total, dados.totalVendas)}</td>
                      </tr>,
                      ...(isExpanded ? cats.map(([cat, val]) => (
                        <tr key={`c-${grupo}-${cat}`} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-6 py-2 pl-12 text-slate-600">{cat}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{formatBRL(val)}</td>
                          <td className="px-4 py-2 text-right text-slate-400 text-xs">{pct(val, dados.totalVendas)}</td>
                        </tr>
                      )) : [])
                    ]
                  })}
                  {/* Total saídas */}
                  <tr className="border-t-2 border-slate-400 bg-slate-100 font-black">
                    <td className="px-6 py-3 text-[#0b1733]">Total Saídas</td>
                    <td className="px-4 py-3 text-right text-[#0b1733]">{formatBRL(dados.totalSaidas)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{pct(dados.totalSaidas, dados.totalVendas)}</td>
                  </tr>
                  <tr className={`font-black text-base ${dados.lucroLiquido >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <td className={`px-6 py-3 ${dados.lucroLiquido >= 0 ? 'text-green-800' : 'text-red-700'}`}>Lucro Líquido</td>
                    <td className={`px-4 py-3 text-right ${dados.lucroLiquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatBRL(dados.lucroLiquido)}</td>
                    <td className={`px-4 py-3 text-right ${dados.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-500'}`}>{pct(dados.lucroLiquido, dados.totalVendas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ BLOCO 3: MARGEM POR CLIENTE ═══ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-black text-[#0b1733]">Margem por Cliente</h2>
              <div className="flex flex-wrap gap-3 items-center">
                <input type="text" placeholder="Buscar cliente ou CNPJ" value={filtroBusca}
                  onChange={e => { setFiltroBusca(e.target.value); setPaginaClientes(1) }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4fd6] w-52" />
                <button onClick={exportarCSV}
                  className="rounded-xl bg-[#0b1733] px-4 py-2 text-xs font-bold text-white hover:bg-[#1b4fd6] transition">
                  Exportar CSV
                </button>
              </div>
            </div>

            {/* Aviso quando o relatório de vendas não tem coluna de custo */}
            {dados.lucroBrutoVendas === 0 && dados.totalVendas > 0 && (
              <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-sm font-bold text-orange-700">
                  O relatório de Vendas importado não tem a coluna de Custo
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  Por isso Custo, Lucro e Margem aparecem em branco. Para ver as margens, exporte o
                  Relatório de Vendas do Tiny <strong>incluindo as colunas Custo, Lucro e % Lucro</strong>
                  {' '}(em Tiny → Relatórios → Vendas → Relatório de Vendas → ⚙ selecionar colunas) e reimporte
                  no card &quot;Relatório de Vendas&quot;.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    {dados.temSegmento && <th className="pb-2 pr-3">Segmento</th>}
                    <th className="pb-2 pr-3">Cliente</th>
                    <th className="pb-2 pr-3 text-right">Faturamento</th>
                    <th className="pb-2 pr-3 text-right">Custo</th>
                    <th className="pb-2 pr-3 text-right">Lucro R$</th>
                    <th className="pb-2 text-right">Margem %</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesPagina.map((v, i) => {
                    const mp = v.valor > 0 && v.valor_lucro !== 0 ? (v.valor_lucro / v.valor) * 100 : 0
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        {dados.temSegmento && (
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: SEGMENTO_COR[v.segmento] || '#94a3b8' }}>
                              <span className="w-2 h-2 rounded-full" style={{ background: SEGMENTO_COR[v.segmento] || '#94a3b8' }} />
                              {SEGMENTO_LABEL[v.segmento] || v.segmento}
                            </span>
                          </td>
                        )}
                        <td className="py-2 pr-3 font-medium text-[#0b1733] max-w-[220px]">
                          <p className="truncate">{v.cliente || '—'}</p>
                          {v.cnpj_cpf && <p className="text-[10px] text-slate-400 font-mono">{v.cnpj_cpf}</p>}
                        </td>
                        <td className="py-2 pr-3 text-right">{formatBRL(v.valor)}</td>
                        <td className="py-2 pr-3 text-right text-slate-500">{v.custo > 0 ? formatBRL(v.custo) : '—'}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${v.valor_lucro > 0 ? 'text-green-700' : v.valor_lucro < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {v.valor_lucro !== 0 ? formatBRL(v.valor_lucro) : '—'}
                        </td>
                        <td className={`py-2 text-right font-black ${mp === 0 ? 'text-slate-400' : mp < 20 ? 'text-red-600' : mp < 35 ? 'text-orange-600' : 'text-green-700'}`}>
                          {mp !== 0 ? `${mp.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {clientesPagina.length === 0 && (
                    <tr><td colSpan={dados.temSegmento ? 6 : 5} className="py-6 text-center text-sm text-slate-400">Sem clientes encontrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPaginasClientes > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">{clientesFiltrados.length} clientes</span>
                <div className="flex gap-2">
                  <button disabled={paginaClientes === 1} onClick={() => setPaginaClientes(p => p - 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Anterior</button>
                  <span className="text-xs text-slate-500 self-center">{paginaClientes}/{totalPaginasClientes}</span>
                  <button disabled={paginaClientes === totalPaginasClientes} onClick={() => setPaginaClientes(p => p + 1)}
                    className="rounded-lg border px-3 py-1 text-xs disabled:opacity-40 hover:bg-slate-100">Próxima</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
