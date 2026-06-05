'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

// Resultado agregado vindo da RPC do módulo de fretes (mesma usada no Dashboard)
type Resultado = {
  produto: string; transportadora: string; estado: string; uf: string
  qtd_lancamentos: number; peso_total_medio: number; cubagem_total_media: number
  frete_medio: number; prazo_medio?: number
}

// Faixa de peso (kg). max = null → faixa aberta (acima de min)
type Faixa = { min: number; max: number | null }

type ConfigTabela = {
  margem: number            // % sobre o custo
  freteMinimo: number       // piso por envio (R$)
  rkgFallback: number       // R$/kg para estados sem histórico
  modeloPeso: 'superior' | 'medio'
  faixas: Faixa[]
}

const CONFIG_KEY = 'ergotex_frete_tabela_shopify_v1'

// 27 UFs do Brasil — garante que a tabela cubra todos os destinos
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]
const UF_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}

const CONFIG_PADRAO: ConfigTabela = {
  margem: 15,
  freteMinimo: 0,
  rkgFallback: 0,
  modeloPeso: 'superior',
  faixas: [
    { min: 0, max: 5 }, { min: 5, max: 10 }, { min: 10, max: 20 },
    { min: 20, max: 30 }, { min: 30, max: 50 }, { min: 50, max: null },
  ],
}

