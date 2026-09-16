'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/browser-client'
import { formatCurrency, formatNumero, num } from '@/lib/producao/indicadores'
import {
  areaDaChapa, areaDaPeca, calcularAproveitamento, codigoDaPeca,
  consumoDeFita, custoM2, estimarChapas, filaPorEtapa, metrosDeFita,
  resumirAproveitamento, resumirPecas, ROTULO_STATUS, STATUS_PECA,
  type Chapa, type ChapaConsumida, type Fita, type Peca,
} from '@/lib/producao/marcenaria'
import { importarPecas } from '@/lib/producao/importar-pecas'

/**
 * Peças da ordem de marcenaria — o nível que a estofaria não tem.
 *
 * Um móvel são N painéis que passam pelas etapas em lotes. Daqui saem o
 * aproveitamento de chapa, os metros de fita e a fila de fitagem.
 */

type PecaLinha = Peca & {
  observacao: string | null
  producao_chapas: { nome: string; cor_padrao: string } | null
  producao_fitas: { nome: string; cor_padrao: string } | null
}

type ConsumoLinha = ChapaConsumida & {
  producao_chapas: { nome: string; custo_chapa: number | string | null } | null
}

const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm p-5'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const th = 'px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500'
const thNum = `${th} text-right`
const td = 'px-2 py-2 text-sm text-slate-700'
const tdNum = `${td} text-right tabular-nums`

const COR_STATUS: Record<string, string> = {
  PENDENTE: 'bg-slate-100 text-slate-600',
  CORTADA: 'bg-amber-100 text-amber-800',
  FITADA: 'bg-blue-100 text-blue-800',
  ACABADA: 'bg-purple-100 text-purple-800',
  MONTADA: 'bg-green-100 text-green-800',
  REFUGADA: 'bg-red-100 text-red-700',
}

