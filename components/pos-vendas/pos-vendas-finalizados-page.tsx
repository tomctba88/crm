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

export default function PosVendasFinalizadosPage() {
  const supabase = useMemo(() => createClient(), [])

  const [items, setItems] = useState<PosVendaComLead[]>([])
  const [loading, setLoading] = useState(true)

  async function buscarFinalizados() {
    setLoading(true)

    try {
      const { data: posVendas, error: posVendasError } = await supabase
        .from('pos_vendas')
        .select('*')
        .eq('status_pos_venda', 'FINALIZADO')
        .order('updated_at', { ascending: false })

      if (posVendasError) {
        throw posVendasError
      }

      const base = (posVendas || []) as PosVenda[]
      const ids = Array.from(new Set(base.map((item) => item.lead_id)))

      let leadsRelacionados: LeadRelacionado[] = []

      if (ids.length > 0) {
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id, nome_cliente, nome_empresa, vendedor, telefone, produto_interesse, valor_orcamento')
          .in('id', ids)

        if (leadsError) {
          throw leadsError
        }

        leadsRelacionados = (leads || []) as LeadRelacionado[]
      }

      const mapa = new Map<number, LeadRelacionado>()
      for (const lead of leadsRelacionados) {
        mapa.set(lead.id, lead)
      }

      setItems(
        base.map((item) => ({
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

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
          Base de dados
        </p>
        <h1 className="text-3xl font-black text-slate-900">
          Pós-vendas finalizados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Registros arquivados do pós-vendas.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando finalizados...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Nenhum registro finalizado encontrado.
          </div>
        ) : (
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
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
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
        )}
      </section>
    </div>
  )
}