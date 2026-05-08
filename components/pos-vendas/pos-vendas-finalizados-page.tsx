'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type LeadRelacionado = {
  id: number
  nome_cliente: string
  nome_empresa: string | null
  vendedor: string | null
  telefone: string | null
  produto_interesse: string | null
  valor_orcamento: number | null
}

type PosVenda = {
  id: number
  lead_id: number
  responsavel: string | null
  transportadora: string | null
  codigo_rastreio: string | null
  data_inicio: string | null
  data_prevista_entrega: string | null
  data_entrega: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

type PosVendaComLead = PosVenda & {
  lead: LeadRelacionado | null
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return 'R$ 0,00'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateBR(value: string | null) {
  if (!value) return '-'
  const data = value.slice(0, 10)
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return value
  return `${dia}/${mes}/${ano}`
}

const POR_PAGINA = 20

export default function PosVendasFinalizadosPage() {
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<PosVendaComLead[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)

  async function buscarFinalizados() {
    setLoading(true)

    try {
      const limite = 1000
      let inicio = 0
      const idsVistos = new Set<number>()
      let todos: PosVenda[] = []

      while (true) {
        const { data, error } = await supabase
          .from('pos_vendas')
          .select('*')
          .eq('status_pos_venda', 'FINALIZADO')
          .order('id', { ascending: false })
          .range(inicio, inicio + limite - 1)

        if (error) throw error

        const lote = (data || []) as PosVenda[]
        const novos = lote.filter((item) => {
          if (idsVistos.has(item.id)) return false
          idsVistos.add(item.id)
          return true
        })
        todos = [...todos, ...novos]

        if (lote.length < limite) break
        inicio += limite
      }

      const ids = Array.from(new Set(todos.map((item) => item.lead_id)))

      let leadsRelacionados: LeadRelacionado[] = []

      if (ids.length > 0) {
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id, nome_cliente, nome_empresa, vendedor, telefone, produto_interesse, valor_orcamento')
          .in('id', ids)

        if (leadsError) throw leadsError

        leadsRelacionados = (leads || []) as LeadRelacionado[]
      }

      const mapa = new Map<number, LeadRelacionado>()
      for (const lead of leadsRelacionados) {
        mapa.set(lead.id, lead)
      }

      setItems(
        todos.map((item) => ({
          ...item,
          lead: mapa.get(item.lead_id) || null,
        }))
      )
    } catch (error) {
      console.error('Erro ao buscar finalizados:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    buscarFinalizados()
  }, [])

  const itensFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    if (!termo) return items
    return items.filter(
      (item) =>
        item.lead?.nome_cliente?.toLowerCase().includes(termo) ||
        item.lead?.nome_empresa?.toLowerCase().includes(termo) ||
        item.lead?.vendedor?.toLowerCase().includes(termo) ||
        item.responsavel?.toLowerCase().includes(termo) ||
        item.transportadora?.toLowerCase().includes(termo) ||
        item.lead?.produto_interesse?.toLowerCase().includes(termo)
    )
  }, [items, busca])

  const totalPaginas = Math.max(1, Math.ceil(itensFiltrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const itensPagina = itensFiltrados.slice(
    (paginaAtual - 1) * POR_PAGINA,
    paginaAtual * POR_PAGINA
  )

  function handleBusca(valor: string) {
    setBusca(valor)
    setPagina(1)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Base de dados
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Pós-vendas finalizados
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Registros arquivados do pós-vendas.
            </p>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={busca}
              onChange={(e) => handleBusca(e.target.value)}
              placeholder="Buscar por cliente, empresa, vendedor..."
              className="h-11 w-72 rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <button
              type="button"
              onClick={buscarFinalizados}
              className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando finalizados...
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            {busca ? 'Nenhum registro encontrado para a busca.' : 'Nenhum registro finalizado encontrado.'}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                {itensFiltrados.length} registro(s)
                {busca ? ` encontrados para "${busca}"` : ''}
              </span>
              <span>
                Página {paginaAtual} de {totalPaginas}
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-bold">Cliente</th>
                    <th className="px-4 py-3 font-bold">Empresa</th>
                    <th className="px-4 py-3 font-bold">Vendedor</th>
                    <th className="px-4 py-3 font-bold">Responsável</th>
                    <th className="px-4 py-3 font-bold">Produto</th>
                    <th className="px-4 py-3 font-bold">Valor</th>
                    <th className="px-4 py-3 font-bold">Transportadora</th>
                    <th className="px-4 py-3 font-bold">Entrega</th>
                    <th className="px-4 py-3 font-bold">Atualizado em</th>
                  </tr>
                </thead>
                <tbody>
                  {itensPagina.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.lead?.nome_cliente || `Lead #${item.lead_id}`}
                      </td>
                      <td className="px-4 py-3">
                        {item.lead?.nome_empresa || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {item.lead?.vendedor || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {item.responsavel || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {item.lead?.produto_interesse || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {formatCurrency(item.lead?.valor_orcamento || 0)}
                      </td>
                      <td className="px-4 py-3">
                        {item.transportadora || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {formatDateBR(item.data_entrega)}
                      </td>
                      <td className="px-4 py-3">
                        {formatDateBR(item.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>

                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPaginas ||
                      Math.abs(p - paginaAtual) <= 2
                  )
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-slate-400">
                        ...
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPagina(p as number)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                          paginaAtual === p
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
