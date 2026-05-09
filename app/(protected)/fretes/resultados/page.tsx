'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts'

type Resultado = { produto: string; transportadora: string; estado: string; uf: string; qtd_lancamentos: number; quantidade_media: number; cubagem_unitaria: number; cubagem_total_media: number; peso_unitario: number; peso_total_medio: number; frete_medio: number }
type Produto = { id: number; nome: string }
type Transportadora = { id: number; nome: string }
type Cidade = { id: number; nome: string; estado_id: number }
type Estado = { id: number; nome: string; uf: string }
type LancamentoFrete = { id: number; data: string; produto_id: number; transportadora_id: number; cidade_id: number; quantidade: number; valor_frete: number; prazo_entrega: number | null }

const pieColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2']

const kpiTitleStyle: React.CSSProperties = { fontSize: '12px', color: '#6b7280', marginBottom: '6px', fontWeight: 600 }
const kpiValueStyle: React.CSSProperties = { fontSize: '22px', fontWeight: 800, color: '#111827' }
const kpiHintStyle: React.CSSProperties = { fontSize: '11px', color: '#64748b', marginTop: '6px' }
const chartTitleStyle: React.CSSProperties = { fontSize: '16px', fontWeight: 800, marginBottom: '4px', color: '#111827' }
const chartSubtitleStyle: React.CSSProperties = { fontSize: '12px', color: '#6b7280', marginBottom: '14px' }

