'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/browser-client'

type Tipo = 'balancete' | 'fluxo_caixa' | 'vendas' | 'contas_receber' | 'contas_pagar' | 'recebimentos' | 'pedidos' | 'vendas_produtos'

type CardEstado = {
  arquivo: File | null
  linhas: number
  estado: 'idle' | 'preview' | 'loading' | 'sucesso' | 'erro'
  mensagem: string
  alertas?: string[] // produtos/itens que precisam de atenção (ex: sem custo cadastrado)
  aviso?: string     // aviso geral da importação (ex: arquivo de vendas sem coluna de custo)
}

type Upload = {
  tipo: Tipo
  mes: number
  ano: number
  nome_arquivo: string | null
  total_linhas: number
  importado_em: string
}

type Card = {
  tipo: Tipo
  titulo: string
  descricao: string
  colunaValidacao: string
  caminho: string        // onde achar no Tiny (menu → submenu)
  colunas: string        // colunas obrigatórias a marcar na exportação
  fonteCusto?: boolean   // relatório que carrega o custo/margem
}

const CARDS: Card[] = [
  { tipo: 'balancete', titulo: 'Balancete', descricao: 'DRE completo por grupo e categoria, com valores diários e total', colunaValidacao: 'tipo',
    caminho: 'Tiny → Relatórios → Financeiro → Balancete',
    colunas: 'Colunas: Tipo · Grupo · Categoria · Total (formato diário também funciona)' },
  { tipo: 'fluxo_caixa', titulo: 'Fluxo de Caixa', descricao: 'Extrato completo de lançamentos por contato e data', colunaValidacao: 'histórico',
    caminho: 'Tiny → Relatórios → Financeiro → Entradas e Saídas por Contato',
    colunas: 'Colunas: Contato · Data · Histórico · Categoria · Valor' },
  { tipo: 'vendas', titulo: 'Relatório de Vendas', descricao: 'Faturamento e margem por cliente. Use o formato com "Fonte de Receita" para ver Corporativo / Decor / Lojista', colunaValidacao: 'cliente',
    caminho: 'Tiny → Relatórios → Vendas → Relatório de Vendas (por cliente)',
    colunas: '⚙ Marcar colunas: Fonte de Receita · Custo · Valor Lucro · % Lucro — sem elas a margem por cliente fica vazia',
    fonteCusto: true },
  { tipo: 'contas_receber', titulo: 'Contas a Receber', descricao: 'Títulos em aberto e recebidos com vencimentos', colunaValidacao: 'vencimento',
    caminho: 'Tiny → Relatórios → Financeiro → Contas a Receber',
    colunas: 'Coluna-chave: Vencimento' },
  { tipo: 'contas_pagar', titulo: 'Contas a Pagar', descricao: 'Títulos em aberto e pagos com vencimentos', colunaValidacao: 'vencimento',
    caminho: 'Tiny → Relatórios → Financeiro → Contas a Pagar',
    colunas: '⚙ Incluir a coluna Categoria (usada para corrigir as categorias do DRE)' },
  { tipo: 'recebimentos', titulo: 'Recebimentos', descricao: 'O que foi recebido por cliente, com juros, taxas e descontos', colunaValidacao: 'cliente',
    caminho: 'Tiny → Relatórios → Financeiro → Recebimentos',
    colunas: 'Colunas: Cliente · Juros · Taxas · Acréscimos · Descontos · Valor Original · Valor Recebido' },
  { tipo: 'pedidos', titulo: 'Pedidos / NFs', descricao: 'Pedidos com forma de pagamento, taxas e status de entrega', colunaValidacao: 'número',
    caminho: 'Tiny → Relatórios → Vendas → Relatório Financeiro de Vendas',
    colunas: 'Traz forma de pagamento, taxas e situação' },
  { tipo: 'vendas_produtos', titulo: 'Vendas por Produto', descricao: 'Custo e margem por produto/SKU — análise de CMV por item', colunaValidacao: 'código',
    caminho: 'Tiny → Relatórios → Vendas → Relatório de Vendas (por produto)',
    colunas: '⚙ Marcar colunas: Quantidade · Valor · Frete · Custo · Valor Lucro · % Lucro',
    fonteCusto: true },
]

const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TIPO_LABEL: Record<Tipo, string> = {
  balancete: 'Balancete',
  fluxo_caixa: 'Fluxo de Caixa',
  vendas: 'Vendas',
  contas_receber: 'Contas a Receber',
  contas_pagar: 'Contas a Pagar',
  recebimentos: 'Recebimentos',
  pedidos: 'Pedidos / NFs',
  vendas_produtos: 'Vendas por Produto',
}

