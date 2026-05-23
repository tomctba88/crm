import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { tinyPaginado } from '@/lib/tiny/api'

function mapearStatus(situacao: string): string {
  const map: Record<string, string> = {
    aberto: 'aberto',
    'em aberto': 'aberto',
    pago: 'pago',
    cancelado: 'cancelado',
  }
  return map[situacao?.toLowerCase()] ?? 'aberto'
}

function parsePeriodo(periodo: string | null): Record<string, string> {
  const hoje = new Date()
  const params: Record<string, string> = {}
  if (!periodo || periodo === '30d') {
    const ini = new Date(hoje)
    ini.setDate(ini.getDate() - 30)
    params.dataInicial = ini.toLocaleDateString('pt-BR')
    params.dataFinal = hoje.toLocaleDateString('pt-BR')
  } else if (periodo === '60d') {
    const ini = new Date(hoje)
    ini.setDate(ini.getDate() - 60)
    params.dataInicial = ini.toLocaleDateString('pt-BR')
    params.dataFinal = hoje.toLocaleDateString('pt-BR')
  } else if (periodo === '90d') {
    const ini = new Date(hoje)
    ini.setDate(ini.getDate() - 90)
    params.dataInicial = ini.toLocaleDateString('pt-BR')
    params.dataFinal = hoje.toLocaleDateString('pt-BR')
  } else if (periodo === 'ano') {
    params.dataInicial = `01/01/${hoje.getFullYear()}`
    params.dataFinal = hoje.toLocaleDateString('pt-BR')
  }
  return params
}

function parseDateBR(dataBR: string): string | null {
  const parts = dataBR.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist')
      .select('token, ativo')
      .eq('nome', 'olist_tiny')
      .maybeSingle()

    if (!integracao?.token || !integracao.ativo) {
      return NextResponse.json({ error: 'Token do Tiny não configurado ou integração inativa.' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const periodo = searchParams.get('periodo')
    const extraParams = parsePeriodo(periodo)

    const itens = await tinyPaginado(
      integracao.token,
      'contas.pagar.pesquisa',
      'contas_pagar',
      'conta',
      extraParams
    )

    let sincronizados = 0
    let erros = 0

    for (const item of itens) {
      try {
        const tinyId = String(item.id ?? item.numero ?? '')
        if (!tinyId) continue

        const row = {
          tiny_id: tinyId,
          numero_documento: String(item.numero ?? ''),
          fornecedor: String((item.fornecedor as Record<string, unknown>)?.nome ?? item.fornecedor ?? ''),
          descricao: String(item.historico ?? item.descricao ?? ''),
          valor: Number(item.valor ?? 0),
          valor_pago: Number(item.valor_pago ?? 0),
          data_vencimento: item.data_vencimento
            ? parseDateBR(String(item.data_vencimento))
            : null,
          data_pagamento: item.data_pagamento
            ? parseDateBR(String(item.data_pagamento))
            : null,
          status: mapearStatus(String(item.situacao ?? 'aberto')),
          categoria: String(item.categoria ?? ''),
          conta_bancaria: String(item.conta_bancaria ?? ''),
          observacoes: String(item.observacoes ?? ''),
          origem: 'tiny',
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('fin_contas_pagar')
          .upsert(row, { onConflict: 'tiny_id' })

        if (error) { erros++; continue }
        sincronizados++
      } catch {
        erros++
      }
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'contas_pagar',
      status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
      mensagem: `${sincronizados} contas a pagar sincronizadas. ${erros} erros.`,
      detalhes: { sincronizados, erros },
    })

    return NextResponse.json({
      sincronizados,
      erros,
      ultima_sync: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
