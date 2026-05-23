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

async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  records: Record<string, unknown>[],
  chunkSize = 200
): Promise<{ sincronizados: number; erros: number }> {
  let sincronizados = 0, erros = 0
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize)
    const { error, data } = await supabase.from(table).upsert(chunk, { onConflict: 'tiny_id' }).select('id')
    if (error) erros += chunk.length
    else sincronizados += data?.length ?? chunk.length
  }
  return { sincronizados, erros }
}

export async function syncContasReceber(supabase: SupabaseClient, token: string) {
  const itens = await tinyPaginado(token, 'contas.receber.pesquisa', 'contas', 'conta', filtroDataVencimento())

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => ({
      tiny_id: str(item.id),
      numero_documento: str(item.numero_doc ?? item.numero),
      cliente: str(item.nome_cliente ?? item.nome_conta ?? (item.cliente as Record<string, unknown>)?.nome ?? item.cliente),
      descricao: str(item.historico ?? item.descricao),
      valor: Number(item.valor ?? 0),
      valor_recebido: Number(item.valor_recebido ?? item.valor ?? 0),
      data_vencimento: parseDateBR(str(item.data_vencimento)),
      data_recebimento: parseDateBR(str(item.data_ocorrencia ?? item.data_emissao ?? item.data_pagamento)),
      status: mapStatusReceber(str(item.situacao)),
      categoria: str(item.categoria),
      conta_bancaria: str(item.conta_bancaria),
      observacoes: str(item.historico ?? item.observacoes),
      origem: 'tiny',
      updated_at: new Date().toISOString(),
    }))

  const { sincronizados, erros } = await batchUpsert(supabase, 'fin_contas_receber', records)

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_receber',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a receber sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}

export async function syncContasPagar(supabase: SupabaseClient, token: string) {
  const itens = await tinyPaginado(token, 'contas.pagar.pesquisa', 'contas', 'conta', filtroDataVencimento())

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => ({
      tiny_id: str(item.id),
      numero_documento: str(item.numero_doc ?? item.numero),
      fornecedor: str(item.nome_cliente ?? item.nome_conta ?? (item.fornecedor as Record<string, unknown>)?.nome ?? item.fornecedor),
      descricao: str(item.historico ?? item.descricao),
      valor: Number(item.valor ?? 0),
      valor_pago: Number(item.valor_pago ?? item.valor ?? 0),
      data_vencimento: parseDateBR(str(item.data_vencimento)),
      data_pagamento: parseDateBR(str(item.data_ocorrencia ?? item.data_emissao ?? item.data_pagamento)),
      status: mapStatusPagar(str(item.situacao)),
      categoria: str(item.categoria),
      conta_bancaria: str(item.conta_bancaria),
      observacoes: str(item.historico ?? item.observacoes),
      origem: 'tiny',
      updated_at: new Date().toISOString(),
    }))

  const { sincronizados, erros } = await batchUpsert(supabase, 'fin_contas_pagar', records)

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_pagar',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a pagar sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}

export async function syncFluxoCaixa(supabase: SupabaseClient, token: string) {
  const filtro = filtroDataVencimento()

  const [recebidas, pagas] = await Promise.all([
    tinyPaginado(token, 'contas.receber.pesquisa', 'contas', 'conta', { situacao: 'recebido', ...filtro }),
    tinyPaginado(token, 'contas.pagar.pesquisa', 'contas', 'conta', { situacao: 'pago', ...filtro }),
  ])

  const entradas = recebidas
    .filter(item => !!item.id)
    .map(item => {
      const dataLanc = parseDateBR(str(item.data_ocorrencia ?? item.data_vencimento))
      if (!dataLanc) return null
      return {
        tiny_id: `cr-${item.id}`,
        tipo: 'entrada',
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        data_lancamento: dataLanc,
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        documento_referencia: str(item.numero_doc ?? item.numero),
        origem: 'tiny',
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  const saidas = pagas
    .filter(item => !!item.id)
    .map(item => {
      const dataLanc = parseDateBR(str(item.data_ocorrencia ?? item.data_vencimento))
      if (!dataLanc) return null
      return {
        tiny_id: `cp-${item.id}`,
        tipo: 'saida',
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        data_lancamento: dataLanc,
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        documento_referencia: str(item.numero_doc ?? item.numero),
        origem: 'tiny',
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  const { sincronizados: se, erros: ee } = await batchUpsert(supabase, 'fin_fluxo_caixa', entradas)
  const { sincronizados: ss, erros: es } = await batchUpsert(supabase, 'fin_fluxo_caixa', saidas)
  const sincronizados = se + ss, erros = ee + es

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'fluxo_caixa',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} lançamentos sincronizados. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_recebidas: recebidas.length, total_pagas: pagas.length },
  })

  return { sincronizados, erros, total_tiny: recebidas.length + pagas.length }
}