async function lerXLS(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
}

function validarColunas(rows: unknown[][], coluna: string): boolean {
  if (!rows.length) return false
  const header = (rows[0] as unknown[]).map(h => String(h || '').toLowerCase())
  return header.some(h => h.includes(coluna.toLowerCase()))
}

const ESTADO_VAZIO: CardEstado = { arquivo: null, linhas: 0, estado: 'idle', mensagem: '' }

export default function ImportadorRelatorios() {
  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1)
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [uploads, setUploads] = useState<Upload[]>([])
  const [carregandoUploads, setCarregandoUploads] = useState(true)
  const [limpando, setLimpando] = useState(false)
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false)
  const [msgLimpeza, setMsgLimpeza] = useState('')

  const [cards, setCards] = useState<Record<Tipo, CardEstado>>({
    balancete: { ...ESTADO_VAZIO },
    fluxo_caixa: { ...ESTADO_VAZIO },
    vendas: { ...ESTADO_VAZIO },
    contas_receber: { ...ESTADO_VAZIO },
    contas_pagar: { ...ESTADO_VAZIO },
    recebimentos: { ...ESTADO_VAZIO },
    pedidos: { ...ESTADO_VAZIO },
    vendas_produtos: { ...ESTADO_VAZIO },
  })

  const fileInputRefs = useRef<Partial<Record<Tipo, HTMLInputElement | null>>>({})
  const supabase = createClient()

  const carregarUploads = useCallback(async () => {
    setCarregandoUploads(true)
    const { data } = await supabase
      .from('fin_uploads')
      .select('tipo,mes,ano,nome_arquivo,total_linhas,importado_em')
      .order('importado_em', { ascending: false })
      .limit(20)
    setUploads((data ?? []) as Upload[])
    setCarregandoUploads(false)
  }, [])

  useEffect(() => { carregarUploads() }, [carregarUploads])

  function ultimaImport(tipo: Tipo) {
    return uploads.find(u => u.tipo === tipo && u.mes === mesSel && u.ano === anoSel) ?? null
  }

  // Quantos relatórios já foram importados no período selecionado
  const importadosNoPeriodo = uploads.filter(u => u.mes === mesSel && u.ano === anoSel).length

  async function limparMes() {
    setLimpando(true)
    setMsgLimpeza('')
    try {
      const res = await fetch('/api/financeiro/limpar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesSel, ano: anoSel }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsgLimpeza(data.error ?? 'Erro ao limpar.')
        return
      }
      setMsgLimpeza(`${data.totalRemovidos} registro(s) removido(s) de ${MESES_NOME[mesSel - 1]}/${anoSel}.`)
      // Reseta os cards e recarrega o histórico
      setCards({
        balancete: { ...ESTADO_VAZIO },
        fluxo_caixa: { ...ESTADO_VAZIO },
        vendas: { ...ESTADO_VAZIO },
        contas_receber: { ...ESTADO_VAZIO },
        contas_pagar: { ...ESTADO_VAZIO },
        recebimentos: { ...ESTADO_VAZIO },
        pedidos: { ...ESTADO_VAZIO },
        vendas_produtos: { ...ESTADO_VAZIO },
      })
      await carregarUploads()
    } catch {
      setMsgLimpeza('Erro de conexão.')
    } finally {
      setLimpando(false)
      setConfirmarLimpeza(false)
    }
  }

  function setCard(tipo: Tipo, patch: Partial<CardEstado>) {
    setCards(prev => ({ ...prev, [tipo]: { ...prev[tipo], ...patch } }))
  }

  async function handleFile(tipo: Tipo, file: File, colunaValidacao: string) {
    setCard(tipo, { arquivo: file, estado: 'loading', mensagem: 'Lendo arquivo...' })
    try {
      const rows = await lerXLS(file)
      if (!validarColunas(rows, colunaValidacao)) {
        setCard(tipo, {
          arquivo: null, estado: 'erro',
          mensagem: `Este arquivo não parece ser o relatório de ${TIPO_LABEL[tipo]}. Verifique se exportou o relatório correto do Tiny.`,
        })
        return
      }
      const linhas = Math.max(0, rows.length - 1)
      setCard(tipo, { arquivo: file, linhas, estado: 'preview', mensagem: '' })
    } catch {
      setCard(tipo, { arquivo: null, estado: 'erro', mensagem: 'Erro ao ler o arquivo. Verifique se é um XLS/XLSX válido.' })
    }
  }

  async function importar(tipo: Tipo) {
    const est = cards[tipo]
    if (!est.arquivo) return
    setCard(tipo, { estado: 'loading', mensagem: 'Importando...' })
    try {
      const rows = await lerXLS(est.arquivo)
      const form = new FormData()
      form.append('tipo', tipo)
      form.append('mes', String(mesSel))
      form.append('ano', String(anoSel))
      form.append('nome_arquivo', est.arquivo.name)
      form.append('rows', JSON.stringify(rows))

      const res = await fetch('/api/financeiro/importar', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setCard(tipo, { estado: 'erro', mensagem: data.error ?? 'Erro ao importar.' })
        return
      }

      const alertas: string[] = data.sem_custo?.length > 0 ? data.sem_custo : []
      const aviso: string | undefined = data.aviso ?? undefined
      const temAlerta = alertas.length > 0 || !!aviso
      setCard(tipo, {
        arquivo: null,
        linhas: data.importados,
        estado: 'sucesso',
        mensagem: `${data.importados} linhas importadas com sucesso.`,
        alertas,
        aviso,
      })
      await carregarUploads()
      // Cards com alerta ficam visíveis por mais tempo para o usuário ler
      setTimeout(() => setCard(tipo, { ...ESTADO_VAZIO }), temAlerta ? 30000 : 6000)
    } catch {
      setCard(tipo, { estado: 'erro', mensagem: 'Erro de conexão.' })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-[#0b1733]">Importar Relatórios do Tiny</h1>
        <p className="mt-1 text-sm text-slate-500">
          Exporte os relatórios diretamente do Tiny ERP e importe aqui.
          Os dados do mês selecionado serão substituídos a cada reimportação.
        </p>
      </div>

      {/* Seletor de período — destaque para evitar importar no mês errado */}
      <div className="rounded-2xl border-2 border-[#1b4fd6] bg-[#eef3fb] p-4 shadow-sm">
        <p className="text-xs font-black text-[#1b4fd6] mb-1 uppercase tracking-wide">Mês de referência dos relatórios</p>
        <p className="text-xs text-slate-500 mb-3">
          Selecione o mês a que os relatórios se referem — <strong>não necessariamente o mês atual</strong>.
          Todos os arquivos importados abaixo serão vinculados a este mês.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={mesSel}
            onChange={e => setMesSel(Number(e.target.value))}
            className="rounded-xl border-2 border-[#1b4fd6] bg-white px-3 py-2 text-base font-black text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
          >
            {MESES_NOME.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={anoSel}
            onChange={e => setAnoSel(Number(e.target.value))}
            className="rounded-xl border-2 border-[#1b4fd6] bg-white px-3 py-2 text-base font-black text-[#0b1733] focus:outline-none focus:ring-2 focus:ring-[#1b4fd6]"
          >
            {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="rounded-xl bg-[#1b4fd6] px-4 py-2 text-white">
            <span className="text-xs font-semibold opacity-80">Importando para:</span>
            <span className="ml-2 text-base font-black">
              {MESES_NOME[mesSel - 1].toUpperCase()}/{anoSel}
            </span>
          </div>
        </div>

        {/* Limpar dados do mês */}
        <div className="mt-4 border-t border-blue-200 pt-3">
          {!confirmarLimpeza ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setConfirmarLimpeza(true)}
                disabled={importadosNoPeriodo === 0 || limpando}
                className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Limpar dados de {MESES_NOME[mesSel - 1]}/{anoSel}
              </button>
              <span className="text-xs text-slate-500">
                {importadosNoPeriodo > 0
                  ? `${importadosNoPeriodo} relatório(s) importado(s) neste mês`
                  : 'Nenhum relatório importado neste mês'}
              </span>
              {msgLimpeza && <span className="text-xs font-semibold text-green-600">{msgLimpeza}</span>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-3">
              <span className="text-sm font-bold text-red-700">
                Apagar TODOS os dados de {MESES_NOME[mesSel - 1]}/{anoSel}? Esta ação não pode ser desfeita.
              </span>
              <button
                onClick={limparMes}
                disabled={limpando}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {limpando ? 'Limpando...' : 'Sim, apagar tudo'}
              </button>
              <button
                onClick={() => setConfirmarLimpeza(false)}
                disabled={limpando}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards de upload */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(card => {
          const est = cards[card.tipo]
          const ultima = ultimaImport(card.tipo)

          return (
            <div key={card.tipo} className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              {/* Header do card */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-[#0b1733]">{card.titulo}</p>
                    {card.fonteCusto && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                        Fonte de custo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{card.descricao}</p>
                  <p className="text-[11px] text-slate-500 mt-1.5 font-semibold">{card.caminho}</p>
                  <p className={`text-[10px] mt-0.5 ${card.fonteCusto ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>{card.colunas}</p>
                  {card.tipo === 'fluxo_caixa' && (
                    <p className="text-[10px] text-orange-500 mt-1 font-semibold">
                      ⚠ Reimportar este mês sobrescreve reclassificações manuais de lançamentos feitas nos Indicadores.
                    </p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                  ultima ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {ultima ? 'Importado' : 'Não importado'}
                </span>
              </div>

              {ultima && (
                <p className="text-[10px] text-slate-400 -mt-2">
                  {ultima.total_linhas} linhas · {new Date(ultima.importado_em).toLocaleString('pt-BR')}
                </p>
              )}

              {/* Input de arquivo */}
              <input
                type="file"
                accept=".xls,.xlsx"
                ref={el => { fileInputRefs.current[card.tipo] = el }}
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (file) await handleFile(card.tipo, file, card.colunaValidacao)
                  e.target.value = ''
                }}
              />

              {/* Estado: idle ou erro */}
              {(est.estado === 'idle' || est.estado === 'erro') && (
                <button
                  onClick={() => fileInputRefs.current[card.tipo]?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-4 text-sm text-slate-400 hover:border-[#1b4fd6] hover:text-[#1b4fd6] transition text-center"
                >
                  Selecionar arquivo XLS
                </button>
              )}
              {est.estado === 'erro' && (
                <p className="text-xs text-red-500">{est.mensagem}</p>
              )}

              {/* Estado: preview */}
              {est.estado === 'preview' && est.arquivo && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[#eef3fb] px-4 py-3">
                    <p className="text-xs text-slate-500 truncate">📄 {est.arquivo.name}</p>
                    <p className="text-sm font-bold text-[#1b4fd6] mt-1">{est.linhas} linhas encontradas</p>
                    <p className="text-[10px] text-slate-400">Confirmar para importar em {MESES_NOME[mesSel - 1]}/{anoSel}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => importar(card.tipo)}
                      className="flex-1 rounded-xl bg-[#0b1733] px-4 py-2 text-xs font-bold text-white hover:bg-[#1b4fd6] transition"
                    >
                      Importar
                    </button>
                    <button
                      onClick={() => setCard(card.tipo, { ...ESTADO_VAZIO })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Estado: loading */}
              {est.estado === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <svg className="h-4 w-4 animate-spin text-[#1b4fd6]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {est.mensagem}
                </div>
              )}

              {/* Estado: sucesso */}
              {est.estado === 'sucesso' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-green-600">✓ {est.mensagem}</p>
                  {est.aviso && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <p className="text-xs font-black text-amber-700">⚠️ Atenção</p>
                      <p className="mt-1 text-xs text-amber-600">{est.aviso}</p>
                    </div>
                  )}
                  {est.alertas && est.alertas.length > 0 && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                      <p className="text-xs font-black text-orange-700">
                        ⚠️ {est.alertas.length} produto(s) sem custo cadastrado no Tiny:
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {est.alertas.map((a, i) => (
                          <li key={i} className="text-xs text-orange-600 font-medium">• {a}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[10px] text-orange-500">
                        Cadastre o custo desses produtos no Tiny ERP e reimporte para obter margens precisas.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Histórico de importações */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-[#0b1733]">Histórico de Importações</h2>
        <div className="mt-4 overflow-x-auto">
          {carregandoUploads ? (
            <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ) : uploads.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma importação realizada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Mês/Ano</th>
                  <th className="pb-2 pr-4">Arquivo</th>
                  <th className="pb-2 pr-4 text-right">Linhas</th>
                  <th className="pb-2 text-right">Importado em</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium">{TIPO_LABEL[u.tipo] ?? u.tipo}</td>
                    <td className="py-2 pr-4">{MESES_NOME[u.mes - 1]}/{u.ano}</td>
                    <td className="py-2 pr-4 text-slate-400 text-xs truncate max-w-[180px]">{u.nome_arquivo ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">{u.total_linhas}</td>
                    <td className="py-2 text-right text-xs text-slate-400">
                      {new Date(u.importado_em).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
