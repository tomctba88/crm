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

export async function syncContasReceber(supabase: SupabaseClient, token: string) {
  let itens: Record<string, unknown>[] = []
  try {
    itens = await tinyPaginado(token, 'contas.receber.pesquisa', 'contas', 'conta', filtroDataVencimento())
  } catch (e) {
    const erroFetch = String(e)
    await supabase.from('logs_integracao').insert({
      integracao: 'tiny', recurso: 'contas_receber', status: 'erro',
      mensagem: `Erro ao buscar contas a receber do Tiny: ${erroFetch}`,
      detalhes: { erro: erroFetch },
    })
    return { sincronizados: 0, erros: 0, total_tiny: 0 }
  }

  // Detecta mudança de status para registrar data real de recebimento.
  // A API Tiny v2 não retorna data_ocorrencia, então usamos a data do sync
  // quando detectamos que uma conta transitou de 'aberto' para 'recebido'.
  const { data: dbAtual } = await supabase
    .from('fin_contas_receber')
    .select('tiny_id, status, data_recebimento')
  const dbMap = new Map(
    (dbAtual ?? []).map(r => [String(r.tiny_id), { status: r.status as string, dataRecebimento: r.data_recebimento as string | null }])
  )
  const hoje = new Date().toISOString().slice(0, 10)

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => {
      const tinyId = str(item.id)
      const novoStatus = mapStatusReceber(str(item.situacao))
      const dbRow = dbMap.get(tinyId)
      // Preserva data existente se já estava recebido; marca hoje se acabou de ser pago
      const dataRecebimento = novoStatus === 'recebido'
        ? (dbRow?.status === 'recebido' && dbRow.dataRecebimento ? dbRow.dataRecebimento : hoje)
        : parseDateBR(str(item.data_vencimento ?? item.data_emissao))
      return {
        tiny_id: tinyId,
        numero_documento: str(item.numero_doc ?? item.numero),
        cliente: str(item.nome_cliente ?? item.nome_conta ?? (item.cliente as Record<string, unknown>)?.nome ?? item.cliente),
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        valor_recebido: Number(item.valor_recebido ?? item.valor ?? 0),
        data_vencimento: parseDateBR(str(item.data_vencimento)),
        data_recebimento: dataRecebimento,
        status: novoStatus,
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        observacoes: str(item.historico ?? item.observacoes),
        origem: 'tiny',
        updated_at: new Date().toISOString(),
      }
    })

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
  let itens: Record<string, unknown>[] = []
  let erroFetch: string | null = null
  try {
    itens = await tinyPaginado(token, 'contas.pagar.pesquisa', 'contas', 'conta', filtroDataVencimento())
  } catch (e) {
    erroFetch = String(e)
    await supabase.from('logs_integracao').insert({
      integracao: 'tiny', recurso: 'contas_pagar', status: 'erro',
      mensagem: `Erro ao buscar contas a pagar do Tiny: ${erroFetch}`,
      detalhes: { erro: erroFetch },
    })
    return { sincronizados: 0, erros: 0, total_tiny: 0 }
  }

  // Mesma lógica de detecção de mudança de status da CR
  const { data: dbAtual } = await supabase
    .from('fin_contas_pagar')
    .select('tiny_id, status, data_pagamento')
  const dbMap = new Map(
    (dbAtual ?? []).map(r => [String(r.tiny_id), { status: r.status as string, dataPagamento: r.data_pagamento as string | null }])
  )
  const hoje = new Date().toISOString().slice(0, 10)

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => {
      const tinyId = str(item.id)
      const novoStatus = mapStatusPagar(str(item.situacao))
      const dbRow = dbMap.get(tinyId)
      const dataPagamento = novoStatus === 'pago'
        ? (dbRow?.status === 'pago' && dbRow.dataPagamento ? dbRow.dataPagamento : hoje)
        : parseDateBR(str(item.data_vencimento ?? item.data_emissao))
      return {
        tiny_id: tinyId,
        numero_documento: str(item.numero_doc ?? item.numero),
        fornecedor: str(item.nome_cliente ?? item.nome_conta ?? (item.fornecedor as Record<string, unknown>)?.nome ?? item.fornecedor),
        descricao: str(item.historico ?? item.descricao),
        valor: Number(item.valor ?? 0),
        valor_pago: Number(item.valor_pago ?? item.valor ?? 0),
        data_vencimento: parseDateBR(str(item.data_vencimento)),
        data_pagamento: dataPagamento,
        status: novoStatus,
        categoria: str(item.categoria),
        conta_bancaria: str(item.conta_bancaria),
        observacoes: str(item.historico ?? item.observacoes),
        origem: 'tiny',
        updated_at: new Date().toISOString(),
      }
    })

  const { sincronizados, erros } = await batchUpsert(supabase, 'fin_contas_pagar', records)

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'contas_pagar',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} contas a pagar sincronizadas. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}

// Deriva fluxo de caixa das tabelas locais já sincronizadas — evita
// depender do campo 'situacao' do Tiny (que pode ser 'pago' ou 'recebido').
export async function syncFluxoCaixa(supabase: SupabaseClient) {
  const [{ data: recebidas }, { data: pagas }] = await Promise.all([
    supabase
      .from('fin_contas_receber')
      .select('tiny_id,descricao,valor,data_recebimento,data_vencimento,categoria,conta_bancaria,numero_documento')
      .eq('status', 'recebido'),
    supabase
      .from('fin_contas_pagar')
      .select('tiny_id,descricao,valor,data_pagamento,data_vencimento,categoria,conta_bancaria,numero_documento')
      .eq('status', 'pago'),
  ])

  const entradas = (recebidas ?? [])
    .map(r => ({
      tiny_id: `cr-${r.tiny_id}`,
      tipo: 'entrada',
      descricao: r.descricao,
      valor: r.valor,
      data_lancamento: r.data_recebimento ?? r.data_vencimento,
      categoria: r.categoria,
      conta_bancaria: r.conta_bancaria,
      documento_referencia: r.numero_documento,
      origem: 'tiny',
    }))
    .filter(r => !!r.data_lancamento) as Record<string, unknown>[]

  const saidas = (pagas ?? [])
    .map(p => ({
      tiny_id: `cp-${p.tiny_id}`,
      tipo: 'saida',
      descricao: p.descricao,
      valor: p.valor,
      data_lancamento: p.data_pagamento ?? p.data_vencimento,
      categoria: p.categoria,
      conta_bancaria: p.conta_bancaria,
      documento_referencia: p.numero_documento,
      origem: 'tiny',
    }))
    .filter(p => !!p.data_lancamento) as Record<string, unknown>[]

  const todos = [...entradas, ...saidas]
  const { sincronizados, erros } = todos.length > 0
    ? await batchUpsert(supabase, 'fin_fluxo_caixa', todos)
    : { sincronizados: 0, erros: 0 }

  await supabase.from('logs_integracao').insert({
    integracao: 'tiny', recurso: 'fluxo_caixa',
    status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
    mensagem: `${sincronizados} lançamentos sincronizados. ${erros} erros.`,
    detalhes: { sincronizados, erros, total_entradas: entradas.length, total_saidas: saidas.length },
  })

  return { sincronizados, erros, total_tiny: todos.length }
}
