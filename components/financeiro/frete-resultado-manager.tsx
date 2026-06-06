'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/browser-client'
import { formatBRL, formatPct } from '@/lib/financeiro/formatters'

type FiltroTipo = 'mes' | 'trimestre' | 'ano'
type Regime = 'competencia' | 'caixa'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 4 }, (_, i) => ANO_ATUAL - 2 + i).filter(a => a >= 2024)
const MES_ATUAL = new Date().getMonth() + 1
const FRETE_RE = /frete|carreto/i

function getMesesAno(tipo: FiltroTipo, mes: number): number[] {
  if (tipo === 'mes') return [mes]
  if (tipo === 'trimestre') {
    const q = Math.ceil(mes / 3); const ini = (q - 1) * 3 + 1
    return [ini, ini + 1, ini + 2]
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
}

type VendaRow = { mes: number; valor: number; frete: number }
type ContaRow = { mes: number; categoria: string; valor: number; tipo: string }

export default function FreteResultadoManager() {
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [balancete, setBalancete] = useState<ContaRow[]>([])
  const [fluxo, setFluxo] = useState<ContaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroTipo>('mes')
  const [ano, setAno] = useState(ANO_ATUAL)
  const [mes, setMes] = useState(MES_ATUAL)
  const [regime, setRegime] = useState<Regime>('competencia')
  const [periodos, setPeriodos] = useState<number[]>([])
  const supabase = createClient()

  const carregar = useCallback(async () => {
    setLoading(true)
    // Carrega o ano inteiro (para a tendência mensal); o período só filtra a visão
    const [{ data: vd }, { data: bal }, { data: fx }] = await Promise.all([
      supabase.from('fin_vendas_import').select('mes,valor,frete').eq('ano', ano),
      supabase.from('fin_balancete').select('mes,categoria,valor,tipo').eq('ano', ano).ilike('categoria', '%frete%'),
      supabase.from('fin_fluxo_caixa_import').select('mes,categoria,valor,tipo').eq('ano', ano).ilike('categoria', '%frete%'),
    ])
    setVendas((vd ?? []) as VendaRow[])
    setBalancete((bal ?? []) as ContaRow[])
    setFluxo((fx ?? []) as ContaRow[])
    setLoading(false)
  }, [ano])

  useEffect(() => { carregar() }, [carregar])

  // Detecta meses com vendas e abre no mais recente
  useEffect(() => {
    let cancelado = false
    async function detectar() {
      const { data } = await supabase.from('fin_vendas_import').select('ano,mes')
      if (cancelado || !data || data.length === 0) return
      const doAno = (data as { ano: number; mes: number }[]).filter(r => r.ano === ano).map(r => r.mes)
      setPeriodos([...new Set(doAno)].sort((a, b) => a - b))
      const todos = (data as { ano: number; mes: number }[]).sort((a, b) => b.ano - a.ano || b.mes - a.mes)
      const recente = todos[0]
      const temAtual = todos.some(p => p.ano === ANO_ATUAL && p.mes === MES_ATUAL)
      if (recente && !temAtual) { setAno(recente.ano); setMes(recente.mes); setFiltro('mes') }
    }
    detectar()
    return () => { cancelado = true }
  }, [supabase, ano])

  // Frete pago por mês conforme o regime
  const pagoPorMes = useMemo(() => {
    const m: Record<number, number> = {}
    const fonte = regime === 'competencia'
      ? balancete.filter(r => r.tipo !== 'entrada' && FRETE_RE.test(r.categoria))
      : fluxo.filter(r => r.tipo === 'despesa' && FRETE_RE.test(r.categoria))
    for (const r of fonte) m[r.mes] = (m[r.mes] ?? 0) + Number(r.valor || 0)
    return m
  }, [balancete, fluxo, regime])

  const cobradoPorMes = useMemo(() => {
    const m: Record<number, number> = {}
    for (const r of vendas) m[r.mes] = (m[r.mes] ?? 0) + Number(r.frete || 0)
    return m
  }, [vendas])

  const receitaPorMes = useMemo(() => {
    const m: Record<number, number> = {}
    for (const r of vendas) m[r.mes] = (m[r.mes] ?? 0) + Number(r.valor || 0)
    return m
  }, [vendas])

  // Agregados do período selecionado
  const dados = useMemo(() => {
    const meses = getMesesAno(filtro, mes)
    const cobrado = meses.reduce((s, m) => s + (cobradoPorMes[m] ?? 0), 0)
    const pago = meses.reduce((s, m) => s + (pagoPorMes[m] ?? 0), 0)
    const receita = meses.reduce((s, m) => s + (receitaPorMes[m] ?? 0), 0)
    const resultado = cobrado - pago
    const cobertura = pago > 0 ? (cobrado / pago) * 100 : 0
    const impactoMargem = receita > 0 ? (resultado / receita) * 100 : 0
    const repassePct = cobrado > 0 ? (pago / cobrado) * 100 : 0
    return { cobrado, pago, receita, resultado, cobertura, impactoMargem, repassePct }
  }, [filtro, mes, cobradoPorMes, pagoPorMes, receitaPorMes])

  // Tendência mensal (ano inteiro)
  const tendencia = useMemo(() => MESES.map((label, i) => {
    const m = i + 1
    const cobrado = cobradoPorMes[m] ?? 0
    const pago = pagoPorMes[m] ?? 0
    return { mes: label, Cobrado: Math.round(cobrado), Pago: Math.round(pago), Resultado: Math.round(cobrado - pago) }
  }).filter(d => d.Cobrado || d.Pago), [cobradoPorMes, pagoPorMes])

  // Detalhe do frete pago por categoria
  const porCategoria = useMemo(() => {
    const meses = getMesesAno(filtro, mes)
    const fonte = regime === 'competencia'
      ? balancete.filter(r => r.tipo !== 'entrada' && FRETE_RE.test(r.categoria) && meses.includes(r.mes))
      : fluxo.filter(r => r.tipo === 'despesa' && FRETE_RE.test(r.categoria) && meses.includes(r.mes))
    const m = new Map<string, number>()
    for (const r of fonte) m.set(r.categoria, (m.get(r.categoria) ?? 0) + Number(r.valor || 0))
    return [...m.entries()].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
  }, [filtro, mes, regime, balancete, fluxo])

  const ganhando = dados.resultado >= 0
  const semDadosPago = dados.cobrado === 0 && dados.pago === 0

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-3xl bg-gradient-to-br from-[#0b1733] to-[#1b4fd6] p-6 text-white shadow-sm">
        <h1 className="text-xl font-bold">Resultado de Frete · Cobrado × Pago</h1>
        <p className="mt-1 max-w-3xl text-sm text-blue-100">
          Compara o frete <strong>cobrado dos clientes</strong> nas vendas com o frete <strong>pago às transportadoras</strong>,
          para ver se o frete está dando lucro ou prejuízo e quanto isso pesa na margem.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-slate-500">Período:</span>
          {(['mes', 'trimestre', 'ano'] as FiltroTipo[]).map(t => (
            <button key={t} onClick={() => setFiltro(t)}
              className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
                filtro === t ? 'bg-[#1b4fd6] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {t === 'mes' ? 'Mês' : t === 'trimestre' ? 'Trimestre' : 'Ano'}
            </button>
          ))}
          <span className="ml-4 shrink-0 text-xs font-semibold text-slate-500">Frete pago por:</span>
          {(['competencia', 'caixa'] as Regime[]).map(r => (
            <button key={r} onClick={() => setRegime(r)}
              className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
                regime === r ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {r === 'competencia' ? 'Competência (DRE)' : 'Caixa (pago)'}
            </button>
          ))}
          <select value={ano} onChange={e => setAno(Number(e.target.value))}
            className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]">
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {filtro !== 'ano' && (
          <div className="flex flex-wrap gap-1">
            {MESES.map((m, i) => {
              const ativo = filtro === 'mes' ? mes === i + 1 : getMesesAno('trimestre', mes).includes(i + 1)
              const temDados = periodos.includes(i + 1)
              return (
                <button key={m} onClick={() => setMes(i + 1)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    ativo ? 'bg-[#1b4fd6] text-white'
                    : temDados ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-50 text-slate-300'
                  }`}>
                  {m}
                </button>
              )
            })}
          </div>
        )}
        <p className="text-xs text-slate-400">
          {regime === 'competencia'
            ? 'Frete pago = despesa "Fretes e Carretos" do DRE (regime de competência).'
            : 'Frete pago = saídas de caixa em "Fretes e Carretos" (regime de caixa).'}
          {' '}Frete cobrado = soma do frete das vendas do período.
        </p>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">Carregando…</div>
      ) : semDadosPago ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="font-semibold text-amber-800">Sem dados de frete para o período.</p>
          <p className="mt-1 text-sm text-amber-700">Importe os relatórios de Vendas e de Balancete/Fluxo de Caixa do Tiny na aba Importação.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Frete cobrado</p>
              <p className="mt-1 text-2xl font-bold text-[#1b4fd6]">{formatBRL(dados.cobrado)}</p>
              <p className="mt-0.5 text-xs text-slate-500">Recebido dos clientes nas vendas</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Frete pago</p>
              <p className="mt-1 text-2xl font-bold text-[#f59e0b]">{formatBRL(dados.pago)}</p>
              <p className="mt-0.5 text-xs text-slate-500">Pago às transportadoras</p>
            </div>
            <div className={`rounded-2xl border p-4 shadow-sm ${ganhando ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultado</p>
              <p className={`mt-1 text-2xl font-bold ${ganhando ? 'text-emerald-600' : 'text-red-600'}`}>
                {ganhando ? '+' : ''}{formatBRL(dados.resultado)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{ganhando ? 'Sobra no frete' : 'Prejuízo no frete'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cobertura</p>
              <p className="mt-1 text-2xl font-bold text-[#0b1733]">{dados.pago > 0 ? formatPct(dados.cobertura) : '—'}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {dados.pago > 0 ? `Cobra R$ ${(dados.cobertura / 100).toFixed(2)} p/ cada R$1 pago` : 'Sem frete pago'}
              </p>
            </div>
          </div>

          {/* Veredito */}
          <div className={`rounded-3xl border p-6 shadow-sm ${ganhando ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <h3 className={`text-sm font-bold uppercase tracking-wide ${ganhando ? 'text-emerald-700' : 'text-red-700'}`}>
              {ganhando ? 'Você está ganhando dinheiro no frete' : 'Você está perdendo dinheiro no frete'}
            </h3>
            <p className="mt-2 text-[#0b1733]">
              No período, o frete cobrado ({formatBRL(dados.cobrado)}) {ganhando ? 'superou' : 'ficou abaixo'} do frete pago
              ({formatBRL(dados.pago)}), gerando {ganhando ? 'uma sobra' : 'um prejuízo'} de{' '}
              <strong>{formatBRL(Math.abs(dados.resultado))}</strong>. Isso{' '}
              <strong>{ganhando ? 'adicionou' : 'tirou'} {formatPct(Math.abs(dados.impactoMargem))}</strong> da sua margem
              sobre a receita de {formatBRL(dados.receita)}.
              {dados.repassePct > 0 && dados.repassePct < 100 && ganhando &&
                ` Você repassa ${formatPct(dados.repassePct)} do frete pago para o cliente e ainda sobra margem.`}
            </p>
          </div>

          {/* Tendência mensal */}
          {tendencia.length > 1 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-[#0b1733]">Evolução mensal · {ano}</h3>
              <p className="mb-2 text-xs text-slate-500">Frete cobrado vs pago e o resultado de cada mês.</p>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={tendencia} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="Cobrado" fill="#1b4fd6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pago" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Line dataKey="Resultado" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detalhe + impacto */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-[#0b1733]">Frete pago por categoria</h3>
              <p className="mb-3 text-xs text-slate-500">{regime === 'competencia' ? 'Despesas do DRE' : 'Saídas de caixa'} classificadas como frete.</p>
              {porCategoria.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum frete pago registrado no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {porCategoria.map(c => (
                      <tr key={c.categoria} className="border-b border-slate-100">
                        <td className="py-2 text-[#0b1733]">{c.categoria}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{formatBRL(c.valor)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 font-bold text-[#0b1733]">Total</td>
                      <td className="py-2 text-right font-bold tabular-nums">{formatBRL(dados.pago)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-[#0b1733] p-6 text-white shadow-sm">
              <h3 className="text-base font-bold">Como ler este indicador</h3>
              <ul className="mt-3 space-y-3 text-sm text-blue-100">
                <li className="border-l-2 border-blue-400 pl-3">
                  <p className="font-semibold text-white">Frete como centro de resultado</p>
                  <p className="text-blue-200">Se o cobrado supera o pago, o frete vira lucro extra. Se fica abaixo, ele corrói a margem do produto.</p>
                </li>
                <li className="border-l-2 border-blue-400 pl-3">
                  <p className="font-semibold text-white">Impacto na margem</p>
                  <p className="text-blue-200">O resultado do frete dividido pela receita mostra quantos pontos percentuais ele soma ou tira da sua margem total.</p>
                </li>
                <li className="border-l-2 border-blue-400 pl-3">
                  <p className="font-semibold text-white">Competência vs caixa</p>
                  <p className="text-blue-200">Competência usa a despesa do DRE; caixa usa o que efetivamente saiu. Diferenças grandes indicam fretes pagos de meses anteriores.</p>
                </li>
                <li className="border-l-2 border-blue-400 pl-3">
                  <p className="font-semibold text-white">Ação</p>
                  <p className="text-blue-200">Frete dando prejuízo → revise a política de frete cobrado (tabela por estado/peso) ou renegocie com as transportadoras.</p>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