function fmtBRL(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtN(v: number, casas = 2) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
function rotuloFaixa(f: Faixa) {
  return f.max == null ? `Acima de ${fmtN(f.min, 0)}kg` : `${fmtN(f.min, 0)}–${fmtN(f.max, 0)}kg`
}

export default function TabelaShopifyPage() {
  const supabase = useMemo(() => createClient(), [])
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [config, setConfig] = useState<ConfigTabela>(CONFIG_PADRAO)

  // Carrega config salva
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) setConfig({ ...CONFIG_PADRAO, ...JSON.parse(raw) })
    } catch { /* ignora */ }
  }, [])

  function salvarConfig(next: ConfigTabela) {
    setConfig(next)
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)) } catch { /* ignora */ }
  }

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true); setErro('')
        const { data, error } = await supabase.rpc('frete_resultado_por_produto_estado', {
          filtro_mes: null, filtro_ano: null, filtro_data_inicial: null, filtro_data_final: null,
        })
        if (error) { setErro('Não foi possível carregar os dados de frete.'); return }
        setResultados(data || [])
      } catch {
        setErro('Erro inesperado ao carregar os dados de frete.')
      } finally { setLoading(false) }
    }
    carregar()
  }, [supabase])

  // R$/kg por UF a partir do histórico real
  const porUF = useMemo(() => {
    const mapa = new Map<string, { freteTotal: number; pesoTotal: number; registros: number; prazoTotal: number; prazoRegs: number }>()
    for (const r of resultados) {
      const uf = (r.uf || '').trim().toUpperCase()
      if (!uf) continue
      if (!mapa.has(uf)) mapa.set(uf, { freteTotal: 0, pesoTotal: 0, registros: 0, prazoTotal: 0, prazoRegs: 0 })
      const a = mapa.get(uf)!
      a.freteTotal += Number(r.frete_medio || 0)
      a.pesoTotal += Number(r.peso_total_medio || 0)
      a.registros += Number(r.qtd_lancamentos || 0)
      const prazo = Number(r.prazo_medio || 0)
      if (prazo > 0) { a.prazoTotal += prazo; a.prazoRegs += 1 }
    }
    const res = new Map<string, { rkg: number | null; registros: number; prazo: number }>()
    for (const [uf, a] of mapa) {
      res.set(uf, {
        rkg: a.pesoTotal > 0 ? a.freteTotal / a.pesoTotal : null,
        registros: a.registros,
        prazo: a.prazoRegs > 0 ? a.prazoTotal / a.prazoRegs : 0,
      })
    }
    return res
  }, [resultados])

  // R$/kg global (sugestão de fallback)
  const rkgGlobal = useMemo(() => {
    let frete = 0, peso = 0
    for (const r of resultados) { frete += Number(r.frete_medio || 0); peso += Number(r.peso_total_medio || 0) }
    return peso > 0 ? frete / peso : 0
  }, [resultados])

  // Prefill do fallback com o R$/kg global na primeira carga (se ainda 0)
  useEffect(() => {
    if (rkgGlobal > 0 && config.rkgFallback === 0) {
      salvarConfig({ ...config, rkgFallback: Number(rkgGlobal.toFixed(2)) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rkgGlobal])

  function precoCelula(rkg: number | null, faixa: Faixa): number {
    const taxa = rkg ?? config.rkgFallback
    const pesoRep = config.modeloPeso === 'superior'
      ? (faixa.max ?? faixa.min + 50)               // faixa aberta: assume min + 50kg
      : (faixa.max == null ? faixa.min + 50 : (faixa.min + faixa.max) / 2)
    const bruto = Math.max(config.freteMinimo, taxa * pesoRep)
    return Math.ceil(bruto * (1 + config.margem / 100) * 100) / 100
  }

  // Linhas da tabela — todas as 27 UFs
  const linhas = useMemo(() => UFS.map(uf => {
    const d = porUF.get(uf)
    const usaFallback = !d || d.rkg == null
    const rkg = d?.rkg ?? null
    return {
      uf, nome: UF_NOME[uf], rkg, usaFallback,
      registros: d?.registros ?? 0, prazo: d?.prazo ?? 0,
      precos: config.faixas.map(f => precoCelula(rkg, f)),
    }
  }), [porUF, config])

  function exportarCSV() {
    const head = ['UF', 'Estado', 'R$/kg', 'Registros', ...config.faixas.map(rotuloFaixa)]
    const linhasCsv = linhas.map(l => [
      l.uf, l.nome, l.rkg != null ? l.rkg.toFixed(2) : '(fallback)', String(l.registros),
      ...l.precos.map(p => p.toFixed(2)),
    ])
    const csv = [head, ...linhasCsv].map(r => r.map(c => `"${c}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `tabela-frete-shopify.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Edição de faixas ──
  function atualizarFaixa(i: number, campo: 'min' | 'max', valor: string) {
    const next = config.faixas.map((f, idx) => idx === i
      ? { ...f, [campo]: valor === '' ? (campo === 'max' ? null : 0) : Number(valor) }
      : f)
    salvarConfig({ ...config, faixas: next })
  }
  function removerFaixa(i: number) {
    salvarConfig({ ...config, faixas: config.faixas.filter((_, idx) => idx !== i) })
  }
  function adicionarFaixa() {
    const ultima = config.faixas[config.faixas.length - 1]
    const novoMin = ultima ? (ultima.max ?? ultima.min + 10) : 0
    salvarConfig({ ...config, faixas: [...config.faixas, { min: novoMin, max: novoMin + 10 }] })
  }

  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
  const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 w-full'
  const label = 'block text-xs font-semibold text-slate-500 mb-1'
  const th = { padding: '10px 8px', textAlign: 'left' as const, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' as const }
  const td = { padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', whiteSpace: 'nowrap' as const }

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0b1733] to-[#1b4fd6] p-6 text-white shadow-sm">
        <h2 className="text-lg font-bold">Tabela de frete para o Shopify</h2>
        <p className="mt-1 max-w-3xl text-sm text-blue-100">
          Gera o preço de frete por estado e faixa de peso a partir do histórico real do módulo de fretes,
          já com a sua margem aplicada. Cadastre esses valores nas zonas de envio do Shopify
          (<em>Configurações → Frete e entrega → tarifas por peso</em>). Funciona no plano Basic, sem cálculo em tempo real.
        </p>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{erro}</div>}

      {/* Configuração */}
      <div className={card}>
        <p className="mb-4 font-bold text-slate-700">Parâmetros de cálculo</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={label}>Margem sobre o custo (%)</label>
            <input type="number" value={config.margem}
              onChange={e => salvarConfig({ ...config, margem: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className={label}>Frete mínimo (R$)</label>
            <input type="number" value={config.freteMinimo}
              onChange={e => salvarConfig({ ...config, freteMinimo: Number(e.target.value) })} className={input} />
          </div>
          <div>
            <label className={label}>R$/kg p/ estados sem dados</label>
            <input type="number" value={config.rkgFallback}
              onChange={e => salvarConfig({ ...config, rkgFallback: Number(e.target.value) })} className={input} />
            <p className="mt-1 text-[11px] text-slate-400">Sugestão (média geral): {fmtBRL(rkgGlobal)}/kg</p>
          </div>
          <div>
            <label className={label}>Peso de referência da faixa</label>
            <select value={config.modeloPeso}
              onChange={e => salvarConfig({ ...config, modeloPeso: e.target.value as 'superior' | 'medio' })} className={input}>
              <option value="superior">Limite superior (conservador)</option>
              <option value="medio">Ponto médio</option>
            </select>
          </div>
        </div>

        {/* Faixas de peso */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Faixas de peso (kg)</p>
            <button onClick={adicionarFaixa} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">+ Faixa</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.faixas.map((f, i) => (
              <div key={i} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                <input type="number" value={f.min} onChange={e => atualizarFaixa(i, 'min', e.target.value)}
                  className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                <span className="text-xs text-slate-400">a</span>
                <input type="number" value={f.max ?? ''} placeholder="∞" onChange={e => atualizarFaixa(i, 'max', e.target.value)}
                  className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                <span className="text-xs text-slate-400">kg</span>
                <button onClick={() => removerFaixa(i)} className="ml-1 text-slate-400 hover:text-red-600" title="Remover">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={exportarCSV} className="rounded-xl bg-[#1b4fd6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#143fb0]">Exportar CSV</button>
          <button onClick={() => salvarConfig(CONFIG_PADRAO)} className="rounded-xl bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-300">Restaurar padrão</button>
        </div>
      </div>

      {/* Tabela */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-800">Preço de frete por estado e peso</p>
            <p className="text-xs text-slate-500">{loading ? 'Carregando…' : 'Valores já com margem. Estados em laranja usam o R$/kg de fallback (sem histórico).'}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={th}>UF</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>R$/kg</th>
                <th style={{ ...th, textAlign: 'right' }}>Prazo</th>
                {config.faixas.map((f, i) => <th key={i} style={{ ...th, textAlign: 'right' }}>{rotuloFaixa(f)}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.uf} style={{ background: l.usaFallback ? '#fff7ed' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 700 }}>{l.uf}</td>
                  <td style={td}>{l.nome}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {l.rkg != null ? fmtBRL(l.rkg) : <span className="text-orange-600">fallback</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{l.prazo > 0 ? `${fmtN(l.prazo, 0)}d` : '-'}</td>
                  {l.precos.map((p, i) => (
                    <td key={i} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guia de uso */}
      <div className={card}>
        <p className="mb-3 font-bold text-slate-800">Como cadastrar no Shopify</p>
        <ol className="ml-4 list-decimal space-y-2 text-sm text-slate-600">
          <li>No Shopify: <strong>Configurações → Frete e entrega</strong> → no seu perfil de envio, clique em <strong>Gerenciar</strong> nas zonas do Brasil.</li>
          <li>Crie uma <strong>zona por estado</strong> (ou agrupe estados de custo parecido em uma zona — ex.: Sul/Sudeste juntos) usando as UFs.</li>
          <li>Em cada zona, adicione uma tarifa e escolha <strong>“Usar peso para calcular as tarifas”</strong>.</li>
          <li>Lance cada <strong>faixa de peso</strong> desta tabela com o preço da coluna correspondente ao estado.</li>
          <li>Repita para todos os estados. Atualize a tabela aqui periodicamente (ex.: mensal) e reajuste no Shopify.</li>
        </ol>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Importante (peso cubado):</strong> a tarifa do Shopify usa o <em>peso</em> do produto. Para itens volumosos e leves
          (cadeiras, móveis desmontados), cadastre no Shopify o <strong>peso cubado</strong> de cada produto
          (o maior entre peso real e peso volumétrico), senão o frete sai barato demais. As dimensões já estão no cadastro de Produtos do módulo de fretes.
        </div>
      </div>
    </div>
  )
}
