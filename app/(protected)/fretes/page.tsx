'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'

type Resultado = {
  produto: string
  transportadora: string
  estado: string
  uf: string
  qtd_lancamentos: number
  quantidade_media: number
  cubagem_unitaria: number
  cubagem_total_media: number
  peso_unitario: number
  peso_total_medio: number
  frete_medio: number
}

type Filtros = {
  dataInicial: string
  dataFinal: string
  mes: string
  ano: string
  transportadora: string
  estado: string
  produto: string
}

type RankingTransportadora = {
  transportadora: string
  freteMedio: number
  custoKg: number
  custoM3: number
  score: number
  registros: number
  pesoTotal: number
  cubagemTotal: number
}

const filtrosIniciais: Filtros = {
  dataInicial: '',
  dataFinal: '',
  mes: '',
  ano: '',
  transportadora: '',
  estado: '',
  produto: '',
}

const pieColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2']

export default function FretesDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais)

  useEffect(() => {
    buscarResultados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.dataInicial, filtros.dataFinal, filtros.mes, filtros.ano])

  async function buscarResultados() {
    try {
      setLoading(true)
      setErro('')

      const { data, error } = await supabase.rpc('frete_resultado_por_produto_estado', {
        filtro_mes: filtros.mes ? Number(filtros.mes) : null,
        filtro_ano: filtros.ano ? Number(filtros.ano) : null,
        filtro_data_inicial: filtros.dataInicial || null,
        filtro_data_final: filtros.dataFinal || null,
      })

      if (error) {
        setErro('Não foi possível carregar os dados do dashboard.')
        return
      }

      setResultados(data || [])
    } catch {
      setErro('Ocorreu um erro inesperado ao carregar o dashboard.')
    } finally {
      setLoading(false)
    }
  }

  function atualizarFiltro<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }))
  }

  function limparFiltros() {
    setFiltros(filtrosIniciais)
  }

  function fmt(valor: number) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function fmtN(valor: number, casas = 2) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    })
  }

  const opcoesTransportadora = useMemo(() =>
    [...new Set(resultados.map((i) => i.transportadora?.trim()).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR')
    ), [resultados])

  const opcoesEstado = useMemo(() =>
    [...new Set(resultados.map((i) => i.uf?.trim() || i.estado?.trim()).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR')
    ), [resultados])

  const opcoesProduto = useMemo(() =>
    [...new Set(resultados.map((i) => i.produto?.trim()).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR')
    ), [resultados])

  const resultadosFiltrados = useMemo(() =>
    resultados.filter((item) => {
      const matchT = !filtros.transportadora || item.transportadora === filtros.transportadora
      const matchE = !filtros.estado || (item.uf || item.estado || '') === filtros.estado
      const matchP = !filtros.produto || item.produto === filtros.produto
      return matchT && matchE && matchP
    }), [resultados, filtros.transportadora, filtros.estado, filtros.produto])

  const totalLancamentos = useMemo(() =>
    resultadosFiltrados.reduce((t, i) => t + Number(i.qtd_lancamentos || 0), 0), [resultadosFiltrados])

  const freteMedioGeral = useMemo(() => {
    if (!resultadosFiltrados.length) return 0
    return resultadosFiltrados.reduce((t, i) => t + Number(i.frete_medio || 0), 0) / resultadosFiltrados.length
  }, [resultadosFiltrados])

  const pesoMedioGeral = useMemo(() => {
    if (!resultadosFiltrados.length) return 0
    return resultadosFiltrados.reduce((t, i) => t + Number(i.peso_total_medio || 0), 0) / resultadosFiltrados.length
  }, [resultadosFiltrados])

  const cubagemMediaGeral = useMemo(() => {
    if (!resultadosFiltrados.length) return 0
    return resultadosFiltrados.reduce((t, i) => t + Number(i.cubagem_total_media || 0), 0) / resultadosFiltrados.length
  }, [resultadosFiltrados])

  const custoMedioKg = useMemo(() => {
    const freteTotal = resultadosFiltrados.reduce((a, i) => a + Number(i.frete_medio || 0), 0)
    const pesoTotal = resultadosFiltrados.reduce((a, i) => a + Number(i.peso_total_medio || 0), 0)
    return pesoTotal > 0 ? freteTotal / pesoTotal : 0
  }, [resultadosFiltrados])

  const custoMedioM3 = useMemo(() => {
    const freteTotal = resultadosFiltrados.reduce((a, i) => a + Number(i.frete_medio || 0), 0)
    const cubagemTotal = resultadosFiltrados.reduce((a, i) => a + Number(i.cubagem_total_media || 0), 0)
    return cubagemTotal > 0 ? freteTotal / cubagemTotal : 0
  }, [resultadosFiltrados])

  const rankingTransportadoras = useMemo<RankingTransportadora[]>(() => {
    const mapa = new Map<string, { transportadora: string; freteTotal: number; pesoTotal: number; cubagemTotal: number; registros: number }>()
    resultadosFiltrados.forEach((item) => {
      const chave = item.transportadora || 'Não informada'
      if (!mapa.has(chave)) mapa.set(chave, { transportadora: chave, freteTotal: 0, pesoTotal: 0, cubagemTotal: 0, registros: 0 })
      const a = mapa.get(chave)!
      a.freteTotal += Number(item.frete_medio || 0)
      a.pesoTotal += Number(item.peso_total_medio || 0)
      a.cubagemTotal += Number(item.cubagem_total_media || 0)
      a.registros += 1
    })
    return [...mapa.values()].map((item) => {
      const freteMedio = item.registros > 0 ? item.freteTotal / item.registros : 0
      const custoKg = item.pesoTotal > 0 ? item.freteTotal / item.pesoTotal : 0
      const custoM3 = item.cubagemTotal > 0 ? item.freteTotal / item.cubagemTotal : 0
      const score = custoKg * 0.45 + custoM3 * 0.25 + freteMedio * 0.30
      return { transportadora: item.transportadora, freteMedio: +freteMedio.toFixed(2), custoKg: +custoKg.toFixed(4), custoM3: +custoM3.toFixed(4), score: +score.toFixed(4), registros: item.registros, pesoTotal: +item.pesoTotal.toFixed(2), cubagemTotal: +item.cubagemTotal.toFixed(4) }
    }).sort((a, b) => a.score - b.score)
  }, [resultadosFiltrados])

  const melhorTransportadora = rankingTransportadoras[0] || null
  const piorTransportadora = rankingTransportadoras[rankingTransportadoras.length - 1] || null

  const fretePorEstado = useMemo(() => {
    const mapa = new Map<string, { uf: string; frete: number; registros: number }>()
    resultadosFiltrados.forEach((item) => {
      const chave = item.uf || 'N/I'
      const atual = mapa.get(chave)
      if (atual) { atual.frete += Number(item.frete_medio || 0); atual.registros += 1 }
      else mapa.set(chave, { uf: chave, frete: Number(item.frete_medio || 0), registros: 1 })
    })
    return [...mapa.values()].map((i) => ({ uf: i.uf, frete: i.registros > 0 ? +(i.frete / i.registros).toFixed(2) : 0 })).sort((a, b) => b.frete - a.frete).slice(0, 10)
  }, [resultadosFiltrados])

  const topProdutos = useMemo(() => {
    const mapa = new Map<string, number>()
    resultadosFiltrados.forEach((item) => {
      const atual = mapa.get(item.produto || 'N/I') || 0
      mapa.set(item.produto || 'N/I', atual + Number(item.qtd_lancamentos || 0))
    })
    return [...mapa.entries()].map(([produto, total]) => ({ produto, total })).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [resultadosFiltrados])

  const graficoCombinado = useMemo(() =>
    rankingTransportadoras.slice(0, 8).map((i) => ({ transportadora: i.transportadora, freteMedio: i.freteMedio, custoKg: +i.custoKg.toFixed(2), custoM3: +i.custoM3.toFixed(2) })),
    [rankingTransportadoras])

  const graficoTendencia = useMemo(() =>
    rankingTransportadoras.slice(0, 8).map((i, idx) => ({ posicao: idx + 1, transportadora: i.transportadora, score: +i.score.toFixed(2) })),
    [rankingTransportadoras])

  const alertas = useMemo(() => {
    const lista: string[] = []
    if (!resultadosFiltrados.length) { lista.push('Nenhum dado encontrado com os filtros selecionados.'); return lista }
    if (custoMedioKg > 8) lista.push('O custo médio por kg está elevado e merece revisão.')
    if (custoMedioM3 > 1200) lista.push('O custo médio por m³ está alto para a base atual.')
    if (melhorTransportadora && piorTransportadora) {
      const dif = melhorTransportadora.score > 0 ? piorTransportadora.score / melhorTransportadora.score : 0
      if (dif > 1.35) lista.push('Existe diferença relevante entre a melhor e a pior transportadora.')
    }
    return lista
  }, [resultadosFiltrados, custoMedioKg, custoMedioM3, melhorTransportadora, piorTransportadora])

  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
  const input = 'w-full h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500'
  const label = 'block text-xs font-semibold text-slate-500 mb-1'
  const th = { padding: '12px 10px', textAlign: 'left' as const, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' as const }
  const td = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', whiteSpace: 'nowrap' as const }

  return (
    <div className="flex flex-col gap-5">
      {/* Filtros */}
      <div className={card}>
        <p className="mb-1 font-bold text-slate-700">Filtros do dashboard</p>
        <p className="mb-4 text-xs text-slate-500">Período consulta o banco. Transportadora, estado e produto refinam a tela.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <div><label className={label}>Data inicial</label><input type="date" value={filtros.dataInicial} onChange={(e) => atualizarFiltro('dataInicial', e.target.value)} className={input} /></div>
          <div><label className={label}>Data final</label><input type="date" value={filtros.dataFinal} onChange={(e) => atualizarFiltro('dataFinal', e.target.value)} className={input} /></div>
          <div>
            <label className={label}>Mês</label>
            <select value={filtros.mes} onChange={(e) => atualizarFiltro('mes', e.target.value)} className={input}>
              <option value="">Todos</option>
              {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div><label className={label}>Ano</label><input type="number" placeholder="Ex.: 2026" value={filtros.ano} onChange={(e) => atualizarFiltro('ano', e.target.value)} className={input} /></div>
          <div>
            <label className={label}>Transportadora</label>
            <select value={filtros.transportadora} onChange={(e) => atualizarFiltro('transportadora', e.target.value)} className={input}>
              <option value="">Todas</option>
              {opcoesTransportadora.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Estado</label>
            <select value={filtros.estado} onChange={(e) => atualizarFiltro('estado', e.target.value)} className={input}>
              <option value="">Todos</option>
              {opcoesEstado.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Produto</label>
            <select value={filtros.produto} onChange={(e) => atualizarFiltro('produto', e.target.value)} className={input}>
              <option value="">Todos</option>
              {opcoesProduto.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={limparFiltros} className="w-full h-10 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 transition-colors">Limpar</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">{loading ? 'Carregando...' : `${resultadosFiltrados.length} registros exibidos.`}</p>
        {!!erro && <div className="mt-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">{erro}</div>}
      </div>

      {/* Alertas */}
      {alertas.map((a, i) => (
        <div key={i} className="rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">⚠️ {a}</div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        {[
          { label: 'Frete médio geral', value: fmt(freteMedioGeral), hint: 'Média consolidada', bg: 'from-blue-50 to-blue-100' },
          { label: 'Total lançamentos', value: fmtN(totalLancamentos, 0), hint: 'Total consolidado', bg: 'from-green-50 to-green-100' },
          { label: 'Custo médio / kg', value: fmt(custoMedioKg), hint: 'Frete x peso', bg: 'from-purple-50 to-purple-100' },
          { label: 'Custo médio / m³', value: fmt(custoMedioM3), hint: 'Frete x cubagem', bg: 'from-orange-50 to-orange-100' },
          { label: 'Peso total médio', value: `${fmtN(pesoMedioGeral, 2)} kg`, hint: 'Média por registro', bg: 'from-slate-50 to-slate-100' },
          { label: 'Cubagem total média', value: `${fmtN(cubagemMediaGeral, 4)} m³`, hint: 'Média por registro', bg: 'from-teal-50 to-teal-100' },
          { label: 'Melhor transportadora', value: melhorTransportadora?.transportadora || '-', hint: `Score: ${fmtN(melhorTransportadora?.score || 0, 2)}`, bg: 'from-sky-50 to-sky-100', small: true },
          { label: 'Pior transportadora', value: piorTransportadora?.transportadora || '-', hint: `Score: ${fmtN(piorTransportadora?.score || 0, 2)}`, bg: 'from-red-50 to-red-100', small: true },
        ].map((kpi, i) => (
          <div key={i} className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${kpi.bg} p-4 shadow-sm`}>
            <p className="text-xs font-semibold text-slate-500 mb-2">{kpi.label}</p>
            <p className={`font-black text-slate-800 ${kpi.small ? 'text-lg' : 'text-2xl'} break-words`}>{kpi.value}</p>
            <p className="mt-1 text-xs text-slate-400">{kpi.hint}</p>
          </div>
        ))}
      </div>

      {/* Gráficos linha 1 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className={card}>
          <p className="font-bold text-slate-800 mb-1">Comparativo de transportadoras</p>
          <p className="text-xs text-slate-500 mb-4">Frete médio e custo por kg das principais transportadoras.</p>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={graficoCombinado}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="transportadora" interval={0} angle={-12} textAnchor="end" height={70} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v, n) => n === 'Frete Médio' || n === 'Custo/Kg' || n === 'Custo/m³' ? fmt(Number(v)) : fmtN(Number(v), 2)} />
              <Legend />
              <Bar dataKey="freteMedio" name="Frete Médio" fill="#2563eb" radius={[6,6,0,0]} />
              <Bar dataKey="custoKg" name="Custo/Kg" fill="#16a34a" radius={[6,6,0,0]} />
              <Bar dataKey="custoM3" name="Custo/m³" fill="#f97316" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={card}>
          <p className="font-bold text-slate-800 mb-1">Participação por produto</p>
          <p className="text-xs text-slate-500 mb-4">Produtos com maior volume de lançamentos.</p>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={topProdutos} dataKey="total" nameKey="produto" outerRadius={110} innerRadius={55} paddingAngle={3} labelLine={false} label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}>
                {topProdutos.map((_, idx) => <Cell key={idx} fill={pieColors[idx % pieColors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtN(Number(v), 0)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráficos linha 2 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className={card}>
          <p className="font-bold text-slate-800 mb-1">Ranking de transportadoras</p>
          <p className="text-xs text-slate-500 mb-4">Menor score = melhor eficiência consolidada.</p>
          <div className="overflow-x-auto">
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Transportadora</th>
                  <th style={th}>Frete médio</th>
                  <th style={th}>Custo/kg</th>
                  <th style={th}>Custo/m³</th>
                  <th style={th}>Score</th>
                </tr>
              </thead>
              <tbody>
                {rankingTransportadoras.map((item, idx) => (
                  <tr key={item.transportadora} style={{ background: idx === 0 ? '#f0fdf4' : idx === rankingTransportadoras.length - 1 ? '#fef2f2' : '#fff' }}>
                    <td style={td}>{idx + 1}</td>
                    <td style={td}><strong>{item.transportadora}</strong></td>
                    <td style={td}>{fmt(item.freteMedio)}</td>
                    <td style={td}>{fmt(item.custoKg)}</td>
                    <td style={td}>{fmt(item.custoM3)}</td>
                    <td style={td}>{fmtN(item.score, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={card}>
          <p className="font-bold text-slate-800 mb-1">Tendência de score por posição</p>
          <p className="text-xs text-slate-500 mb-4">Diferença de desempenho entre as melhores transportadoras.</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={graficoTendencia}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="posicao" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => fmtN(Number(v), 2)} />
              <Legend />
              <Line type="monotone" dataKey="score" name="Score" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Frete por estado */}
      <div className={card}>
        <p className="font-bold text-slate-800 mb-1">Frete médio por estado</p>
        <p className="text-xs text-slate-500 mb-4">Estados com maior custo médio de frete.</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={fretePorEstado}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="uf" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Bar dataKey="frete" fill="#7c3aed" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
