'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/browser-client'

type LinhaImportada = {
  data_contato: string | null
  tipo_contato: string | null
  vendedor: string | null
  nome_cliente: string
  nome_empresa: string | null
  telefone: string | null
  uf: string | null
  produto_interesse: string | null
  valor_orcamento: number | null
  valor_frete: number | null
  status: string | null
  data_retorno: string | null
  data_fechamento: string | null
  data_finalizacao: string | null
  observacoes: string | null
}

function normalizarTexto(valor: unknown) {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizarCabecalho(valor: unknown) {
  return normalizarTexto(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function excelSerialToDate(value: number): string | null {
  if (!Number.isFinite(value)) return null

  const parsed = XLSX.SSF.parse_date_code(value)
  if (!parsed) return null

  const ano = String(parsed.y).padStart(4, '0')
  const mes = String(parsed.m).padStart(2, '0')
  const dia = String(parsed.d).padStart(2, '0')

  return `${ano}-${mes}-${dia}`
}

function parseDateBR(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return excelSerialToDate(value)
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const ano = value.getFullYear()
    const mes = String(value.getMonth() + 1).padStart(2, '0')
    const dia = String(value.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  const raw = normalizarTexto(value)
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToDate(Number(raw))
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!match) return null

  const dia = match[1].padStart(2, '0')
  const mes = match[2].padStart(2, '0')
  let ano = match[3] || new Date().getFullYear().toString()

  if (ano.length === 2) {
    ano = `20${ano}`
  }

  return `${ano}-${mes}-${dia}`
}

function parseCurrencyBR(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const raw = normalizarTexto(value)
  if (!raw || raw.toUpperCase() === 'X' || raw === '###') return null

  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')

  let cleaned = raw.replace(/R\$/gi, '').trim()

  if (hasComma && hasDot) {
    // ex.: 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (hasComma && !hasDot) {
    // ex.: 1234,56
    cleaned = cleaned.replace(',', '.')
  }
  // se vier como 1234.56, mantém
  // se vier como 1234, mantém

  cleaned = cleaned.replace(/[^\d.-]/g, '')

  if (!cleaned) return null

  const number = Number(cleaned)
  return Number.isNaN(number) ? null : number
}

function parseTelefone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function getValue(row: Record<string, unknown>, ...possibleHeaders: string[]) {
  for (const key of Object.keys(row)) {
    const normalizedKey = normalizarCabecalho(key)
    if (possibleHeaders.includes(normalizedKey)) {
      return row[key]
    }
  }
  return null
}

function chunkArray<T>(array: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Normaliza um status para maiúsculas e remove acentos
 */
function normalizarStatus(status?: string | null): string {
  return String(status || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Verifica se um status é de venda fechada (FECHADO ou PEDIDO)
 */
function isVendaFechada(status?: string | null): boolean {
  if (!status) return false
  const normalizado = normalizarStatus(status)
  return normalizado === 'FECHADO' || normalizado === 'PEDIDO'
}

/**
 * Verifica se um status é de cancelamento (CANCELADO, LICITAÇÃO, FORNECEDOR, DESQUALIFICADO)
 */
function isCancelamento(status?: string | null): boolean {
  if (!status) return false
  const normalizado = normalizarStatus(status)
  return ['CANCELADO', 'LICITACAO', 'LICITA', 'FORNECEDOR', 'DESQUALIFICADO'].includes(normalizado)
}

export default function ImportacaoLeadsManager() {
  const supabase = useMemo(() => createClient(), [])

  const [arquivoNome, setArquivoNome] = useState('')
  const [linhas, setLinhas] = useState<LinhaImportada[]>([])
  const [loading, setLoading] = useState(false)
  const [importando, setImportando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  async function handleArquivo(file: File) {
    setLoading(true)
    setErro('')
    setMensagem('')
    setArquivoNome(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
      })

      const primeiraAba = workbook.SheetNames[0]

      if (!primeiraAba) {
        setErro('A planilha não possui abas válidas.')
        setLoading(false)
        return
      }

      const worksheet = workbook.Sheets[primeiraAba]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
        raw: true,
      })

      const mapeadas: LinhaImportada[] = json
        .map((row) => {
          const nomeCliente = normalizarTexto(
            getValue(row, 'nome do cliente', 'cliente', 'nome cliente')
          )

          return {
            data_contato: parseDateBR(
              getValue(row, 'data do contato', 'data contato')
            ),
            tipo_contato: normalizarTexto(
              getValue(row, 'tipo de contato', 'tipo contato')
            ) || null,
            vendedor: normalizarTexto(
              getValue(row, 'vendedor')
            ) || null,
            nome_cliente: nomeCliente,
            nome_empresa: normalizarTexto(
              getValue(row, 'nome da empresa', 'empresa', 'nome empresa')
            ) || null,
            telefone: parseTelefone(
              getValue(row, 'telefone', 'fone', 'celular')
            ),
            uf: normalizarTexto(
              getValue(row, 'uf', 'estado')
            ) || null,
            produto_interesse: normalizarTexto(
              getValue(row, 'produto de interesse', 'produto interesse', 'produto')
            ) || null,
            valor_orcamento: parseCurrencyBR(
              getValue(row, 'valor orcamento', 'valor orçamento', 'orcamento', 'orçamento')
            ),
            valor_frete: parseCurrencyBR(
              getValue(row, 'valor do frete', 'valor frete', 'frete')
            ),
            status: normalizarTexto(
              getValue(row, 'status')
            ) || null,
            data_retorno: parseDateBR(
              getValue(row, 'data')
            ),
            data_fechamento: null,
            data_finalizacao: null,
            observacoes: normalizarTexto(
              getValue(row, 'obs', 'obs:', 'observacoes', 'observações')
            ) || null,
          }
        })
        .filter((item) => item.tipo_contato || item.telefone || item.nome_cliente)

      setLinhas(mapeadas)
      setMensagem(`${mapeadas.length} linhas prontas para importar.`)
    } catch (e) {
      console.error(e)
      setErro('Não foi possível ler a planilha.')
    }

    setLoading(false)
  }

  async function handleImportar() {
    if (linhas.length === 0) {
      alert('Nenhuma linha para importar.')
      return
    }

    setImportando(true)
    setErro('')
    setMensagem('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setErro('Usuário não autenticado.')
      setImportando(false)
      return
    }

    const payload = linhas.map((linha) => {
      const dataPlanilha = linha.data_retorno

      let data_retorno: string | null = dataPlanilha
      let data_fechamento: string | null = null
      let data_cancelamento: string | null = null
      let data_finalizacao: string | null = null

      if (isVendaFechada(linha.status)) {
        data_retorno = null
        data_fechamento = dataPlanilha
      }

      if (isCancelamento(linha.status)) {
        data_retorno = null
        data_cancelamento = normalizarStatus(linha.status) === 'CANCELADO' ? dataPlanilha : null
        data_finalizacao = dataPlanilha
      }

      return {
        user_id: user.id,
        data_contato: linha.data_contato,
        tipo_contato: linha.tipo_contato,
        vendedor: linha.vendedor,
        nome_cliente: linha.nome_cliente,
        nome_empresa: linha.nome_empresa,
        telefone: linha.telefone,
        uf: linha.uf,
        produto_interesse: linha.produto_interesse,
        valor_orcamento: linha.valor_orcamento,
        valor_frete: linha.valor_frete,
        status: linha.status,
        data_retorno,
        data_fechamento,
        data_cancelamento,
        data_finalizacao,
        observacoes: linha.observacoes,
      }
    })

    const lotes = chunkArray(payload, 200)
    let totalImportado = 0

    for (const lote of lotes) {
      const { error } = await supabase.from('leads').insert(lote)

      if (error) {
        console.error('Erro ao importar lote:', error)
        setErro(`Erro ao importar leads: ${error.message}`)
        setImportando(false)
        return
      }

      totalImportado += lote.length
    }

    setMensagem(`${totalImportado} leads importados com sucesso.`)
    setLinhas([])
    setArquivoNome('')
    setImportando(false)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
          Migração de base
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">
          Importação de Leads
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Envie a planilha antiga da operação para importar os leads no CRM.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <label className="mb-3 block text-sm font-bold text-slate-700">
              Selecionar planilha
            </label>

            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleArquivo(file)
              }}
              className="block w-full rounded-xl border border-slate-300 p-3 text-sm"
            />

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-bold">Arquivo:</span> {arquivoNome || '-'}</p>
              <p><span className="font-bold">Linhas lidas:</span> {linhas.length}</p>
            </div>

            {mensagem ? (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {mensagem}
              </div>
            ) : null}

            {erro ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {erro}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleImportar}
                disabled={importando || linhas.length === 0}
                className="rounded-xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {importando ? 'Importando...' : 'Importar leads'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-bold text-slate-900">Colunas reconhecidas</p>
            <div className="mt-3 space-y-1">
              <p>Data do Contato → data_contato</p>
              <p>Tipo de Contato → tipo_contato</p>
              <p>Vendedor → vendedor</p>
              <p>Nome do Cliente → nome_cliente</p>
              <p>Nome da Empresa → nome_empresa</p>
              <p>Telefone → telefone</p>
              <p>UF → uf</p>
              <p>Produto de Interesse → produto_interesse</p>
              <p>Valor Orçamento → valor_orcamento</p>
              <p>Valor do Frete → valor_frete</p>
              <p>Status → status</p>
              <p>DATA → data_retorno, data_fechamento ou data_finalizacao conforme status</p>
              <p>OBS → observacoes</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-2xl font-black text-slate-900">Prévia da importação</h2>
          <p className="mt-1 text-sm text-slate-500">
            Confira as primeiras linhas antes de enviar para o banco.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Lendo planilha...
          </div>
        ) : linhas.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Nenhuma planilha carregada.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold">Data Contato</th>
                  <th className="px-4 py-3 font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Vendedor</th>
                  <th className="px-4 py-3 font-bold">Cliente</th>
                  <th className="px-4 py-3 font-bold">Empresa</th>
                  <th className="px-4 py-3 font-bold">Telefone</th>
                  <th className="px-4 py-3 font-bold">UF</th>
                  <th className="px-4 py-3 font-bold">Produto</th>
                  <th className="px-4 py-3 font-bold">Orçamento</th>
                  <th className="px-4 py-3 font-bold">Frete</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Data</th>
                  <th className="px-4 py-3 font-bold">OBS</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 20).map((item, index) => (
                  <tr key={index} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3">{item.data_contato || '-'}</td>
                    <td className="px-4 py-3">{item.tipo_contato || '-'}</td>
                    <td className="px-4 py-3">{item.vendedor || '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.nome_cliente}</td>
                    <td className="px-4 py-3">{item.nome_empresa || '-'}</td>
                    <td className="px-4 py-3">{item.telefone || '-'}</td>
                    <td className="px-4 py-3">{item.uf || '-'}</td>
                    <td className="px-4 py-3">{item.produto_interesse || '-'}</td>
                    <td className="px-4 py-3">{item.valor_orcamento ?? '-'}</td>
                    <td className="px-4 py-3">{item.valor_frete ?? '-'}</td>
                    <td className="px-4 py-3">{item.status || '-'}</td>
                    <td className="px-4 py-3">{item.data_retorno || '-'}</td>
                    <td className="min-w-[220px] px-4 py-3">{item.observacoes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}