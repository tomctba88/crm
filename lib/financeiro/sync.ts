import { tinyPaginado } from '@/lib/tiny/api'
import { SupabaseClient } from '@supabase/supabase-js'

function parseDateBR(dataBR: string): string | null {
  if (!dataBR || dataBR === '0000-00-00') return null
  const parts = dataBR.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return null
}

function str(v: unknown): string {
  return v ? String(v) : ''
}

// Intervalo amplo em dd/mm/yyyy — obrigatório pela API Tiny (codigo_erro 31)
// Formato fixo sem depender de locale (que pode variar no Vercel)
function fmtBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function filtroDataVencimento() {
  const ini = new Date(); ini.setFullYear(ini.getFullYear() - 3)
  const fim = new Date(); fim.setFullYear(fim.getFullYear() + 2)
  return { data_ini_vencimento: fmtBR(ini), data_fim_vencimento: fmtBR(fim) }
}

// Campos reais da API Tiny v2:
// id, numero_doc, nome_conta, historico, valor, data_vencimento, data_ocorrencia, situacao
function mapStatusReceber(s: string): string {
  const m: Record<string, string> = {
    aberto: 'aberto', 'em aberto': 'aberto',
    recebido: 'recebido', pago: 'recebido',
    cancelado: 'cancelado',
  }
  return m[s?.toLowerCase()] ?? 'aberto'
}

function mapStatusPagar(s: string): string {
  const m: Record<string, string> = {
    aberto: 'aberto', 'em aberto': 'aberto',
    pago: 'pago', recebido: 'pago',
    cancelado: 'cancelado',
  }
  return m[s?.toLowerCase()] ?? 'aberto'
}

export async function syncContasReceber(supabase: SupabaseClient, token: string) {
  const itens = await tinyPaginado(token, 'contas.receber.pesquisa', 'contas_receber', 'conta', filtroDataVencimento())
  let sincronizados = 0, erros = 0

  for (const item of itens) {
    try {
      const tinyId = str(item.id)
      if (!tinyId) continue

      const { error } = await supabase.from('fin_contas_receber').upsert({
        tiny_id: tinyId,
        numero_documento: str(item.numero_doc ?? item.numero),
        cliente: str(item.nome_conta ?? (item.cliente as Record<string, unknown>)?.nome ?? item.cliente),
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        valor_recebido: Number(item.valor_recebido ?? item.valor ?? 0),
        data_vencimento: parseDateBR(str(item.data_vencimento)),
        data_recebimento: parseDateBR(str(item.data_ocorrencia ?? item.data_pagamento)),
        status: mapStatusReceber(str(item.situacao)),
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        observacoes: str(item.historico ?? item.observacoes),
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
    detalhes: { sincronizados, erros, total_tiny: itens.length },
  })

  return { sincronizados, erros }
}

export async function syncContasPagar(supabase: SupabaseClient, token: string) {
  const itens = await tinyPaginado(token, 'contas.pagar.pesquisa', 'contas_pagar', 'conta', filtroDataVencimento())
  let sincronizados = 0, erros = 0

  for (const item of itens) {
    try {
      const tinyId = str(item.id)
      if (!tinyId) continue

      const { error } = await supabase.from('fin_contas_pagar').upsert({
        tiny_id: tinyId,
        numero_documento: str(item.numero_doc ?? item.numero),
        fornecedor: str(item.nome_conta ?? (item.fornecedor as Record<string, unknown>)?.nome ?? item.fornecedor),
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        valor_pago: Number(item.valor_pago ?? item.valor ?? 0),
        data_vencimento: parseDateBR(str(item.data_vencimento)),
        data_pagamento: parseDateBR(str(item.data_ocorrencia ?? item.data_pagamento)),
        status: mapStatusPagar(str(item.situacao)),
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        observacoes: str(item.historico ?? item.observacoes),
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
    detalhes: { sincronizados, erros, total_tiny: itens.length },
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
      const tinyId = `cr-${item.id}`
      if (!item.id) continue
      const dataLanc = parseDateBR(str(item.data_ocorrencia ?? item.data_vencimento))
      if (!dataLanc) continue
      const { error } = await supabase.from('fin_fluxo_caixa').upsert({
        tiny_id: tinyId, tipo: 'entrada',
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        data_lancamento: dataLanc,
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        documento_referencia: str(item.numero_doc ?? item.numero),
        origem: 'tiny',
      }, { onConflict: 'tiny_id' })
      if (error) erros++; else sincronizados++
    } catch { erros++ }
  }

  for (const item of pagas) {
    try {
      const tinyId = `cp-${item.id}`
      if (!item.id) continue
      const dataLanc = parseDateBR(str(item.data_ocorrencia ?? item.data_vencimento))
      if (!dataLanc) continue
      const { error } = await supabase.from('fin_fluxo_caixa').upsert({
        tiny_id: tinyId, tipo: 'saida',
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        data_lancamento: dataLanc,
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        documento_referencia: str(item.numero_doc ?? item.numero),
        origem: 'tiny',
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
