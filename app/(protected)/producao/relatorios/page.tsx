'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { createClient } from '@/lib/supabase/browser-client'
import {
  agruparPerdas, agruparVolume, calcularTempos, curvaABC,
  estatisticasTempo, evolucaoProdutividade, evolucaoTempo,
  formatCurrency, formatNumero, formatarDataBR, formatarHoras,
  montarPecas, produtividadePorFuncionario, resumirPerdas, resumoABC,
  serieMensalPerdas, serieVolume,
  type ApontamentoIndicador, type FuncionarioIndicador, type ItemIndicador,
  type OrdemIndicador, type PerdaIndicador, type RevestimentoIndicador,
} from '@/lib/producao/indicadores'

/* --------------------------------------------------------------------------
 * Paleta
 * Azul é a série de produção (mesma de /relatorios/ciclo-vendas — um indicador
 * de produção e um de vendas não devem trocar de cor entre telas).
 * Vermelho é status, não categoria: só aparece onde o dado é perda.
 * Os dois nunca dividem o mesmo gráfico.
 * Validados contra a superfície branca dos cards (≥ 3:1, ΔE CVD 29.9).
 * Classe ABC é ordinal e vive em badge de texto na tabela — encodar A/B/C em
 * tons de azul jogaria a classe C abaixo de 2:1 de contraste.
 * ------------------------------------------------------------------------ */
const COR_SERIE = '#2563eb'
const COR_PERDA = '#dc2626'
const COR_GRID = '#e2e8f0'
const COR_EIXO = '#94a3b8'
const COR_TEXTO_EIXO = '#64748b'

type Aba = 'volume' | 'abc' | 'perdas' | 'produtividade' | 'tempo'

const ABAS: { chave: Aba; label: string }[] = [
  { chave: 'volume', label: 'Volume' },
  { chave: 'abc', label: 'Curva ABC' },
  { chave: 'perdas', label: 'Perdas' },
  { chave: 'produtividade', label: 'Produtividade' },
  { chave: 'tempo', label: 'Tempo de fabricação' },
]

const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const th = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500'
const thNum = `${th} text-right`
const td = 'px-3 py-2 text-sm text-slate-700'
const tdNum = `${td} text-right tabular-nums`

/* ========================================================================== */

