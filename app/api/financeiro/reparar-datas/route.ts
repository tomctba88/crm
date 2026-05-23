import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { tinyRequest } from '@/lib/tiny/api'

const dd = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

function ultimoDiaMes(ano: number, mes: number): Date {
  return new Date(ano, mes + 1, 0)
}

// Consulta Tiny filtrando por data_ocorrencia em um mês específico.
// O filtro funciona mas a API não retorna o campo — usamos o mês como proxy.
async function mapearPagamentosPorMes(
  token: string,
  endpoint: 'contas.receber.pesquisa' | 'contas.pagar.pesquisa',
  ano: number,
  mes: number,
  maxPaginas = 10
): Promise<Set<string>> {
  const ids = new Set<string>()
  const ini = new Date(ano, mes, 1)
  const fim = ultimoDiaMes(ano, mes)
  try {
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const r = await tinyRequest(token, endpoint, {
        pagina: String(pagina), situacao: 'pago',
        data_ini_ocorrencia: dd(ini), data_fim_ocorrencia: dd(fim),
      })
      const col = Array.isArray(r.contas) ? r.contas : []
      for (const raw of col) {
        const item = (raw as Record<string, unknown>)
        const nested = ((item.conta ?? item) as Record<string, unknown>)
        const id = String(nested.id ?? '')
        if (id) ids.add(id)
      }
      if (pagina >= Number(r.numero_paginas ?? 1) || col.length === 0) break
    }
  } catch { /* endpoint pode não suportar filtro — ignora */ }
  return ids
}

// GET: mostra campos disponíveis na API para diagnóstico
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()
    if (!integracao?.token) return NextResponse.json({ error: 'Token não configurado.' }, { status: 400 })

    const token = integracao.token
    const hoje = new Date()
    const ini3anos = new Date(); ini3anos.setFullYear(hoje.getFullYear() - 3)

    let amostra: unknown = null
    let erro: string | null = null
    try {
      const r = await tinyRequest(token, 'contas.receber.pesquisa', {
        pagina: '1', situacao: 'pago',
        data_ini_ocorrencia: dd(ini3anos), data_fim_ocorrencia: dd(hoje),
      })
      const col = Array.isArray(r.contas) ? r.contas : []
      const primeiro = col[0] as Record<string, unknown> | undefined
      const item = primeiro ? ((primeiro.conta ?? primeiro) as Record<string, unknown>) : null
      amostra = {
        numero_paginas: r.numero_paginas,
        itens_pagina1: col.length,
        campos_disponiveis: item ? Object.keys(item) : [],
        primeiro_item: item,
      }
    } catch (e) { erro = String(e) }

    return NextResponse.json({ diagnostico: amostra, erro })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST: identifica o mês real de pagamento via filtro data_ocorrencia e atualiza
// data_recebimento/data_pagamento. Contas sem data_ocorrencia no Tiny recebem
// data_vencimento como fallback, eliminando o acúmulo na data do sync inicial.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()
    if (!integracao?.token || !integracao.ativo)
      return NextResponse.json({ error: 'Token não configurado.' }, { status: 400 })

    const token = integracao.token
    const hoje = new Date()

    // Monta lista dos últimos 36 meses
    const meses: { ano: number; mes: number; dataRef: string }[] = []
    for (let i = 35; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const ano = d.getFullYear()
      const mes = d.getMonth()
      // Usa o 15º dia do mês como data representativa de pagamento
      const dataRef = `${ano}-${String(mes + 1).padStart(2,'0')}-15`
      meses.push({ ano, mes, dataRef })
    }

    // Mapeia tiny_id → data de pagamento real (por mês via filtro data_ocorrencia)
    const pagamentoCR = new Map<string, string>()
    const pagamentoCP = new Map<string, string>()

    for (const { ano, mes, dataRef } of meses) {
      const [idsCR, idsCP] = await Promise.all([
        mapearPagamentosPorMes(token, 'contas.receber.pesquisa', ano, mes),
        mapearPagamentosPorMes(token, 'contas.pagar.pesquisa', ano, mes),
      ])
      for (const id of idsCR) if (!pagamentoCR.has(id)) pagamentoCR.set(id, dataRef)
      for (const id of idsCP) if (!pagamentoCP.has(id)) pagamentoCP.set(id, dataRef)
    }

    // Busca TODAS as contas recebidas/pagas do banco para aplicar fallback
    // em contas que o Tiny não retornou via data_ocorrencia
    const [{ data: dbCR }, { data: dbCP }] = await Promise.all([
      supabase
        .from('fin_contas_receber')
        .select('tiny_id, data_vencimento')
        .eq('status', 'recebido'),
      supabase
        .from('fin_contas_pagar')
        .select('tiny_id, data_vencimento')
        .eq('status', 'pago'),
    ])

    let viaOcorrenciaCR = 0, viaVencimentoCR = 0
    let viaOcorrenciaCP = 0, viaVencimentoCP = 0

    // Para cada conta recebida: usa data_ocorrencia mapeada ou data_vencimento como fallback
    const recsCR = (dbCR ?? []).map(r => {
      const id = String(r.tiny_id)
      const dataOcorrencia = pagamentoCR.get(id)
      if (dataOcorrencia) { viaOcorrenciaCR++; return { tiny_id: id, data_recebimento: dataOcorrencia } }
      viaVencimentoCR++
      return { tiny_id: id, data_recebimento: r.data_vencimento }
    })

    const recsCP = (dbCP ?? []).map(r => {
      const id = String(r.tiny_id)
      const dataOcorrencia = pagamentoCP.get(id)
      if (dataOcorrencia) { viaOcorrenciaCP++; return { tiny_id: id, data_pagamento: dataOcorrencia } }
      viaVencimentoCP++
      return { tiny_id: id, data_pagamento: r.data_vencimento }
    })

    // Atualiza banco em lote
    const CHUNK = 500
    let atualizadasCR = 0, atualizadasCP = 0

    for (let i = 0; i < recsCR.length; i += CHUNK) {
      const chunk = recsCR.slice(i, i + CHUNK)
      const { error } = await supabase.from('fin_contas_receber')
        .upsert(chunk, { onConflict: 'tiny_id' })
      if (!error) atualizadasCR += chunk.length
    }

    for (let i = 0; i < recsCP.length; i += CHUNK) {
      const chunk = recsCP.slice(i, i + CHUNK)
      const { error } = await supabase.from('fin_contas_pagar')
        .upsert(chunk, { onConflict: 'tiny_id' })
      if (!error) atualizadasCP += chunk.length
    }

    return NextResponse.json({
      ok: true,
      mensagem: 'Datas de pagamento corrigidas. Contas com data_ocorrencia no Tiny usam o mês real; demais usam data_vencimento como referência.',
      contas_receber: {
        total: recsCR.length,
        via_ocorrencia_tiny: viaOcorrenciaCR,
        via_vencimento_fallback: viaVencimentoCR,
        atualizadas: atualizadasCR,
      },
      contas_pagar: {
        total: recsCP.length,
        via_ocorrencia_tiny: viaOcorrenciaCP,
        via_vencimento_fallback: viaVencimentoCP,
        atualizadas: atualizadasCP,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