export default function OrdemPecas({ ordemId }: { ordemId: number }) {
  const supabase = useMemo(() => createClient(), [])
  const arquivoRef = useRef<HTMLInputElement>(null)

  const [pecas, setPecas] = useState<PecaLinha[]>([])
  const [consumos, setConsumos] = useState<ConsumoLinha[]>([])
  const [chapas, setChapas] = useState<Chapa[]>([])
  const [fitas, setFitas] = useState<Fita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'erro' | 'ok'; texto: string } | null>(null)
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())
  const [filtroStatus, setFiltroStatus] = useState<string>('')

  const [nova, setNova] = useState({
    nome: '', modulo: '', chapa_id: '', comprimento_mm: '', largura_mm: '',
    quantidade: '1', codigo_fita: 'SF', fita_id: '',
  })
  const [novoConsumo, setNovoConsumo] = useState({ chapa_id: '', quantidade: '' })

  const carregar = useCallback(async () => {
    const [p, cc, c, f] = await Promise.all([
      supabase.from('producao_pecas')
        .select('*, producao_chapas(nome,cor_padrao), producao_fitas(nome,cor_padrao)')
        .eq('ordem_id', ordemId).order('modulo', { nullsFirst: false }).order('id'),
      supabase.from('producao_chapas_consumidas')
        .select('*, producao_chapas(nome,custo_chapa)')
        .eq('ordem_id', ordemId).order('id'),
      supabase.from('producao_chapas').select('*').eq('ativo', true).order('nome'),
      supabase.from('producao_fitas').select('*').eq('ativo', true).order('nome'),
    ])
    setPecas((p.data || []) as unknown as PecaLinha[])
    setConsumos((cc.data || []) as unknown as ConsumoLinha[])
    setChapas((c.data || []) as Chapa[])
    setFitas((f.data || []) as Fita[])
    setCarregando(false)
  }, [supabase, ordemId])

  useEffect(() => { carregar() }, [carregar])

  async function chamar(metodo: string, corpo: unknown, sufixo = '') {
    setSalvando(true); setMsg(null)
    const resp = await fetch(`/api/producao/ordens/${ordemId}/pecas${sufixo}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: metodo === 'DELETE' ? undefined : JSON.stringify(corpo),
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) setMsg({ tom: 'erro', texto: json.error || 'Não foi possível salvar.' })
    else await carregar()
    setSalvando(false)
    return { ok: resp.ok, json }
  }

  /* --- importar planilha -------------------------------------------------- */
  async function aoEscolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    if (!arquivo) return
    setSalvando(true); setMsg(null)

    try {
      const buffer = await arquivo.arrayBuffer()
      const pasta = XLSX.read(buffer, { type: 'array' })
      const planilha = pasta.Sheets[pasta.SheetNames[0]]
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, { defval: '' })

      const resultado = importarPecas(linhas, chapas, fitas)

      if (resultado.pecas.length === 0) {
        setMsg({ tom: 'erro', texto: resultado.avisos.join(' ') })
        setSalvando(false)
        return
      }

      const resp = await fetch(`/api/producao/ordens/${ordemId}/pecas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pecas: resultado.pecas }),
      })
      const json = await resp.json()

      if (!resp.ok) {
        setMsg({ tom: 'erro', texto: json.error || 'Falha ao importar.' })
      } else {
        const partes = [`${json.inseridas} peças importadas.`]
        if (json.ignoradas > 0) partes.push(`${json.ignoradas} linhas ignoradas.`)
        partes.push(...resultado.avisos)
        setMsg({ tom: 'ok', texto: partes.join(' ') })
        await carregar()
      }
    } catch {
      setMsg({ tom: 'erro', texto: 'Não consegui ler o arquivo. Use .xlsx, .xls ou .csv.' })
    }

    setSalvando(false)
    if (arquivoRef.current) arquivoRef.current.value = ''
  }

  async function adicionarPeca() {
    if (!nova.nome.trim() || !nova.comprimento_mm || !nova.largura_mm) {
      setMsg({ tom: 'erro', texto: 'Nome, comprimento e largura são obrigatórios.' })
      return
    }
    const { ok } = await chamar('POST', {
      nome: nova.nome.trim(),
      modulo: nova.modulo.trim() || null,
      chapa_id: nova.chapa_id || null,
      comprimento_mm: Number(nova.comprimento_mm),
      largura_mm: Number(nova.largura_mm),
      quantidade: Number(nova.quantidade) || 1,
      codigo_fita: nova.codigo_fita,
      fita_id: nova.fita_id || null,
    })
    if (ok) setNova({ ...nova, nome: '', comprimento_mm: '', largura_mm: '', quantidade: '1' })
  }

  async function avancarSelecionadas(status: string) {
    if (selecionadas.size === 0) return
    const { ok } = await chamar('PATCH', { ids: [...selecionadas], status })
    if (ok) setSelecionadas(new Set())
  }

  async function registrarConsumo() {
    if (!novoConsumo.chapa_id || !novoConsumo.quantidade) {
      setMsg({ tom: 'erro', texto: 'Escolha a chapa e informe a quantidade.' })
      return
    }
    setSalvando(true); setMsg(null)
    const resp = await fetch(`/api/producao/ordens/${ordemId}/chapas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapa_id: Number(novoConsumo.chapa_id),
        quantidade: Number(novoConsumo.quantidade),
      }),
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) setMsg({ tom: 'erro', texto: json.error || 'Não foi possível registrar.' })
    else {
      setNovoConsumo({ chapa_id: '', quantidade: '' })
      await carregar()
    }
    setSalvando(false)
  }

  async function removerConsumo(consumoId: number) {
    if (!confirm('Remover este consumo? A baixa de estoque não é estornada.')) return
    await fetch(`/api/producao/ordens/${ordemId}/chapas?consumoId=${consumoId}`, { method: 'DELETE' })
    await carregar()
  }

  /* --- derivados ---------------------------------------------------------- */
  const resumo = useMemo(() => resumirPecas(pecas), [pecas])
  const fila = useMemo(() => filaPorEtapa(pecas), [pecas])
  const aproveitamento = useMemo(
    () => calcularAproveitamento(pecas, consumos, chapas),
    [pecas, consumos, chapas]
  )
  const resumoAprov = useMemo(() => resumirAproveitamento(aproveitamento), [aproveitamento])
  const fitasUsadas = useMemo(() => consumoDeFita(pecas, fitas), [pecas, fitas])

  const visiveis = filtroStatus ? pecas.filter((p) => p.status === filtroStatus) : pecas

  // sugestão de compra: quanto de chapa esse projeto deve consumir
  const estimativas = useMemo(
    () => chapas
      .filter((c) => pecas.some((p) => p.chapa_id === c.id))
      .map((c) => ({ chapa: c, ...estimarChapas(pecas, c) })),
    [chapas, pecas]
  )

  if (carregando) {
    return <div className={card}><p className="text-sm text-slate-400">Carregando peças...</p></div>
  }

  return (
    <div className="space-y-5">
      {/* ---- resumo ---- */}
      <div className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0b1733]">Peças da Ordem</h2>
            <p className="text-xs text-slate-500">
              Painéis cortados desta OP — base do aproveitamento de chapa e da fila de fitagem
            </p>
          </div>
          <div className="flex gap-2">
            <input ref={arquivoRef} type="file" accept=".xlsx,.xls,.csv"
              onChange={aoEscolherArquivo} className="hidden" />
            <button onClick={() => arquivoRef.current?.click()} disabled={salvando}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              Importar planilha
            </button>
            {pecas.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Excluir todas as ${pecas.length} peças desta ordem?`)) {
                    chamar('DELETE', null, '?todas=1')
                  }
                }}
                className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                Limpar
              </button>
            )}
          </div>
        </div>

        {msg && (
          <p className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
            msg.tom === 'erro'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}>{msg.texto}</p>
        )}

        {pecas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm font-semibold text-slate-600">Nenhuma peça nesta ordem.</p>
            <p className="mt-1 text-xs text-slate-500">
              Importe a lista de peças do projeto (Excel ou CSV) ou cadastre abaixo.
              A planilha precisa ter ao menos as colunas <b>Nome</b>, <b>Comprimento</b> e <b>Largura</b>.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Mini label="Peças" valor={formatNumero(resumo.total, 0)} />
            <Mini label="Área útil" valor={`${formatNumero(resumo.m2, 2)} m²`} />
            <Mini label="Fita de borda" valor={`${formatNumero(resumo.metrosFita, 1)} m`}
              detalhe={`${formatNumero(resumo.pecasComFita, 0)} peças com fita`} />
            <Mini label="Furos" valor={formatNumero(resumo.furos, 0)} />
          </div>
        )}
      </div>

      {/* ---- fila por etapa ---- */}
      {pecas.length > 0 && (
        <div className={card}>
          <h2 className="mb-1 text-base font-bold text-[#0b1733]">Fila da fábrica</h2>
          <p className="mb-4 text-xs text-slate-500">
            Onde as peças estão paradas. Clique para filtrar a lista abaixo.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFiltroStatus('')}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                filtroStatus === '' ? 'bg-[#0b1733] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              Todas ({formatNumero(resumo.total, 0)})
            </button>
            {fila.map((f) => (
              <button key={f.status} onClick={() => setFiltroStatus(f.status === filtroStatus ? '' : f.status)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  filtroStatus === f.status ? 'bg-[#0b1733] text-white' : `${COR_STATUS[f.status] || 'bg-slate-100 text-slate-600'} hover:opacity-80`
                }`}>
                {f.rotulo} · {formatNumero(f.pecas, 0)}
                {f.status === 'CORTADA' && f.metrosFita > 0 && (
                  <span className="ml-1 font-normal opacity-75">({formatNumero(f.metrosFita, 0)} m de fita)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- lista ---- */}
      {pecas.length > 0 && (
        <div className={card}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[#0b1733]">
              {filtroStatus ? ROTULO_STATUS[filtroStatus] || filtroStatus : 'Todas as peças'}
              <span className="ml-2 font-normal text-slate-400">({visiveis.length} linhas)</span>
            </h2>
            {selecionadas.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{selecionadas.size} selecionadas →</span>
                {STATUS_PECA.map((s) => (
                  <button key={s} onClick={() => avancarSelecionadas(s)} disabled={salvando}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${COR_STATUS[s]} hover:opacity-80 disabled:opacity-50`}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[980px]">
              <thead className="sticky top-0 border-b border-slate-200 bg-white">
                <tr>
                  <th className={th}>
                    <input type="checkbox"
                      checked={visiveis.length > 0 && visiveis.every((p) => selecionadas.has(p.id))}
                      onChange={(e) => {
                        const novo = new Set(selecionadas)
                        visiveis.forEach((p) => e.target.checked ? novo.add(p.id) : novo.delete(p.id))
                        setSelecionadas(novo)
                      }}
                      className="h-4 w-4" />
                  </th>
                  <th className={th}>Peça</th><th className={th}>Módulo</th><th className={th}>Chapa</th>
                  <th className={thNum}>C × L (mm)</th><th className={thNum}>Qtd</th>
                  <th className={thNum}>m²</th><th className={th}>Fita</th>
                  <th className={thNum}>Metros</th><th className={th}>Status</th><th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className={td}>
                      <input type="checkbox" checked={selecionadas.has(p.id)}
                        onChange={(e) => {
                          const novo = new Set(selecionadas)
                          if (e.target.checked) novo.add(p.id); else novo.delete(p.id)
                          setSelecionadas(novo)
                        }}
                        className="h-4 w-4" />
                    </td>
                    <td className={`${td} font-semibold`}>
                      {p.nome}
                      {p.codigo && <span className="ml-1 text-xs font-normal text-slate-400">{p.codigo}</span>}
                    </td>
                    <td className={td}>{p.modulo || '—'}</td>
                    <td className={td}>
                      <select value={p.chapa_id ?? ''}
                        onChange={(e) => chamar('PATCH', { id: p.id, chapa_id: e.target.value ? Number(e.target.value) : null })}
                        className="max-w-[150px] rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-500">
                        <option value="">— definir —</option>
                        {chapas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </td>
                    <td className={tdNum}>
                      {formatNumero(num(p.comprimento_mm), 0)} × {formatNumero(num(p.largura_mm), 0)}
                    </td>
                    <td className={tdNum}>{formatNumero(num(p.quantidade), 0)}</td>
                    <td className={tdNum}>{formatNumero(areaDaPeca(p), 3)}</td>
                    <td className={td}>
                      <select value={codigoDaPeca(p) ?? 'custom'}
                        onChange={(e) => chamar('PATCH', { id: p.id, codigo_fita: e.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-500">
                        <option value="SF">SF · sem fita</option>
                        <option value="1+">1+ · 1 lado maior</option>
                        <option value="2+">2+ · 2 lados maiores</option>
                        <option value="TL">TL · todos os lados</option>
                        {codigoDaPeca(p) === null && <option value="custom">personalizada</option>}
                      </select>
                    </td>
                    <td className={tdNum}>{formatNumero(metrosDeFita(p), 2)}</td>
                    <td className={td}>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_STATUS[p.status] || 'bg-slate-100'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className={td}>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir a peça "${p.nome}"?`)) {
                            chamar('DELETE', null, `?pecaId=${p.id}`)
                          }
                        }}
                        className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- adicionar peça ---- */}
      <div className={card}>
        <h2 className="mb-4 text-base font-bold text-[#0b1733]">Adicionar peça</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })}
            placeholder="Nome da peça" className={`${input} lg:col-span-2`} />
          <input value={nova.modulo} onChange={(e) => setNova({ ...nova, modulo: e.target.value })}
            placeholder="Módulo" className={input} />
          <select value={nova.chapa_id} onChange={(e) => setNova({ ...nova, chapa_id: e.target.value })} className={input}>
            <option value="">Chapa...</option>
            {chapas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input value={nova.comprimento_mm} onChange={(e) => setNova({ ...nova, comprimento_mm: e.target.value })}
            type="number" placeholder="Compr. (mm)" className={input} />
          <input value={nova.largura_mm} onChange={(e) => setNova({ ...nova, largura_mm: e.target.value })}
            type="number" placeholder="Larg. (mm)" className={input} />
          <div className="flex gap-2">
            <input value={nova.quantidade} onChange={(e) => setNova({ ...nova, quantidade: e.target.value })}
              type="number" min="1" className={`${input} w-16`} />
            <select value={nova.codigo_fita} onChange={(e) => setNova({ ...nova, codigo_fita: e.target.value })}
              className={`${input} flex-1`}>
              <option value="SF">SF</option><option value="1+">1+</option>
              <option value="2+">2+</option><option value="TL">TL</option>
            </select>
          </div>
        </div>
        <button onClick={adicionarPeca} disabled={salvando}
          className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
          Adicionar
        </button>
      </div>

      {/* ---- chapas consumidas + aproveitamento ---- */}
      <div className={card}>
        <h2 className="mb-1 text-base font-bold text-[#0b1733]">Consumo de chapa e aproveitamento</h2>
        <p className="mb-4 text-xs text-slate-500">
          Registre quantas chapas inteiras foram usadas. O aproveitamento é a área que virou peça
          dividida pela área comprada — a diferença é a sobra do plano de corte.
        </p>

        {resumoAprov.m2Consumidos > 0 && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Mini label="Aproveitamento" valor={`${formatNumero(resumoAprov.percentual, 1)}%`}
              destaque={resumoAprov.percentual >= 80 ? 'bom' : resumoAprov.percentual >= 70 ? 'neutro' : 'ruim'} />
            <Mini label="Chapas consumidas" valor={formatNumero(resumoAprov.chapasConsumidas, 0)}
              detalhe={`${formatNumero(resumoAprov.m2Consumidos, 2)} m²`} />
            <Mini label="Sobra" valor={`${formatNumero(resumoAprov.m2Sobra, 2)} m²`} destaque="ruim" />
            <Mini label="Custo da sobra" valor={formatCurrency(resumoAprov.custoSobra)} destaque="ruim" />
          </div>
        )}

        {estimativas.length > 0 && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Estimativa de compra (peças + 15% de perda de nesting)
            </p>
            <div className="space-y-1">
              {estimativas.map((e) => (
                <p key={e.chapa.id} className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">{e.chapa.nome}</span>
                  {' — '}{formatNumero(e.m2Uteis, 2)} m² úteis →{' '}
                  <span className="font-bold text-[#1b4fd6]">{e.chapas} chapa{e.chapas === 1 ? '' : 's'}</span>
                  <span className="text-slate-400">
                    {' '}({formatNumero(areaDaChapa(e.chapa), 2)} m² cada
                    {e.chapa.custo_chapa ? `, ${formatCurrency(custoM2(e.chapa))}/m²` : ''})
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <select value={novoConsumo.chapa_id} onChange={(e) => setNovoConsumo({ ...novoConsumo, chapa_id: e.target.value })}
            className={`${input} min-w-[200px] flex-1`}>
            <option value="">Chapa usada...</option>
            {chapas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input value={novoConsumo.quantidade} onChange={(e) => setNovoConsumo({ ...novoConsumo, quantidade: e.target.value })}
            type="number" step="0.5" min="0" placeholder="Nº de chapas" className={`${input} w-36`} />
          <button onClick={registrarConsumo} disabled={salvando}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
            Registrar consumo
          </button>
        </div>

        {consumos.length > 0 && (
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>Chapa</th><th className={thNum}>Chapas</th>
                <th className={thNum}>Custo</th><th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {consumos.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className={`${td} font-semibold`}>{c.producao_chapas?.nome || `Chapa #${c.chapa_id}`}</td>
                  <td className={tdNum}>{formatNumero(num(c.quantidade), 1)}</td>
                  <td className={tdNum}>{formatCurrency(num(c.custo_total))}</td>
                  <td className={td}>
                    <button onClick={() => removerConsumo(c.id)}
                      className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {aproveitamento.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Aproveitamento por chapa</p>
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className={th}>Chapa</th><th className={thNum}>m² úteis</th>
                  <th className={thNum}>m² comprados</th><th className={thNum}>Aproveitamento</th>
                </tr>
              </thead>
              <tbody>
                {aproveitamento.map((a) => (
                  <tr key={a.chapaId ?? a.chaveChapa} className="border-b border-slate-100">
                    <td className={`${td} font-semibold`}>{a.chaveChapa}</td>
                    <td className={tdNum}>{formatNumero(a.m2Uteis, 2)}</td>
                    <td className={tdNum}>{a.m2Consumidos > 0 ? formatNumero(a.m2Consumidos, 2) : '—'}</td>
                    <td className={`${tdNum} font-bold ${
                      a.percentual === 0 ? 'text-slate-400'
                        : a.percentual >= 80 ? 'text-green-600'
                        : a.percentual >= 70 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {a.percentual > 0 ? `${formatNumero(a.percentual, 1)}%` : 'sem consumo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- fita ---- */}
      {fitasUsadas.length > 0 && (
        <div className={card}>
          <h2 className="mb-4 text-base font-bold text-[#0b1733]">Fita de borda necessária</h2>
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>Fita</th><th className={thNum}>Metros</th>
                <th className={thNum}>Peças</th><th className={thNum}>Custo</th>
              </tr>
            </thead>
            <tbody>
              {fitasUsadas.map((f) => (
                <tr key={f.fitaId ?? f.chave} className="border-b border-slate-100">
                  <td className={`${td} font-semibold`}>{f.chave}</td>
                  <td className={`${tdNum} font-semibold`}>{formatNumero(f.metros, 1)} m</td>
                  <td className={tdNum}>{formatNumero(f.pecas, 0)}</td>
                  <td className={tdNum}>{f.custo > 0 ? formatCurrency(f.custo) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Mini({ label, valor, detalhe, destaque = 'neutro' }: {
  label: string; valor: string; detalhe?: string; destaque?: 'bom' | 'neutro' | 'ruim'
}) {
  const cor = destaque === 'bom' ? 'text-green-600' : destaque === 'ruim' ? 'text-red-600' : 'text-[#0b1733]'
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-400">{detalhe}</p>}
    </div>
  )
}
