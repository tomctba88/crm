'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'

type Produto = {
  id: number
  tiny_id: string | null
  sku: string | null
  descricao: string | null
  unidade: string | null
  preco: number | null
  preco_custo: number | null
  estoque: number | null
  categoria: string | null
  situacao: string | null
  url_imagem: string | null
}

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'

const LOTE = 500

function brl(n: number | null) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CatalogoManager() {
  const [total, setTotal] = useState(0)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)

  // importação
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  useEffect(() => {
    carregar('')
  }, [])

  async function carregar(q: string) {
    setLoading(true)
    const res = await fetch(`/api/produtos-catalogo?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    setProdutos(json.produtos || [])
    setTotal(json.total || 0)
    setLoading(false)
  }

  async function lerArquivo(file: File): Promise<Record<string, unknown>[]> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: false })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
  }

  async function onArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setImportando(true)
    setResultado(null)
    setProgresso(null)

    try {
      // lê e junta todas as linhas de todos os arquivos
      let linhas: Record<string, unknown>[] = []
      for (const f of files) {
        const rows = await lerArquivo(f)
        linhas = linhas.concat(rows)
      }

      let feito = 0
      let inseridos = 0
      setProgresso({ feito: 0, total: linhas.length })

      for (let i = 0; i < linhas.length; i += LOTE) {
        const lote = linhas.slice(i, i + LOTE)
        const res = await fetch('/api/produtos-catalogo/importar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produtos: lote }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        inseridos += json.inseridos || 0
        feito += lote.length
        setProgresso({ feito, total: linhas.length })
      }

      setResultado(`✅ ${inseridos} produtos importados/atualizados de ${files.length} arquivo(s).`)
      await carregar(filtro)
    } catch (err) {
      setResultado(`❌ Erro: ${(err as Error).message}`)
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-black text-slate-800">Catálogo de Produtos</h1>
        <p className="text-sm text-slate-500">
          Produtos importados do Tiny. Total no sistema: <strong>{total.toLocaleString('pt-BR')}</strong>
        </p>
      </div>

      {/* Importador */}
      <div className={card}>
        <h2 className="mb-2 text-sm font-bold uppercase text-slate-400">Importar do Tiny</h2>
        <p className="mb-3 text-sm text-slate-500">
          Selecione um ou vários arquivos <code>.xls</code> exportados do Tiny. Atualiza pelos existentes (upsert por ID), não duplica.
        </p>
        <input
          type="file"
          accept=".xls,.xlsx"
          multiple
          disabled={importando}
          onChange={onArquivos}
          className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-[#0b1733] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#1b4fd6]"
        />

        {progresso && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Importando… {progresso.feito.toLocaleString('pt-BR')} / {progresso.total.toLocaleString('pt-BR')}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-[#1b4fd6] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {resultado && <p className="mt-3 text-sm font-semibold">{resultado}</p>}
      </div>

      {/* Listagem */}
      <div className={card}>
        <div className="mb-3 flex items-center gap-2">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && carregar(filtro)}
            placeholder="Buscar por descrição ou SKU…"
            className={`${input} flex-1`}
          />
          <button onClick={() => carregar(filtro)} className={btnPrimario}>Buscar</button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Carregando…</p>
        ) : produtos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum produto. Importe os arquivos do Tiny acima.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Descrição</th>
                  <th className="py-2 pr-3">Categoria</th>
                  <th className="py-2 pr-3 text-right">Preço</th>
                  <th className="py-2 pr-3 text-right">Custo</th>
                  <th className="py-2 pr-3 text-right">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{p.sku || '—'}</td>
                    <td className="py-2 pr-3">{p.descricao}</td>
                    <td className="py-2 pr-3 text-slate-500">{p.categoria || '—'}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-green-700">{brl(p.preco)}</td>
                    <td className="py-2 pr-3 text-right text-slate-500">{brl(p.preco_custo)}</td>
                    <td className="py-2 pr-3 text-right">{Number(p.estoque || 0).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">Mostrando até 50 resultados. Use a busca para filtrar.</p>
          </div>
        )}
      </div>
    </div>
  )
}
