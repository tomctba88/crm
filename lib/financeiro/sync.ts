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

function isoParaBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// Wide range to capture all open accounts including long-overdue ones
function filtroAbertoVencimento() {
  const ini = new Date(); ini.setFullYear(ini.getFullYear() - 5)
  const fim = new Date(); fim.setFullYear(fim.getFullYear() + 5)
  return {
    situacao: 'aberto',
    data_ini_vencimento: fmtBR(ini),
    data_fim_vencimento: fmtBR(fim),
  }
}

async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  records: Record<string, unknown>[],
  chunkSize = 500
): Promise<{ sincronizados: number; erros: number }> {
  let sincronizados = 0, erros = 0
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'tiny_id' })
    if (error) erros += chunk.length
    else sincronizados += chunk.length
  }
  return { sincronizados, erros }
}

async function removerStale(
  supabase: SupabaseClient,
  table: string,
  idsAtivos: string[]
) {
  if (idsAtivos.length === 0) return
  const { data: existentes } = await supabase.from(table).select('tiny_id')
  const paraExcluir = (existentes ?? [])
    .map(r => String(r.tiny_id))
    .filter(id => !idsAtivos.includes(id))
  for (let i = 0; i < paraExcluir.length; i += 100) {
    await supabase.from(table).delete().in('tiny_id', paraExcluir.slice(i, i + 100))
  }
}

export async function syncContasReceber(supabase: SupabaseClient, token: string) {
  let itens: Record<string, unknown>[] = []
  try {
    itens = await tinyPaginado(token, 'contas.receber.pesquisa', 'contas', 'conta', filtroAbertoVencimento())
  } catch (e) {
    const erroFetch = String(e)
    await supabase.from('logs_integracao').insert({
      integracao: 'tiny', recurso: 'contas_receber', status: 'erro',
      mensagem: `Erro ao buscar contas a receber do Tiny: ${erroFetch}`,
      detalhes: { erro: erroFetch },
    })
    return { sincronizados: 0, erros: 0, total_tiny: 0 }
  }

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => ({
      tiny_id: str(item.id),
      numero_documento: str(item.numero_doc ?? item.numero),
      cliente: str(item.nome_cliente ?? item.nome_conta ?? (item.cliente as Record<string, unknown>)?.nome ?? item.cliente),
      descricao: str(item.historico ?? item.descricao),
      valor: Number(item.valor ?? 0),
      valor_recebido: 0,
      data_vencimento: parseDateBR(str(item.data_vencimento)),
      data_recebimento: null,
      status: 'aberto',
      categoria: str(item.categoria),
      conta_bancaria: str(item.conta_bancaria),
      observacoes: str(item.historico ?? item.observacoes),
      origem: 'tiny',
      updated_at: new Date().toISOString(),
    }))

  const { sincronizados, erros } = await batchUpsert(supabase, 'fin_contas_receber', records)

  // Remove accounts no longer open in Tiny (paid/cancelled)
  await removerStale(supabase, 'fin_contas_receber', records.map(r => r.tiny_id as string))

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_receber',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a receber em aberto sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}

export async function syncContasPagar(supabase: SupabaseClient, token: string) {
  let itens: Record<string, unknown>[] = []
  try {
    itens = await tinyPaginado(token, 'contas.pagar.pesquisa', 'contas', 'conta', filtroAbertoVencimento())
  } catch (e) {
    const erroFetch = String(e)
    await supabase.from('logs_integracao').insert({
      integracao: 'tiny', recurso: 'contas_pagar', status: 'erro',
      mensagem: `Erro ao buscar contas a pagar do Tiny: ${erroFetch}`,
      detalhes: { erro: erroFetch },
    })
    return { sincronizados: 0, erros: 0, total_tiny: 0 }
  }

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => ({
      tiny_id: str(item.id),
      numero_documento: str(item.numero_doc ?? item.numero),
      fornecedor: str(item.nome_cliente ?? item.nome_conta ?? (item.fornecedor as Record<string, unknown>)?.nome ?? item.fornecedor),
      descricao: str(item.historico ?? item.descricao),
      valor: Number(item.valor ?? 0),
      valor_pago: 0,
      data_vencimento: parseDateBR(str(item.data_vencimento)),
      data_pagamento: null,
      status: 'aberto',
      categoria: str(item.categoria),
      conta_bancaria: str(item.conta_bancaria),
      observacoes: str(item.historico ?? item.observacoes),
      origem: 'tiny',
      updated_at: new Date().toISOString(),
    }))

  const { sincronizados, erros } = await batchUpsert(supabase, 'fin_contas_pagar', records)

  // Remove accounts no longer open in Tiny (paid/cancelled)
  await removerStale(supabase, 'fin_contas_pagar', records.map(r => r.tiny_id as string))

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_pagar',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a pagar em aberto sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}

// Syncs actual cash movements from Tiny's caixa.pesquisa endpoint.
// tipo "R" → entrada, "D" → saida. Uses real posting dates from the cash book.
export async function syncCaixa(
  supabase: SupabaseClient,
  token: string,
  dataInicialISO: string,
  dataFinalISO: string,
) {
  const dataInicial = isoParaBR(dataInicialISO)
  const dataFinal = isoParaBR(dataFinalISO)

  let itens: Record<string, unknown>[] = []
  try {
    // itemKey='' so tinyPaginado returns the raw item; we unwrap lancamento below
    itens = await tinyPaginado(token, 'caixa.pesquisa', 'caixa', '', {
      dataInicial,
      dataFinal,
    })
  } catch (e) {
    const erroFetch = String(e)
    await supabase.from('logs_integracao').insert({
      integracao: 'tiny', recurso: 'fluxo_caixa', status: 'erro',
      mensagem: `Erro ao buscar caixa do Tiny: ${erroFetch}`,
      detalhes: { erro: erroFetch },
    })
    return { sincronizados: 0, erros: 0, total_tiny: 0 }
  }

  const records = itens
    .map(rawItem => {
      // Handle both { lancamento: {...} } and flat item structures
      const item = ((rawItem.lancamento ?? rawItem) as Record<string, unknown>)
      return {
        tiny_id: str(item.id),
        tipo: str(item.tipo).toUpperCase() === 'R' ? 'entrada' : 'saida',
        descricao: str(item.historico ?? item.descricao),
        valor: Math.abs(Number(item.valor ?? 0)),
        data_lancamento: parseDateBR(str(item.data)),
        categoria: str(item.categoria),
        conta_bancaria: str(item.contaBancaria ?? item.conta_bancaria),
        documento_referencia: str(item.numeroDocumento ?? item.numero_documento ?? item.numero ?? ''),
        origem: 'tiny',
      }
    })
    .filter(r => !!r.tiny_id && !!r.data_lancamento) as Record<string, unknown>[]

  const { sincronizados, erros } = records.length > 0
    ? await batchUpsert(supabase, 'fin_fluxo_caixa', records)
    : { sincronizados: 0, erros: 0 }

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'fluxo_caixa',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} lançamentos do caixa sincronizados. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length, periodo: `${dataInicialISO} → ${dataFinalISO}` },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}