export default function RelatoriosProducaoPage() {
  const supabase = useMemo(() => createClient(), [])
  const [aba, setAba] = useState<Aba>('volume')
  const [carregando, setCarregando] = useState(true)

  const [ordens, setOrdens] = useState<OrdemIndicador[]>([])
  const [itens, setItens] = useState<ItemIndicador[]>([])
  const [revestimentos, setRevestimentos] = useState<RevestimentoIndicador[]>([])
  const [apontamentos, setApontamentos] = useState<ApontamentoIndicador[]>([])
  const [funcionarios, setFuncionarios] = useState<FuncionarioIndicador[]>([])
  const [perdas, setPerdas] = useState<PerdaIndicador[]>([])
  const [motivos, setMotivos] = useState<{ id: number; nome: string; categoria: string }[]>([])

  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const carregar = useCallback(async () => {
    const [o, i, r, a, f, p, m] = await Promise.all([
      supabase.from('producao_ordens')
        .select('id,numero,status,created_at,iniciada_em,concluida_em,data_prevista,responsavel'),
      supabase.from('producao_ordem_itens')
        .select('id,ordem_id,produto_id,descricao,revestimento_id,qtd_planejada,qtd_produzida,qtd_perdida,valor_unitario,custo_unitario'),
      supabase.from('producao_revestimentos').select('id,nome,cor,material'),
      supabase.from('producao_apontamentos').select('id,funcionario_id,ordem_id,data_ref,inicio,fim,horas,pecas'),
      supabase.from('producao_funcionarios').select('id,nome,funcao,jornada_horas,ativo'),
      supabase.from('producao_perdas')
        .select('id,data_ref,tipo,motivo_id,funcionario_id,ordem_item_id,quantidade,custo_estimado,recuperavel'),
      supabase.from('producao_motivos_perda').select('id,nome,categoria'),
    ])

    setOrdens((o.data || []) as OrdemIndicador[])
    setItens((i.data || []) as ItemIndicador[])
    setRevestimentos((r.data || []) as RevestimentoIndicador[])
    setApontamentos((a.data || []) as ApontamentoIndicador[])
    setFuncionarios((f.data || []) as FuncionarioIndicador[])
    setPerdas((p.data || []) as PerdaIndicador[])
    setMotivos(m.data || [])
    setCarregando(false)
  }, [supabase])

  useEffect(() => { carregar() }, [carregar])

  /* ---- filtro de período, aplicado a cada base pela sua data de referência ---- */
  const dentro = useCallback((dia: string | null) => {
    if (!dia) return false
    if (de && dia < de) return false
    if (ate && dia > ate) return false
    return true
  }, [de, ate])

  const pecas = useMemo(
    () => montarPecas(ordens, itens, revestimentos).filter((p) => dentro(p.dia)),
    [ordens, itens, revestimentos, dentro]
  )
  const perdasFiltradas = useMemo(
    () => perdas.filter((p) => dentro(p.data_ref?.slice(0, 10) || null)),
    [perdas, dentro]
  )
  const apontamentosFiltrados = useMemo(
    () => apontamentos.filter((a) => dentro(a.data_ref?.slice(0, 10) || null)),
    [apontamentos, dentro]
  )
  const tempos = useMemo(
    () => calcularTempos(ordens, itens).filter((t) => dentro(t.concluidaEm.slice(0, 10))),
    [ordens, itens, dentro]
  )

  const semDados = !carregando && pecas.length === 0 && perdasFiltradas.length === 0 && apontamentosFiltrados.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0b1733]">Indicadores de Produção</h1>
          <p className="text-sm text-slate-500">
            Volume, curva ABC, perdas, produtividade e tempo de fabricação
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">De</span>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={input} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={input} />
          </div>
          {(de || ate) && (
            <button onClick={() => { setDe(''); setAte('') }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Limpar
            </button>
          )}
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button key={a.chave} onClick={() => setAba(a.chave)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              aba === a.chave ? 'bg-[#0b1733] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}>
            {a.label}
          </button>
        ))}
      </nav>

      {carregando ? (
        <div className={card}><p className="text-sm text-slate-400">Carregando indicadores...</p></div>
      ) : semDados ? (
        <SemDados temFiltro={Boolean(de || ate)} />
      ) : (
        <>
          {aba === 'volume' && <AbaVolume pecas={pecas} />}
          {aba === 'abc' && <AbaABC pecas={pecas} />}
          {aba === 'perdas' && (
            <AbaPerdas perdas={perdasFiltradas} motivos={motivos} funcionarios={funcionarios}
              pecasProduzidas={pecas.reduce((s, p) => s + p.quantidade, 0)} />
          )}
          {aba === 'produtividade' && (
            <AbaProdutividade apontamentos={apontamentosFiltrados} funcionarios={funcionarios} />
          )}
          {aba === 'tempo' && <AbaTempo tempos={tempos} />}
        </>
      )}
    </div>
  )
}

/* ==========================================================================
 * Peças compartilhadas
 * ======================================================================== */

function SemDados({ temFiltro }: { temFiltro: boolean }) {
  return (
    <div className={card}>
      <h2 className="text-base font-bold text-[#0b1733]">Ainda não há o que medir</h2>
      {temFiltro ? (
        <p className="mt-2 text-sm text-slate-500">Nenhum registro no período selecionado. Amplie as datas ou limpe o filtro.</p>
      ) : (
        <div className="mt-2 space-y-1 text-sm text-slate-500">
          <p>Os indicadores se alimentam de três lugares:</p>
          <p>· <span className="font-semibold">Ordens</span> — itens da OP com modelo, revestimento e quantidade</p>
          <p>· <span className="font-semibold">Apontamentos</span> — horas e peças de cada estofador</p>
          <p>· <span className="font-semibold">Apontamentos → Registrar perda</span> — refugo e material estragado</p>
        </div>
      )}
    </div>
  )
}

function Tile({ label, valor, detalhe, tom = 'padrao' }: {
  label: string; valor: string; detalhe?: string; tom?: 'padrao' | 'perda' | 'bom'
}) {
  const cor = tom === 'perda' ? 'text-red-600' : tom === 'bom' ? 'text-green-600' : 'text-[#0b1733]'
  return (
    <div className={card}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-400">{detalhe}</p>}
    </div>
  )
}

type LinhaTooltip = { chave: string; valor: string }

