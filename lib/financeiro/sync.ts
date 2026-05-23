import { tinyPaginado } from '@/lib/tiny/api'
import { SupabaseClient } from '@supabase/supabase-js'

function parseDateBR(dataBR: string): string | null {
  const parts = dataBR.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return null
}

// Retorna intervalo amplo em formato dd/mm/yyyy exigido pelo Tiny
function filtroDataVencimento() {
  const ini = new Date()
  ini.setFullYear(ini.getFullYear() - 3)
  const fim = new Date()
  fim.setFullYear(fim.getFullYear() + 2)
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR')
  return { data_ini_vencimento: fmt(ini), data_fim_vencimento: fmt(fim) }
}

export async function syncContasReceber(supabase: SupabaseClient, token: string) {
  const mapStatus = (s: string) =>
    ({ aberto: 'aberto', 'em aberto': 'aberto', recebido: 'recebido', cancelado: 'cancelado' }[s?.toLowerCase()] ?? 'aberto')

  const itens = await tinyPaginado(token, 'contas.receber.pesquisa', 'contas_receber', 'conta', filtroDataVencimento())
  let sincronizados = 0, erros = 0

  for (const item of itens) {
    try {
      const tinyId = String(item.id ?? item.numero ?? '')
      if (!tinyId) continue
      const { error } = await supabase.from('fin_contas_receber').upsert({
        tiny_id: tinyId,
        numero_documento: String(item.numero ?? ''),
        cliente: String((item.cliente as Record<string, unknown>)?.nome ?? item.cliente ?? ''),
        descricao: String(item.historico ?? item.descricao ?? ''),
        valor: Number(item.valor ?? 0),
        valor_recebido: Number(item.valor_recebido ?? 0),
        data_vencimento: item.data_vencimento ? parseDateBR(String(item.data_vencimento)) : null,
        data_recebimento: item.data_pagamento ? parseDateBR(String(item.data_pagamento)) : null,
        status: mapStatus(String(item.situacao ?? 'aberto')),
        categoria: String(item.categoria ?? ''),
        conta_bancaria: String(item.conta_bancaria ?? ''),
        observacoes: String(item.observacoes ?? ''),
        origem: 'tiny',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tiny_id' })
      if (error) erros++; else sincronizados++
    } catch { erros++ }
  }

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_receber',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a receber sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros },
  })

  return { sincronizados, erros }
}

export async function syncContasPagar(supabase: SupabaseClient, token: string) {
  const mapStatus = (s: string) =>
    ({ aberto: 'aberto', 'em aberto': 'aberto', pago: 'pago', cancelado: 'cancelado' }[s?.toLowerCase()] ?? 'aberto')

  const itens = await tinyPaginado(token, 'contas.pagar.pesquisa', 'contas_pagar', 'conta', filtroDataVencimento())
  let sincronizados = 0, erros = 0

  for (const item of itens) {
    try {
      const tinyId = String(item.id ?? item.numero ?? '')
      if (!tinyId) continue
      const { error } = await supabase.from('fin_contas_pagar').upsert({
        tiny_id: tinyId,
        numero_documento: String(item.numero ?? ''),
        fornecedor: String((item.fornecedor as Record<string, unknown>)?.nome ?? item.fornecedor ?? ''),
        descricao: String(item.historico ?? item.descricao ?? ''),
        valor: Number(item.valor ?? 0),
        valor_pago: Number(item.valor_pago ?? 0),
        data_vencimento: item.data_vencimento ? parseDateBR(String(item.data_vencimento)) : null,
        data_pagamento: item.data_pagamento ? parseDateBR(String(item.data_pagamento)) : null,
        status: mapStatus(String(item.situacao ?? 'aberto')),
        categoria: String(item.categoria ?? ''),
        conta_bancaria: String(item.conta_bancaria ?? ''),
        observacoes: String(item.observacoes ?? ''),
        origem: 'tiny',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tiny_id' })
      if (error) erros++; else sincronizados++
    } catch { erros++ }
  }

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_pagar',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a pagar sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros },
  })

  return { sincronizados, erros }
}

export async function syncFluxoCaixa(supabase: SupabaseClient, token: string) {
  let sincronizados = 0, erros = 0

  const [recebidas, pagas] = await Promise.all([
    tinyPaginado(token, 'contas.receber.pesquisa', 'contas_receber', 'conta', { situacao: 'recebido' }),
    tinyPaginado(token, 'contas.pagar.pesquisa', 'contas_pagar', 'conta', { situacao: 'pago' }),
  ])

  for (const item of recebidas) {
    try {
      const tinyId = `cr-${item.id ?? item.numero}`
      if (!tinyId || tinyId === 'cr-') continue
      const dataLanc = item.data_pagamento
        ? parseDateBR(String(item.data_pagamento))
        : item.data_vencimento ? parseDateBR(String(item.data_vencimento)) : null
      if (!dataLanc) continue
      const { error } = await supabase.from('fin_fluxo_caixa').upsert({
        tiny_id: tinyId, tipo: 'entrada',
        descricao: String(item.historico ?? item.descricao ?? ''),
        valor: Number(item.valor ?? 0), data_lancamento: dataLanc,
        categoria: String(item.categoria ?? ''), conta_bancaria: String(item.conta_bancaria ?? ''),
        documento_referencia: String(item.numero ?? ''), origem: 'tiny',
      }, { onConflict: 'tiny_id' })
      if (error) erros++; else sincronizados++
    } catch { erros++ }
  }

  for (const item of pagas) {
    try {
      const tinyId = `cp-${item.id ?? item.numero}`
      if (!tinyId || tinyId === 'cp-') continue
      const dataLanc = item.data_pagamento
        ? parseDateBR(String(item.data_pagamento))
        : item.data_vencimento ? parseDateBR(String(item.data_vencimento)) : null
      if (!dataLanc) continue
      const { error } = await supabase.from('fin_fluxo_caixa').upsert({
        tiny_id: tinyId, tipo: 'saida',
        descricao: String(item.historico ?? item.descricao ?? ''),
        valor: Number(item.valor ?? 0), data_lancamento: dataLanc,
        categoria: String(item.categoria ?? ''), conta_bancaria: String(item.conta_bancaria ?? ''),
        documento_referencia: String(item.numero ?? ''), origem: 'tiny',
      }, { onConflict: 'tiny_id' })
      if (error) erros++; else sincronizados++
    } catch { erros++ }
  }

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'fluxo_caixa',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} lançamentos sincronizados. ${erros} erros.`,
    detalhes: { sincronizados, erros },
  })

  return { sincronizados, erros }
}