export default function ResultadosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [lancamentosRaw, setLancamentosRaw] = useState<LancamentoFrete[]>([])
  const [produtosRef, setProdutosRef] = useState<Produto[]>([])
  const [transportadorasRef, setTransportadorasRef] = useState<Transportadora[]>([])
  const [cidadesRef, setCidadesRef] = useState<Cidade[]>([])
  const [estadosRef, setEstadosRef] = useState<Estado[]>([])
  const [busca, setBusca] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [filtroTransportadora, setFiltroTransportadora] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAno, setFiltroAno] = useState('')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { buscarResultados() }, [filtroMes, filtroAno, dataInicial, dataFinal])

  async function buscarResultados() {
    setLoading(true)
    const [r, l, p, t, c, e] = await Promise.all([
      supabase.rpc('frete_resultado_por_produto_estado', { filtro_mes: filtroMes ? Number(filtroMes) : null, filtro_ano: filtroAno ? Number(filtroAno) : null, filtro_data_inicial: dataInicial || null, filtro_data_final: dataFinal || null }),
      supabase.from('frete_lancamentos').select('id,data,produto_id,transportadora_id,cidade_id,quantidade,valor_frete,prazo_entrega').order('id', { ascending: false }),
      supabase.from('frete_produtos').select('id,nome'),
      supabase.from('frete_transportadoras').select('id,nome'),
      supabase.from('frete_cidades').select('id,nome,estado_id'),
      supabase.from('frete_estados').select('id,nome,uf'),
    ])
    setLoading(false)
    if (!r.error) setResultados(r.data || [])
    if (!l.error) setLancamentosRaw(l.data || [])
    if (!p.error) setProdutosRef(p.data || [])
    if (!t.error) setTransportadorasRef(t.data || [])
    if (!c.error) setCidadesRef(c.data || [])
    if (!e.error) setEstadosRef(e.data || [])
  }

  function fmt(v: number) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
  function fmtN(v: number, casas = 2) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) }
  function getProduto(id: number) { return produtosRef.find((i) => i.id === id)?.nome || '' }
  function getTrans(id: number) { return transportadorasRef.find((i) => i.id === id)?.nome || '' }
  function getEstadoByCidade(cidadeId: number) { const c = cidadesRef.find((i) => i.id === cidadeId); if (!c) return null; return estadosRef.find((i) => i.id === c.estado_id) || null }

  function limparFiltros() { setBusca(''); setFiltroProduto(''); setFiltroTransportadora(''); setFiltroEstado(''); setFiltroMes(''); setFiltroAno(''); setDataInicial(''); setDataFinal('') }

  const produtosUnicos = useMemo(() => [...new Set(resultados.map((i) => i.produto))].sort(), [resultados])
  const transUnicas = useMemo(() => [...new Set(resultados.map((i) => i.transportadora))].sort(), [resultados])
  const estadosUnicos = useMemo(() => [...new Set(resultados.map((i) => i.estado))].sort(), [resultados])
  const anosDisponiveis = useMemo(() => { const a = new Date().getFullYear(); return Array.from({ length: 6 }, (_, i) => String(a - i)) }, [])

  const resultadosFiltrados = useMemo(() => resultados.filter((item) => {
    const texto = busca.toLowerCase()
    const passouBusca = item.produto.toLowerCase().includes(texto) || item.transportadora.toLowerCase().includes(texto) || item.estado.toLowerCase().includes(texto) || item.uf.toLowerCase().includes(texto)
    return passouBusca && (filtroProduto ? item.produto === filtroProduto : true) && (filtroTransportadora ? item.transportadora === filtroTransportadora : true) && (filtroEstado ? item.estado === filtroEstado : true)
  }), [resultados, busca, filtroProduto, filtroTransportadora, filtroEstado])

  const lancamentosFiltradosPrazo = useMemo(() => lancamentosRaw.filter((item) => {
    const produtoNome = getProduto(item.produto_id); const transNome = getTrans(item.transportadora_id); const estadoData = getEstadoByCidade(item.cidade_id)
    const texto = busca.toLowerCase()
    const passouBusca = !busca || produtoNome.toLowerCase().includes(texto) || transNome.toLowerCase().includes(texto) || (estadoData?.nome || '').toLowerCase().includes(texto)
    const dataL = item.data.slice(0, 10); const dataObj = new Date(item.data)
    return passouBusca && (filtroProduto ? produtoNome === filtroProduto : true) && (filtroTransportadora ? transNome === filtroTransportadora : true) && (filtroEstado ? estadoData?.nome === filtroEstado : true) && (dataInicial ? dataL >= dataInicial : true) && (dataFinal ? dataL <= dataFinal : true) && (filtroMes ? String(dataObj.getMonth() + 1) === filtroMes : true) && (filtroAno ? String(dataObj.getFullYear()) === filtroAno : true)
  }), [lancamentosRaw, busca, filtroProduto, filtroTransportadora, filtroEstado, filtroMes, filtroAno, dataInicial, dataFinal, produtosRef, transportadorasRef, cidadesRef, estadosRef])

  function buscarPrazoMedio(item: Resultado) {
    const rel = lancamentosFiltradosPrazo.filter((l) => getProduto(l.produto_id) === item.produto && getTrans(l.transportadora_id) === item.transportadora && (() => { const e = getEstadoByCidade(l.cidade_id); return e?.nome === item.estado || e?.uf === item.uf })())
    const validos = rel.filter((l) => l.prazo_entrega != null)
    if (!validos.length) return 0
    return validos.reduce((a, l) => a + Number(l.prazo_entrega || 0), 0) / validos.length
  }

  const resultadosComPrazo = useMemo(() => resultadosFiltrados.map((i) => ({ ...i, prazo_medio: buscarPrazoMedio(i) })), [resultadosFiltrados, lancamentosFiltradosPrazo])

  const totalLancamentos = useMemo(() => resultadosFiltrados.reduce((t, i) => t + Number(i.qtd_lancamentos || 0), 0), [resultadosFiltrados])
  const freteMedioGeral = useMemo(() => resultadosFiltrados.length ? resultadosFiltrados.reduce((t, i) => t + Number(i.frete_medio || 0), 0) / resultadosFiltrados.length : 0, [resultadosFiltrados])
  const cubagemMediaGeral = useMemo(() => resultadosFiltrados.length ? resultadosFiltrados.reduce((t, i) => t + Number(i.cubagem_total_media || 0), 0) / resultadosFiltrados.length : 0, [resultadosFiltrados])
  const pesoMedioGeral = useMemo(() => resultadosFiltrados.length ? resultadosFiltrados.reduce((t, i) => t + Number(i.peso_total_medio || 0), 0) / resultadosFiltrados.length : 0, [resultadosFiltrados])
  const prazoMedioGeral = useMemo(() => { const v = lancamentosFiltradosPrazo.filter((i) => i.prazo_entrega != null); return v.length ? v.reduce((a, i) => a + Number(i.prazo_entrega || 0), 0) / v.length : 0 }, [lancamentosFiltradosPrazo])
  const custoMedioPorKg = useMemo(() => { const f = resultadosFiltrados.reduce((t, i) => t + Number(i.frete_medio || 0), 0); const p = resultadosFiltrados.reduce((t, i) => t + Number(i.peso_total_medio || 0), 0); return p > 0 ? f / p : 0 }, [resultadosFiltrados])
  const custoMedioPorM3 = useMemo(() => { const f = resultadosFiltrados.reduce((t, i) => t + Number(i.frete_medio || 0), 0); const c = resultadosFiltrados.reduce((t, i) => t + Number(i.cubagem_total_media || 0), 0); return c > 0 ? f / c : 0 }, [resultadosFiltrados])

  const rankingTransportadoras = useMemo(() => {
    const mapa = new Map<string, { transportadora: string; freteTotal: number; pesoTotal: number; cubagemTotal: number; prazoTotal: number; registros: number; registrosPrazo: number }>()
    resultadosComPrazo.forEach((item) => {
      const chave = item.transportadora || 'N/I'
      const a = mapa.get(chave)
      if (a) { a.freteTotal += Number(item.frete_medio || 0); a.pesoTotal += Number(item.peso_total_medio || 0); a.cubagemTotal += Number(item.cubagem_total_media || 0); a.prazoTotal += Number(item.prazo_medio || 0); a.registros += 1; if (item.prazo_medio > 0) a.registrosPrazo += 1 }
      else mapa.set(chave, { transportadora: chave, freteTotal: Number(item.frete_medio || 0), pesoTotal: Number(item.peso_total_medio || 0), cubagemTotal: Number(item.cubagem_total_media || 0), prazoTotal: Number(item.prazo_medio || 0), registros: 1, registrosPrazo: item.prazo_medio > 0 ? 1 : 0 })
    })
    return [...mapa.values()].map((item) => {
      const freteMedio = item.registros > 0 ? item.freteTotal / item.registros : 0
      const custoKg = item.pesoTotal > 0 ? item.freteTotal / item.pesoTotal : 0
      const custoM3 = item.cubagemTotal > 0 ? item.freteTotal / item.cubagemTotal : 0
      const prazoMedio = item.registrosPrazo > 0 ? item.prazoTotal / item.registrosPrazo : 0
      const score = custoKg * 0.35 + custoM3 * 0.20 + freteMedio * 0.25 + prazoMedio * 0.20
      return { transportadora: item.transportadora, freteMedio: +freteMedio.toFixed(2), custoKg: +custoKg.toFixed(4), custoM3: +custoM3.toFixed(4), prazoMedio: +prazoMedio.toFixed(2), score: +score.toFixed(2), registros: item.registros }
    }).sort((a, b) => a.score - b.score)
  }, [resultadosComPrazo])

  const melhorTransportadora = rankingTransportadoras[0] || null
  const piorTransportadora = rankingTransportadoras[rankingTransportadoras.length - 1] || null
  const estadoMaisCaro = useMemo(() => {
    const mapa = new Map<string, { estado: string; frete: number; count: number }>()
    resultadosFiltrados.forEach((i) => { const c = i.estado || 'N/I'; const a = mapa.get(c); if (a) { a.frete += Number(i.frete_medio || 0); a.count++ } else mapa.set(c, { estado: c, frete: Number(i.frete_medio || 0), count: 1 }) })
    return [...mapa.values()].map((i) => ({ estado: i.estado, freteMedio: i.count > 0 ? i.frete / i.count : 0 })).sort((a, b) => b.freteMedio - a.freteMedio)[0] || null
  }, [resultadosFiltrados])

  const alertas = useMemo(() => {
    const lista: string[] = []
    if (!resultadosFiltrados.length) { lista.push('Nenhum dado encontrado com os filtros selecionados.'); return lista }
    if (custoMedioPorKg > 8) lista.push('O custo médio por kg está elevado nesta visão filtrada.')
    if (custoMedioPorM3 > 1200) lista.push('O custo médio por m³ está alto nesta visão filtrada.')
    if (prazoMedioGeral > 7) lista.push('O prazo médio de entrega está elevado nesta visão filtrada.')
    if (melhorTransportadora && piorTransportadora && melhorTransportadora.score > 0 && piorTransportadora.score / melhorTransportadora.score > 1.35)
      lista.push('Existe diferença relevante entre a melhor e a pior transportadora nesta análise.')
    return lista
  }, [resultadosFiltrados, custoMedioPorKg, custoMedioPorM3, prazoMedioGeral, melhorTransportadora, piorTransportadora])

  function exportarExcel() {
    if (!resultadosFiltrados.length) { alert('Nenhum dado para exportar.'); return }
    const dados = resultadosFiltrados.map((i) => ({ Produto: i.produto, Transportadora: i.transportadora, Estado: i.estado, UF: i.uf, 'Qtd. Lançamentos': Number(i.qtd_lancamentos), 'Quantidade Média': Number(i.quantidade_media), 'Cubagem Unitária (m³)': Number(i.cubagem_unitaria), 'Cubagem Total Média (m³)': Number(i.cubagem_total_media), 'Peso Unitário (kg)': Number(i.peso_unitario), 'Peso Total Médio (kg)': Number(i.peso_total_medio), 'Frete Médio (R$)': Number(i.frete_medio), 'Prazo Médio (dias)': +buscarPrazoMedio(i).toFixed(2) }))
    const ws = XLSX.utils.json_to_sheet(dados); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Resultados')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' }), `resultados_frete_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const graficoFreteTransportadora = useMemo(() => rankingTransportadoras.slice(0, 8).map((i) => ({ transportadora: i.transportadora, freteMedio: i.freteMedio, custoKg: i.custoKg, prazoMedio: i.prazoMedio })), [rankingTransportadoras])
  const graficoProdutos = useMemo(() => { const m = new Map<string, number>(); resultadosFiltrados.forEach((i) => m.set(i.produto, (m.get(i.produto) || 0) + Number(i.qtd_lancamentos || 0))); return [...m.entries()].map(([produto, total]) => ({ produto, total })).sort((a, b) => b.total - a.total).slice(0, 6) }, [resultadosFiltrados])
  const graficoPrazo = useMemo(() => rankingTransportadoras.slice(0, 8).map((i) => ({ transportadora: i.transportadora, prazoMedio: i.prazoMedio })), [rankingTransportadoras])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '20px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)', marginBottom: '20px' }
  const kpiCard: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '18px', boxShadow: '0 8px 24px rgba(15,23,42,0.06)', flex: 1, minWidth: '200px' }
  const th: React.CSSProperties = { padding: '12px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', whiteSpace: 'nowrap' }
  const filtroStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '13px', minWidth: '180px' }

  return (
    <div>
      {alertas.map((a, i) => (
        <div key={i} style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: '14px', padding: '12px 14px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>⚠️ {a}</div>
      ))}

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Frete médio geral', value: fmt(freteMedioGeral), bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)' },
          { label: 'Total lançamentos', value: fmtN(totalLancamentos, 0), bg: 'linear-gradient(135deg,#ecfdf5,#d1fae5)' },
          { label: 'Cubagem total média', value: `${fmtN(cubagemMediaGeral, 4)} m³`, bg: 'linear-gradient(135deg,#f5f3ff,#ede9fe)' },
          { label: 'Peso total médio', value: `${fmtN(pesoMedioGeral, 2)} kg`, bg: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
          { label: 'Custo médio por kg', value: fmt(custoMedioPorKg), bg: 'linear-gradient(135deg,#fef3c7,#fde68a)' },
          { label: 'Custo médio por m³', value: fmt(custoMedioPorM3), bg: 'linear-gradient(135deg,#fee2e2,#fecaca)' },
          { label: 'Prazo médio de entrega', value: `${fmtN(prazoMedioGeral, 1)} dias`, bg: 'linear-gradient(135deg,#ecfeff,#cffafe)' },
        ].map((kpi, i) => (
          <div key={i} style={{ ...kpiCard, background: kpi.bg }}>
            <div style={kpiTitleStyle}>{kpi.label}</div>
            <div style={kpiValueStyle}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={card}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Busca geral..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ ...filtroStyle, minWidth: '300px' }} />
          <select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)} style={filtroStyle}><option value="">Todos os produtos</option>{produtosUnicos.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select value={filtroTransportadora} onChange={(e) => setFiltroTransportadora(e.target.value)} style={filtroStyle}><option value="">Todas as transportadoras</option>{transUnicas.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={filtroStyle}><option value="">Todos os estados</option>{estadosUnicos.map((e) => <option key={e} value={e}>{e}</option>)}</select>
          <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} style={filtroStyle}><option value="">Todos os meses</option>{['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}</select>
          <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} style={filtroStyle}><option value="">Todos os anos</option>{anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} style={filtroStyle} />
          <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} style={filtroStyle} />
          <button onClick={limparFiltros} style={{ ...filtroStyle, background: '#6b7280', color: '#fff', cursor: 'pointer', border: 'none', fontWeight: 600 }}>Limpar filtros</button>
          <button onClick={exportarExcel} style={{ ...filtroStyle, background: '#16a34a', color: '#fff', cursor: 'pointer', border: 'none', fontWeight: 600 }}>Exportar Excel</button>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#64748b' }}>{loading ? 'Carregando...' : `${resultadosFiltrados.length} registros exibidos.`}</div>
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(300px,1fr)', gap: '16px', marginBottom: '20px' }}>
        <div style={card}>
          <div style={chartTitleStyle}>Frete médio por transportadora</div>
          <div style={chartSubtitleStyle}>Comparativo entre transportadoras da visão filtrada.</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={graficoFreteTransportadora}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="transportadora" interval={0} angle={-12} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n) => n === 'Frete Médio' || n === 'Custo/Kg' ? fmt(Number(v)) : `${fmtN(Number(v), 1)} dias`} />
              <Legend />
              <Bar dataKey="freteMedio" name="Frete Médio" fill="#2563eb" radius={[6,6,0,0]} />
              <Bar dataKey="custoKg" name="Custo/Kg" fill="#16a34a" radius={[6,6,0,0]} />
              <Bar dataKey="prazoMedio" name="Prazo Médio" fill="#0891b2" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <div style={chartTitleStyle}>Participação por produto</div>
          <div style={chartSubtitleStyle}>Produtos com maior volume de lançamentos.</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={graficoProdutos} dataKey="total" nameKey="produto" outerRadius={100} innerRadius={50} paddingAngle={3} labelLine={false} label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}>
                {graficoProdutos.map((_, idx) => <Cell key={idx} fill={pieColors[idx % pieColors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtN(Number(v), 0)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(280px,1fr)', gap: '16px', marginBottom: '20px' }}>
        <div style={card}>
          <div style={chartTitleStyle}>Prazo médio por transportadora</div>
          <div style={chartSubtitleStyle}>Comparativo dos prazos médios.</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={graficoPrazo}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="transportadora" interval={0} angle={-12} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${fmtN(Number(v), 1)} dias`} />
              <Bar dataKey="prazoMedio" name="Prazo Médio" fill="#7c3aed" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
          {[
            { label: 'Melhor transportadora', value: melhorTransportadora?.transportadora || '-', hint: `Score: ${fmtN(melhorTransportadora?.score || 0, 2)} | Prazo: ${fmtN(melhorTransportadora?.prazoMedio || 0, 1)} dias` },
            { label: 'Pior transportadora', value: piorTransportadora?.transportadora || '-', hint: `Score: ${fmtN(piorTransportadora?.score || 0, 2)} | Prazo: ${fmtN(piorTransportadora?.prazoMedio || 0, 1)} dias` },
            { label: 'Estado mais caro', value: estadoMaisCaro?.estado || '-', hint: `Frete médio: ${fmt(estadoMaisCaro?.freteMedio || 0)}` },
          ].map((kpi, i) => (
            <div key={i} style={card}>
              <div style={kpiTitleStyle}>{kpi.label}</div>
              <div style={{ ...kpiValueStyle, fontSize: '20px' }}>{kpi.value}</div>
              <div style={kpiHintStyle}>{kpi.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div style={card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1400px' }}>
            <thead>
              <tr>{['Produto','Transportadora','Estado','UF','Qtd. Lançamentos','Qtd. Média','Cubagem Unit.','Cubagem Total Média','Peso Unit.','Peso Total Médio','Frete Médio','Prazo Médio'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {resultadosComPrazo.map((item, idx) => (
                <tr key={idx}>
                  <td style={td}>{item.produto}</td>
                  <td style={td}>{item.transportadora}</td>
                  <td style={td}>{item.estado}</td>
                  <td style={td}>{item.uf}</td>
                  <td style={td}>{item.qtd_lancamentos}</td>
                  <td style={td}>{fmtN(item.quantidade_media, 2)}</td>
                  <td style={td}>{fmtN(item.cubagem_unitaria, 4)} m³</td>
                  <td style={td}>{fmtN(item.cubagem_total_media, 4)} m³</td>
                  <td style={td}>{fmtN(item.peso_unitario, 2)} kg</td>
                  <td style={td}>{fmtN(item.peso_total_medio, 2)} kg</td>
                  <td style={td}>{fmt(item.frete_medio)}</td>
                  <td style={td}>{item.prazo_medio > 0 ? `${fmtN(item.prazo_medio, 1)} dias` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