function TooltipCartao({ titulo, linhas }: { titulo: string; linhas: LinhaTooltip[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-bold text-[#0b1733]">{titulo}</p>
      {linhas.map((l) => (
        <p key={l.chave} className="text-xs text-slate-600">
          {l.chave}: <span className="font-semibold text-slate-800">{l.valor}</span>
        </p>
      ))}
    </div>
  )
}

const eixoProps = {
  tick: { fontSize: 11, fill: COR_TEXTO_EIXO },
  stroke: COR_EIXO,
  tickLine: false,
}

function Grafico({ titulo, subtitulo, children, acao }: {
  titulo: string; subtitulo?: string; children: React.ReactElement; acao?: React.ReactNode
}) {
  return (
    <div className={card}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#0b1733]">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  )
}

function BotaoExportar({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
      Exportar XLSX
    </button>
  )
}

function exportar(nome: string, linhas: Record<string, unknown>[]) {
  const planilha = XLSX.utils.json_to_sheet(linhas)
  const pasta = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(pasta, planilha, nome.slice(0, 31))
  const buffer = XLSX.write(pasta, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }),
    `${nome}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/* ==========================================================================
 * 1. VOLUME
 * ======================================================================== */

function AbaVolume({ pecas }: { pecas: ReturnType<typeof montarPecas> }) {
  const [granularidade, setGranularidade] = useState<'dia' | 'mes' | 'ano'>('mes')

  const serie = useMemo(() => serieVolume(pecas, granularidade), [pecas, granularidade])
  const porModelo = useMemo(
    () => agruparVolume(pecas, (p) => p.modelo).sort((a, b) => b.pecas - a.pecas),
    [pecas]
  )
  const porCor = useMemo(
    () => agruparVolume(pecas, (p) => p.cor).sort((a, b) => b.pecas - a.pecas),
    [pecas]
  )

  const totalPecas = pecas.reduce((s, p) => s + p.quantidade, 0)
  const totalFaturamento = pecas.reduce((s, p) => s + p.faturamento, 0)
  const ordens = new Set(pecas.map((p) => p.ordemId)).size
  const diasComProducao = new Set(pecas.map((p) => p.dia)).size

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Peças produzidas" valor={formatNumero(totalPecas, 0)} detalhe={`${ordens} ordens concluídas`} />
        <Tile label="Faturamento" valor={formatCurrency(totalFaturamento)} />
        <Tile label="Média por dia produtivo" valor={formatNumero(diasComProducao ? totalPecas / diasComProducao : 0, 1)}
          detalhe={`${diasComProducao} dias com produção`} />
        <Tile label="Modelos diferentes" valor={formatNumero(porModelo.length, 0)}
          detalhe={`${porCor.length} cores de revestimento`} />
      </div>

      <Grafico
        titulo="Volume de produção"
        subtitulo="Peças contadas no dia em que a ordem foi concluída"
        acao={
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {(['dia', 'mes', 'ano'] as const).map((g) => (
              <button key={g} onClick={() => setGranularidade(g)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  granularidade === g ? 'bg-white text-[#0b1733] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {g === 'dia' ? 'Dia' : g === 'mes' ? 'Mês' : 'Ano'}
              </button>
            ))}
          </div>
        }
      >
        <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} vertical={false} />
          <XAxis dataKey="rotulo" {...eixoProps} />
          <YAxis {...eixoProps} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(37,99,235,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof serie)[number]
              return <TooltipCartao titulo={d.rotulo} linhas={[
                { chave: 'Peças', valor: formatNumero(d.pecas, 0) },
                { chave: 'Ordens', valor: formatNumero(d.ordens, 0) },
                { chave: 'Faturamento', valor: formatCurrency(d.faturamento) },
              ]} />
            }}
          />
          <Bar dataKey="pecas" fill={COR_SERIE} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </Grafico>

      <div className="grid gap-5 xl:grid-cols-2">
        <TabelaVolume titulo="Por modelo" chave="Modelo" grupos={porModelo} nomeArquivo="volume-por-modelo" />
        <TabelaVolume titulo="Por cor do revestimento" chave="Cor" grupos={porCor} nomeArquivo="volume-por-cor" />
      </div>
    </div>
  )
}

function TabelaVolume({ titulo, chave, grupos, nomeArquivo }: {
  titulo: string
  chave: string
  grupos: ReturnType<typeof agruparVolume>
  nomeArquivo: string
}) {
  const total = grupos.reduce((s, g) => s + g.pecas, 0)

  return (
    <div className={card}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-[#0b1733]">{titulo}</h2>
        <BotaoExportar onClick={() => exportar(nomeArquivo, grupos.map((g) => ({
          [chave]: g.chave,
          Peças: g.pecas,
          'Peças perdidas': g.perdidas,
          Faturamento: g.faturamento,
          Ordens: g.ordens,
        })))} />
      </div>
      {grupos.length === 0 ? (
        <p className="text-sm text-slate-400">Sem produção no período.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 border-b border-slate-200 bg-white">
              <tr>
                <th className={th}>{chave}</th>
                <th className={thNum}>Peças</th>
                <th className={thNum}>% do total</th>
                <th className={thNum}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.chave} className="border-b border-slate-100">
                  <td className={`${td} font-semibold`}>{g.chave}</td>
                  <td className={tdNum}>{formatNumero(g.pecas, 0)}</td>
                  <td className={tdNum}>{total > 0 ? `${formatNumero((g.pecas / total) * 100, 1)}%` : '—'}</td>
                  <td className={tdNum}>{formatCurrency(g.faturamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
 * 2. CURVA ABC — modelos por faturamento
 * ======================================================================== */

const BADGE_CLASSE: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-[#0b1733] text-white',
  B: 'bg-slate-200 text-slate-700',
  C: 'bg-slate-100 text-slate-500',
}

function AbaABC({ pecas }: { pecas: ReturnType<typeof montarPecas> }) {
  const linhas = useMemo(() => curvaABC(pecas), [pecas])
  const resumo = useMemo(() => resumoABC(linhas), [linhas])

  // o gráfico mostra o topo; a cauda longa fica na tabela abaixo
  const topo = linhas.slice(0, 15)

  if (linhas.length === 0) {
    return (
      <div className={card}>
        <h2 className="text-base font-bold text-[#0b1733]">Sem faturamento no período</h2>
        <p className="mt-2 text-sm text-slate-500">
          A curva ABC ranqueia modelos por faturamento. Os itens das ordens precisam ter
          valor unitário preenchido — ele vem do pedido ou do preço do produto.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {resumo.map((r) => (
          <div key={r.classe} className={card}>
            <div className="flex items-center gap-2">
              <span className={`rounded-lg px-2 py-0.5 text-xs font-black ${BADGE_CLASSE[r.classe]}`}>
                Classe {r.classe}
              </span>
              <span className="text-xs text-slate-400">
                {r.classe === 'A' ? 'até 80% da receita' : r.classe === 'B' ? '80% a 95%' : 'últimos 5%'}
              </span>
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums text-[#0b1733]">
              {formatNumero(r.modelos, 0)}
              <span className="ml-1 text-base font-semibold text-slate-400">
                {r.modelos === 1 ? 'modelo' : 'modelos'}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatCurrency(r.faturamento)} · {formatNumero(r.percentual, 1)}% da receita · {formatNumero(r.pecas, 0)} peças
            </p>
          </div>
        ))}
      </div>

      <Grafico titulo="Faturamento por modelo" subtitulo={`Os ${topo.length} maiores, em ordem decrescente`}>
        <BarChart data={topo} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} horizontal={false} />
          <XAxis type="number" {...eixoProps} axisLine={false}
            tickFormatter={(v: number) => `R$ ${formatNumero(v / 1000, 0)}k`} />
          <YAxis type="category" dataKey="modelo" width={170} {...eixoProps} axisLine={false}
            tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)} />
          <Tooltip
            cursor={{ fill: 'rgba(37,99,235,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof topo)[number]
              return <TooltipCartao titulo={`${d.posicao}. ${d.modelo}`} linhas={[
                { chave: 'Classe', valor: d.classe },
                { chave: 'Faturamento', valor: formatCurrency(d.faturamento) },
                { chave: 'Participação', valor: `${formatNumero(d.percentual, 1)}%` },
                { chave: 'Acumulado', valor: `${formatNumero(d.acumulado, 1)}%` },
                { chave: 'Peças', valor: formatNumero(d.pecas, 0) },
              ]} />
            }}
          />
          <Bar dataKey="faturamento" fill={COR_SERIE} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </Grafico>

      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0b1733]">Classificação completa</h2>
            <p className="text-xs text-slate-500">
              A classe vem do faturamento acumulado: A até 80%, B até 95%, C o restante
            </p>
          </div>
          <BotaoExportar onClick={() => exportar('curva-abc', linhas.map((l) => ({
            Posição: l.posicao, Modelo: l.modelo, Classe: l.classe,
            Peças: l.pecas, Faturamento: l.faturamento, Custo: l.custo, Margem: l.margem,
            'Participação %': Number(l.percentual.toFixed(2)),
            'Acumulado %': Number(l.acumulado.toFixed(2)),
          })))} />
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[720px]">
            <thead className="sticky top-0 border-b border-slate-200 bg-white">
              <tr>
                <th className={th}>#</th><th className={th}>Modelo</th><th className={th}>Classe</th>
                <th className={thNum}>Peças</th><th className={thNum}>Faturamento</th>
                <th className={thNum}>Margem</th><th className={thNum}>%</th><th className={thNum}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.modelo} className="border-b border-slate-100">
                  <td className={`${td} text-slate-400`}>{l.posicao}</td>
                  <td className={`${td} font-semibold`}>{l.modelo}</td>
                  <td className={td}>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-black ${BADGE_CLASSE[l.classe]}`}>{l.classe}</span>
                  </td>
                  <td className={tdNum}>{formatNumero(l.pecas, 0)}</td>
                  <td className={tdNum}>{formatCurrency(l.faturamento)}</td>
                  <td className={tdNum}>{formatCurrency(l.margem)}</td>
                  <td className={tdNum}>{formatNumero(l.percentual, 1)}%</td>
                  <td className={`${tdNum} font-semibold`}>{formatNumero(l.acumulado, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
 * 3. PERDAS
 * ======================================================================== */

function AbaPerdas({ perdas, motivos, funcionarios, pecasProduzidas }: {
  perdas: PerdaIndicador[]
  motivos: { id: number; nome: string; categoria: string }[]
  funcionarios: FuncionarioIndicador[]
  pecasProduzidas: number
}) {
  const nomeMotivo = useMemo(() => new Map(motivos.map((m) => [m.id, m.nome])), [motivos])
  const categoriaMotivo = useMemo(() => new Map(motivos.map((m) => [m.id, m.categoria])), [motivos])
  const nomeFuncionario = useMemo(() => new Map(funcionarios.map((f) => [f.id, f.nome])), [funcionarios])

  const resumo = useMemo(() => resumirPerdas(perdas, pecasProduzidas), [perdas, pecasProduzidas])
  const porMotivo = useMemo(
    () => agruparPerdas(perdas, (p) => nomeMotivo.get(p.motivo_id ?? -1) || 'Sem motivo'),
    [perdas, nomeMotivo]
  )
  const porCategoria = useMemo(
    () => agruparPerdas(perdas, (p) => categoriaMotivo.get(p.motivo_id ?? -1) || 'sem categoria'),
    [perdas, categoriaMotivo]
  )
  const porResponsavel = useMemo(
    () => agruparPerdas(perdas.filter((p) => p.funcionario_id),
      (p) => nomeFuncionario.get(p.funcionario_id!) || '—'),
    [perdas, nomeFuncionario]
  )
  const mensal = useMemo(() => serieMensalPerdas(perdas), [perdas])

  if (perdas.length === 0) {
    return (
      <div className={card}>
        <h2 className="text-base font-bold text-[#0b1733]">Nenhuma perda registrada no período</h2>
        <p className="mt-2 text-sm text-slate-500">
          Registre em <span className="font-semibold">Apontamentos → Registrar perda</span>.
          Perda sem registro não some do custo — só some do relatório.
        </p>
      </div>
    )
  }

  // acumulado do Pareto fica na tabela, não como segundo eixo do gráfico
  let acumulado = 0
  const paretoComAcumulado = porMotivo.map((m) => {
    acumulado += m.percentual
    return { ...m, acumulado }
  })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Custo total das perdas" valor={formatCurrency(resumo.custoTotal)}
          detalhe={`${resumo.ocorrencias} ocorrências`} tom="perda" />
        <Tile label="Taxa de refugo" valor={`${formatNumero(resumo.taxaRefugo, 2)}%`}
          detalhe={`${formatNumero(resumo.pecasRefugadas, 0)} peças de ${formatNumero(pecasProduzidas + resumo.pecasRefugadas, 0)}`}
          tom="perda" />
        <Tile label="Perda definitiva (sucata)" valor={formatCurrency(resumo.custoSucata)} tom="perda" />
        <Tile label="Recuperável (retrabalho)" valor={formatCurrency(resumo.custoRecuperavel)}
          detalhe="custa hora, não material" />
      </div>

      <Grafico titulo="Onde o dinheiro está sendo perdido"
        subtitulo="Motivos ordenados por custo — atacar os primeiros resolve a maior parte">
        <BarChart data={porMotivo.slice(0, 12)} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} horizontal={false} />
          <XAxis type="number" {...eixoProps} axisLine={false}
            tickFormatter={(v: number) => `R$ ${formatNumero(v, 0)}`} />
          <YAxis type="category" dataKey="chave" width={190} {...eixoProps} axisLine={false}
            tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
          <Tooltip
            cursor={{ fill: 'rgba(220,38,38,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof porMotivo)[number]
              return <TooltipCartao titulo={d.chave} linhas={[
                { chave: 'Custo', valor: formatCurrency(d.custo) },
                { chave: 'Ocorrências', valor: formatNumero(d.ocorrencias, 0) },
                { chave: 'Participação', valor: `${formatNumero(d.percentual, 1)}%` },
              ]} />
            }}
          />
          <Bar dataKey="custo" fill={COR_PERDA} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </Grafico>

      {mensal.length > 1 && (
        <Grafico titulo="Evolução do custo de perdas" subtitulo="Por mês do registro">
          <LineChart data={mensal} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COR_GRID} vertical={false} />
            <XAxis dataKey="rotulo" {...eixoProps} />
            <YAxis {...eixoProps} axisLine={false} tickFormatter={(v: number) => `R$ ${formatNumero(v, 0)}`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as (typeof mensal)[number]
                return <TooltipCartao titulo={d.rotulo} linhas={[
                  { chave: 'Custo', valor: formatCurrency(d.custo) },
                  { chave: 'Ocorrências', valor: formatNumero(d.ocorrencias, 0) },
                ]} />
              }}
            />
            <Line type="monotone" dataKey="custo" stroke={COR_PERDA} strokeWidth={2}
              dot={{ r: 4, fill: COR_PERDA, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </Grafico>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className={card}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0b1733]">Pareto dos motivos</h2>
            <BotaoExportar onClick={() => exportar('perdas-por-motivo', paretoComAcumulado.map((m) => ({
              Motivo: m.chave, Ocorrências: m.ocorrencias, Quantidade: m.quantidade,
              Custo: m.custo,
              '% do custo': Number(m.percentual.toFixed(2)),
              'Acumulado %': Number(m.acumulado.toFixed(2)),
            })))} />
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[420px]">
              <thead className="sticky top-0 border-b border-slate-200 bg-white">
                <tr>
                  <th className={th}>Motivo</th><th className={thNum}>Ocorr.</th>
                  <th className={thNum}>Custo</th><th className={thNum}>Acum.</th>
                </tr>
              </thead>
              <tbody>
                {paretoComAcumulado.map((m) => (
                  <tr key={m.chave} className="border-b border-slate-100">
                    <td className={`${td} font-semibold`}>{m.chave}</td>
                    <td className={tdNum}>{formatNumero(m.ocorrencias, 0)}</td>
                    <td className={`${tdNum} text-red-600`}>{formatCurrency(m.custo)}</td>
                    <td className={`${tdNum} font-semibold`}>{formatNumero(m.acumulado, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <div className={card}>
            <h2 className="mb-4 text-base font-bold text-[#0b1733]">Por categoria</h2>
            <table className="w-full">
              <tbody>
                {porCategoria.map((c) => (
                  <tr key={c.chave} className="border-b border-slate-100">
                    <td className={`${td} font-semibold capitalize`}>{c.chave}</td>
                    <td className={tdNum}>{formatNumero(c.ocorrencias, 0)}×</td>
                    <td className={`${tdNum} text-red-600`}>{formatCurrency(c.custo)}</td>
                    <td className={tdNum}>{formatNumero(c.percentual, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {porResponsavel.length > 0 && (
            <div className={card}>
              <h2 className="mb-1 text-base font-bold text-[#0b1733]">Por responsável</h2>
              <p className="mb-3 text-xs text-slate-500">
                Só das perdas em que alguém foi informado — serve para treinar, não para punir
              </p>
              <table className="w-full">
                <tbody>
                  {porResponsavel.map((r) => (
                    <tr key={r.chave} className="border-b border-slate-100">
                      <td className={`${td} font-semibold`}>{r.chave}</td>
                      <td className={tdNum}>{formatNumero(r.ocorrencias, 0)}×</td>
                      <td className={`${tdNum} text-red-600`}>{formatCurrency(r.custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
 * 4. PRODUTIVIDADE
 * ======================================================================== */

function AbaProdutividade({ apontamentos, funcionarios }: {
  apontamentos: ApontamentoIndicador[]
  funcionarios: FuncionarioIndicador[]
}) {
  const linhas = useMemo(
    () => produtividadePorFuncionario(apontamentos, funcionarios),
    [apontamentos, funcionarios]
  )
  const mensal = useMemo(() => evolucaoProdutividade(apontamentos, 'mes'), [apontamentos])

  if (linhas.length === 0) {
    return (
      <div className={card}>
        <h2 className="text-base font-bold text-[#0b1733]">Nenhum apontamento no período</h2>
        <p className="mt-2 text-sm text-slate-500">
          Peças por hora precisa de horas trabalhadas. Registre em{' '}
          <span className="font-semibold">Apontamentos</span> — pelo cronômetro do tablet
          ou pelo lançamento diário do encarregado.
        </p>
      </div>
    )
  }

  const totalPecas = linhas.reduce((s, l) => s + l.pecas, 0)
  const totalHoras = linhas.reduce((s, l) => s + l.horas, 0)
  const mediaOcupacao = linhas.reduce((s, l) => s + l.ocupacao, 0) / linhas.length

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Peças por hora (equipe)" valor={formatNumero(totalHoras > 0 ? totalPecas / totalHoras : 0, 2)}
          detalhe={`${formatNumero(totalPecas, 0)} peças em ${formatNumero(totalHoras, 0)} h`} />
        <Tile label="Peças por dia (equipe)"
          valor={formatNumero(linhas.reduce((s, l) => s + l.pecasPorDia, 0), 1)}
          detalhe="soma das médias diárias" />
        <Tile label="Estofadores com apontamento" valor={formatNumero(linhas.length, 0)} />
        <Tile label="Ocupação média" valor={`${formatNumero(mediaOcupacao, 0)}%`}
          detalhe="horas apontadas sobre a jornada" tom={mediaOcupacao >= 75 ? 'bom' : 'padrao'} />
      </div>

      <Grafico titulo="Peças por hora, por estofador"
        subtitulo="Só conta hora efetivamente apontada na peça">
        <BarChart data={linhas} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRID} horizontal={false} />
          <XAxis type="number" {...eixoProps} axisLine={false} />
          <YAxis type="category" dataKey="nome" width={150} {...eixoProps} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(37,99,235,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof linhas)[number]
              return <TooltipCartao titulo={d.nome} linhas={[
                { chave: 'Peças/hora', valor: formatNumero(d.pecasPorHora, 2) },
                { chave: 'Peças/dia', valor: formatNumero(d.pecasPorDia, 1) },
                { chave: 'Total de peças', valor: formatNumero(d.pecas, 0) },
                { chave: 'Horas apontadas', valor: formatNumero(d.horas, 1) },
                { chave: 'Dias trabalhados', valor: formatNumero(d.dias, 0) },
              ]} />
            }}
          />
          <Bar dataKey="pecasPorHora" fill={COR_SERIE} radius={[0, 4, 4, 0]} maxBarSize={24} />
        </BarChart>
      </Grafico>

      {mensal.length > 1 && (
        <Grafico titulo="Evolução da produtividade" subtitulo="Peças por hora da equipe, por mês">
          <LineChart data={mensal} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COR_GRID} vertical={false} />
            <XAxis dataKey="rotulo" {...eixoProps} />
            <YAxis {...eixoProps} axisLine={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as (typeof mensal)[number]
                return <TooltipCartao titulo={d.rotulo} linhas={[
                  { chave: 'Peças/hora', valor: formatNumero(d.pecasPorHora, 2) },
                  { chave: 'Peças', valor: formatNumero(d.pecas, 0) },
                  { chave: 'Horas', valor: formatNumero(d.horas, 1) },
                ]} />
              }}
            />
            <Line type="monotone" dataKey="pecasPorHora" stroke={COR_SERIE} strokeWidth={2}
              dot={{ r: 4, fill: COR_SERIE, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </Grafico>
      )}

      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0b1733]">Detalhe por estofador</h2>
            <p className="text-xs text-slate-500">
              Peças/dia usa dias com apontamento, não dias de calendário — falta e férias não derrubam a média
            </p>
          </div>
          <BotaoExportar onClick={() => exportar('produtividade', linhas.map((l) => ({
            Estofador: l.nome, Função: l.funcao, Peças: l.pecas,
            Horas: Number(l.horas.toFixed(2)), Dias: l.dias,
            'Peças/hora': Number(l.pecasPorHora.toFixed(3)),
            'Peças/dia': Number(l.pecasPorDia.toFixed(2)),
            'Horas/dia': Number(l.horasPorDia.toFixed(2)),
            'Ocupação %': Number(l.ocupacao.toFixed(1)),
          })))} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>Estofador</th><th className={th}>Função</th>
                <th className={thNum}>Peças</th><th className={thNum}>Horas</th><th className={thNum}>Dias</th>
                <th className={thNum}>Peças/h</th><th className={thNum}>Peças/dia</th>
                <th className={thNum}>h/dia</th><th className={thNum}>Ocupação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.funcionarioId} className="border-b border-slate-100">
                  <td className={`${td} font-semibold`}>{l.nome}</td>
                  <td className={td}>{l.funcao}</td>
                  <td className={tdNum}>{formatNumero(l.pecas, 0)}</td>
                  <td className={tdNum}>{formatNumero(l.horas, 1)}</td>
                  <td className={tdNum}>{formatNumero(l.dias, 0)}</td>
                  <td className={`${tdNum} font-bold text-[#1b4fd6]`}>{formatNumero(l.pecasPorHora, 2)}</td>
                  <td className={`${tdNum} font-semibold`}>{formatNumero(l.pecasPorDia, 1)}</td>
                  <td className={tdNum}>{formatNumero(l.horasPorDia, 1)}</td>
                  <td className={tdNum}>{formatNumero(l.ocupacao, 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
 * 5. TEMPO DE FABRICAÇÃO
 * ======================================================================== */

function AbaTempo({ tempos }: { tempos: ReturnType<typeof calcularTempos> }) {
  const stats = useMemo(() => estatisticasTempo(tempos), [tempos])
  const mensal = useMemo(() => evolucaoTempo(tempos), [tempos])

  if (tempos.length === 0) {
    return (
      <div className={card}>
        <h2 className="text-base font-bold text-[#0b1733]">Nenhuma ordem concluída no período</h2>
        <p className="mt-2 text-sm text-slate-500">
          O tempo de fabricação é medido da geração da OP até a conclusão. Ordens ainda
          em andamento não entram — o relógio delas não parou.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Tempo mediano (OP → fim)" valor={formatarHoras(stats.medianaLeadTime)}
          detalhe={`${stats.quantidade} ordens concluídas`} />
        <Tile label="Tempo na fila" valor={formatarHoras(stats.medianaFila)}
          detalhe="da geração até a primeira etapa" />
        <Tile label="Tempo de execução" valor={formatarHoras(stats.medianaExecucao)}
          detalhe="do início até a conclusão" />
        <Tile label="Entregas no prazo" valor={`${formatNumero(stats.percentualNoPrazo, 0)}%`}
          tom={stats.percentualNoPrazo >= 80 ? 'bom' : 'padrao'}
          detalhe="ordens com data prevista" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Média (sensível a outlier)" valor={formatarHoras(stats.mediaLeadTime)} />
        <Tile label="9 em cada 10 saem em até" valor={formatarHoras(stats.p90LeadTime)} />
        <Tile label="Horas de execução por peça" valor={formatNumero(stats.horasPorPeca, 1)} />
      </div>

      {mensal.length > 1 && (
        <Grafico titulo="Evolução do tempo de fabricação"
          subtitulo="Mediana em dias, pelo mês em que a ordem foi concluída">
          <LineChart data={mensal} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={COR_GRID} vertical={false} />
            <XAxis dataKey="rotulo" {...eixoProps} />
            <YAxis {...eixoProps} axisLine={false} tickFormatter={(v: number) => `${formatNumero(v, 0)}d`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as (typeof mensal)[number]
                return <TooltipCartao titulo={d.rotulo} linhas={[
                  { chave: 'Mediana', valor: `${formatNumero(d.medianaDias, 1)} dias` },
                  { chave: 'Ordens', valor: formatNumero(d.ordens, 0) },
                ]} />
              }}
            />
            <Line type="monotone" dataKey="medianaDias" stroke={COR_SERIE} strokeWidth={2}
              dot={{ r: 4, fill: COR_SERIE, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </Grafico>
      )}

      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0b1733]">Ordens concluídas</h2>
            <p className="text-xs text-slate-500">
              Fila alta com execução baixa significa OP parada esperando, não fábrica lenta
            </p>
          </div>
          <BotaoExportar onClick={() => exportar('tempo-de-fabricacao', tempos.map((t) => ({
            OP: t.numero, Responsável: t.responsavel,
            'Concluída em': formatarDataBR(t.concluidaEm), Peças: t.pecas,
            'Lead time (dias)': Number((t.leadTimeHoras / 24).toFixed(2)),
            'Fila (dias)': Number((t.filaHoras / 24).toFixed(2)),
            'Execução (dias)': Number((t.execucaoHoras / 24).toFixed(2)),
            'No prazo': t.noPrazo === null ? 'sem prazo' : t.noPrazo ? 'sim' : 'não',
          })))} />
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[760px]">
            <thead className="sticky top-0 border-b border-slate-200 bg-white">
              <tr>
                <th className={th}>OP</th><th className={th}>Responsável</th><th className={th}>Concluída</th>
                <th className={thNum}>Peças</th><th className={thNum}>Lead time</th>
                <th className={thNum}>Fila</th><th className={thNum}>Execução</th><th className={th}>Prazo</th>
              </tr>
            </thead>
            <tbody>
              {tempos.map((t) => (
                <tr key={t.ordemId} className="border-b border-slate-100">
                  <td className={`${td} font-semibold`}>{t.numero}</td>
                  <td className={td}>{t.responsavel}</td>
                  <td className={td}>{formatarDataBR(t.concluidaEm)}</td>
                  <td className={tdNum}>{formatNumero(t.pecas, 0)}</td>
                  <td className={`${tdNum} font-semibold`}>{formatarHoras(t.leadTimeHoras)}</td>
                  <td className={tdNum}>{formatarHoras(t.filaHoras)}</td>
                  <td className={tdNum}>{formatarHoras(t.execucaoHoras)}</td>
                  <td className={td}>
                    {t.noPrazo === null ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : t.noPrazo ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">no prazo</span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">atrasada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
