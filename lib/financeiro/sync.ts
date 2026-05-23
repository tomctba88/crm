import { tinyPaginado, tinyRequest } from '@/lib/tiny/api'
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

// Extrai a data real de pagamento via endpoint de detalhe do Tiny.
// Busca SOMENTE em estruturas de histórico aninhadas (data_ocorrencia),
// nunca em campos raiz que podem conter data_vencimento disfarçada.
async function fetchDataOcorrenciaReal(
  token: string,
  tinyId: string,
  tipo: 'receber' | 'pagar'
): Promise<string | null> {
  try {
    const endpoint = tipo === 'receber' ? 'contas.receber.obter' : 'contas.pagar.obter'
    const retorno = await tinyRequest(token, endpoint, { id: tinyId })
    const conta = (retorno.conta ?? retorno) as Record<string, unknown>

    // Procura apenas em estruturas de histórico aninhadas — o campo raiz
    // data_recebimento/data_pagamento pode ser a data de vencimento, não a real.
    for (const key of ['historico_recebimentos', 'historico_pagamentos', 'historico', 'ocorrencias', 'parcelas']) {
      const obj = conta[key]
      if (!obj) continue
      const arr: unknown[] = Array.isArray(obj)
        ? obj
        : Array.isArray((obj as Record<string, unknown>).historico)
          ? (obj as Record<string, unknown[]>).historico
          : []
      if (arr.length === 0) continue
      const first = arr[0] as Record<string, unknown>
      for (const field of ['data_ocorrencia', 'data_pagamento', 'data']) {
        const v = first[field]
        if (v && typeof v === 'string' && v !== '0000-00-00') {
          const parsed = parseDateBR(v)
          if (parsed) return parsed
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// Busca datas reais concorrentemente, limitando a N chamadas paralelas.
async function fetchDatasReais(
  token: string,
  ids: string[],
  tipo: 'receber' | 'pagar',
  concurrency = 5
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async id => ({ id, date: await fetchDataOcorrenciaReal(token, id, tipo) }))
    )
    for (const { id, date } of batchResults) results.set(id, date)
  }
  return results
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

  const { data: dbAtual } = await supabase
    .from('fin_contas_receber')
    .select('tiny_id, status, data_recebimento')

  const dbMap = new Map(
    (dbAtual ?? []).map(r => [String(r.tiny_id), {
      status: r.status as string,
      dataRecebimento: r.data_recebimento as string | null,
    }])
  )

  const hoje = new Date().toISOString().slice(0, 10)

  // Busca data real apenas para novas transições aberto→recebido.
  // Para contas já em DB como 'recebido', preserva a data existente.
  const precisaObter = new Set<string>()
  for (const item of itens) {
    const tinyId = str(item.id)
    if (!tinyId) continue
    if (mapStatusReceber(str(item.situacao)) !== 'recebido') continue
    const dbRow = dbMap.get(tinyId)
    if (!dbRow || dbRow.status !== 'recebido') precisaObter.add(tinyId)
  }

  const datasReais = await fetchDatasReais(token, Array.from(precisaObter), 'receber', 5)

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => {
      const tinyId = str(item.id)
      const novoStatus = mapStatusReceber(str(item.situacao))
      const dbRow = dbMap.get(tinyId)

      let dataRecebimento: string | null
      if (novoStatus === 'recebido') {
        if (datasReais.has(tinyId)) {
          // Nova transição: usa data real do Tiny, cai para hoje se não retornou
          dataRecebimento = datasReais.get(tinyId) ?? hoje
        } else {
          // Já estava recebido: preserva data existente
          dataRecebimento = dbRow?.dataRecebimento ?? hoje
        }
      } else {
        dataRecebimento = parseDateBR(str(item.data_vencimento ?? item.data_emissao))
      }

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
    mensagem: `${sincronizados} contas a receber sincronizadas (${precisaObter.size} novas transições com data real). ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length, novas_transicoes: precisaObter.size },
  })

  return { sincronizados, erros, total_tiny: itens.length }
}

export async function syncContasPagar(supabase: SupabaseClient, token: string) {
  let itens: Record<string, unknown>[] = []
  try {
    itens = await tinyPaginado(token, 'contas.pagar.pesquisa', 'contas', 'conta', filtroDataVencimento())
  } catch (e) {
    const erroFetch = String(e)
    await supabase.from('logs_integracao').insert({
      integracao: 'tiny', recurso: 'contas_pagar', status: 'erro',
      mensagem: `Erro ao buscar contas a pagar do Tiny: ${erroFetch}`,
      detalhes: { erro: erroFetch },
    })
    return { sincronizados: 0, erros: 0, total_tiny: 0 }
  }

  const { data: dbAtual } = await supabase
    .from('fin_contas_pagar')
    .select('tiny_id, status, data_pagamento')

  const dbMap = new Map(
    (dbAtual ?? []).map(r => [String(r.tiny_id), {
      status: r.status as string,
      dataPagamento: r.data_pagamento as string | null,
    }])
  )

  const hoje = new Date().toISOString().slice(0, 10)

  const precisaObter = new Set<string>()
  for (const item of itens) {
    const tinyId = str(item.id)
    if (!tinyId) continue
    if (mapStatusPagar(str(item.situacao)) !== 'pago') continue
    const dbRow = dbMap.get(tinyId)
    if (!dbRow || dbRow.status !== 'pago') precisaObter.add(tinyId)
  }

  const datasReais = await fetchDatasReais(token, Array.from(precisaObter), 'pagar', 5)

  const records = itens
    .filter(item => !!str(item.id))
    .map(item => {
      const tinyId = str(item.id)
      const novoStatus = mapStatusPagar(str(item.situacao))
      const dbRow = dbMap.get(tinyId)

      let dataPagamento: string | null
      if (novoStatus === 'pago') {
        if (datasReais.has(tinyId)) {
          dataPagamento = datasReais.get(tinyId) ?? hoje
        } else {
          dataPagamento = dbRow?.dataPagamento ?? hoje
        }
      } else {
        dataPagamento = parseDateBR(str(item.data_vencimento ?? item.data_emissao))
      }

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
    mensagem: `${sincronizados} contas a pagar sincronizadas (${precisaObter.size} novas transições com data real). ${erros} erros.`,
    detalhes: { sincronizados, erros, total_tiny: itens.length, novas_transicoes: precisaObter.size },
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
