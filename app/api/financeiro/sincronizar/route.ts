import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { getTinyToken, tinyFetchTodas, tinyFetch, dataTinyParaISO, isoParaDataTiny } from '@/lib/tiny/client'
import { classificarSegmentoProduto } from '@/lib/tiny/categorias'

export const maxDuration = 300

function str(v: unknown): string {
  return v ? String(v) : ''
}

function mapStatusCR(s: string): string {
  const m: Record<string, string> = { 'aberto': 'aberto', 'em aberto': 'aberto', 'vencido': 'vencido', 'cancelado': 'cancelado' }
  return m[s?.toLowerCase()] ?? 'aberto'
}

async function sincronizarContasReceber(supabase: any, token: string) {
  const itens = await tinyFetchTodas(token, 'contas.receber.pesquisa', { situacao: 'aberto' }, 'conta')
  const tinyIds = itens.filter(i => !!str(i.id)).map(i => str(i.id))
  const records = itens.filter(i => !!str(i.id)).map(i => {
    const catObj = i.categoria as any
    return {
      tiny_id: str(i.id),
      numero_documento: str(i.numero_doc ?? i.numero ?? i.numeroDocumento),
      cliente: str(i.nome_contato ?? i.nome_cliente ?? i.nome_conta ?? (i.cliente as any)?.nome ?? i.cliente),
      historico: str(i.historico ?? i.descricao),
      valor: Math.abs(Number(i.valor ?? 0)),
      data_vencimento: dataTinyParaISO(str(i.data_vencimento ?? i.dataVencimento)),
      data_emissao: dataTinyParaISO(str(i.data_emissao ?? i.dataEmissao)),
      status: mapStatusCR(str(i.situacao)),
      categoria: str(catObj?.nome ?? i.categoria),
      categoria_id: str(catObj?.id ?? i.categoria_id),
      conta_bancaria: str(i.conta_bancaria ?? i.contaBancaria),
      numero_parcela: i.numero_parcela ? Number(i.numero_parcela) : null,
      numero_parcelas: i.numero_parcelas ? Number(i.numero_parcelas) : null,
      origem: 'tiny',
      sincronizado_em: new Date().toISOString(),
    }
  })

  let sincronizados = 0, erros = 0
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from('fin_contas_receber').upsert(records.slice(i, i + 500), { onConflict: 'tiny_id' })
    if (error) erros += 500; else sincronizados += records.slice(i, i + 500).length
  }
  if (tinyIds.length > 0) {
    await supabase.from('fin_contas_receber').delete().eq('origem', 'tiny')
      .not('tiny_id', 'in', `(${tinyIds.map(id => `"${id}"`).join(',')})`)
  }
  return { sincronizados, erros, total: itens.length }
}

async function sincronizarContasPagar(supabase: any, token: string) {
  const itens = await tinyFetchTodas(token, 'contas.pagar.pesquisa', { situacao: 'aberto' }, 'conta')
  const tinyIds = itens.filter(i => !!str(i.id)).map(i => str(i.id))
  const records = itens.filter(i => !!str(i.id)).map(i => {
    const catObj = i.categoria as any
    return {
      tiny_id: str(i.id),
      numero_documento: str(i.numero_doc ?? i.numero ?? i.numeroDocumento),
      fornecedor: str(i.nome_contato ?? i.nome_fornecedor ?? i.nome_conta ?? (i.fornecedor as any)?.nome ?? i.fornecedor),
      historico: str(i.historico ?? i.descricao),
      valor: Math.abs(Number(i.valor ?? 0)),
      data_vencimento: dataTinyParaISO(str(i.data_vencimento ?? i.dataVencimento)),
      data_emissao: dataTinyParaISO(str(i.data_emissao ?? i.dataEmissao)),
      status: mapStatusCR(str(i.situacao)),
      categoria: str(catObj?.nome ?? i.categoria),
      categoria_id: str(catObj?.id ?? i.categoria_id),
      conta_bancaria: str(i.conta_bancaria ?? i.contaBancaria),
      numero_parcela: i.numero_parcela ? Number(i.numero_parcela) : null,
      numero_parcelas: i.numero_parcelas ? Number(i.numero_parcelas) : null,
      origem: 'tiny',
      sincronizado_em: new Date().toISOString(),
    }
  })

  let sincronizados = 0, erros = 0
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from('fin_contas_pagar').upsert(records.slice(i, i + 500), { onConflict: 'tiny_id' })
    if (error) erros += 500; else sincronizados += records.slice(i, i + 500).length
  }
  if (tinyIds.length > 0) {
    await supabase.from('fin_contas_pagar').delete().eq('origem', 'tiny')
      .not('tiny_id', 'in', `(${tinyIds.map(id => `"${id}"`).join(',')})`)
  }
  return { sincronizados, erros, total: itens.length }
}

async function sincronizarCaixa(supabase: any, token: string) {
  const hoje = new Date()
  const dataFinalISO = hoje.toISOString().slice(0, 10)
  const ini3a = new Date(hoje); ini3a.setFullYear(ini3a.getFullYear() - 3)
  const dataInicialISO = ini3a.toISOString().slice(0, 10)

  const itens = await tinyFetchTodas(
    token, 'caixa.pesquisa',
    { dataInicial: isoParaDataTiny(dataInicialISO), dataFinal: isoParaDataTiny(dataFinalISO) },
    'lancamento'
  )

  const records = itens.filter(i => !!str(i.id)).map(i => {
    const tipoRaw = str(i.tipo).toUpperCase()
    const tipo = tipoRaw === 'R' || tipoRaw === 'ENTRADA' || tipoRaw === 'RECEITA' ? 'entrada' : 'saida'
    const catObj = i.categoria as any
    return {
      tiny_id: str(i.id),
      tipo,
      data_lancamento: dataTinyParaISO(str(i.data ?? i.data_lancamento)) ?? dataInicialISO,
      historico: str(i.historico ?? i.descricao),
      valor: Math.abs(Number(i.valor ?? 0)),
      categoria: str(catObj?.nome ?? i.categoria),
      categoria_id: str(catObj?.id ?? i.categoria_id),
      conta_bancaria: str(i.conta_bancaria ?? i.contaBancaria),
      documento_referencia: str(i.numero_doc ?? i.numero ?? i.documento_referencia),
      origem: 'tiny',
      sincronizado_em: new Date().toISOString(),
    }
  })

  let sincronizados = 0, erros = 0
  for (let i = 0; i < records.length; i += 500) {
    const { error } = await supabase.from('fin_caixa').upsert(records.slice(i, i + 500), { onConflict: 'tiny_id' })
    if (error) erros += 500; else sincronizados += records.slice(i, i + 500).length
  }
  return { sincronizados, erros, total: itens.length }
}

async function sincronizarVendas(supabase: any, token: string) {
  let pedidos = 0, nfs = 0, itensTotal = 0
  const situacoesPedido = 'aprovado,faturado,preparando,enviado,entregue'
  const pedidosRaw = await tinyFetchTodas(token, 'pedidos.pesquisa', { situacao: situacoesPedido }, 'pedido').catch(() => [])

  for (const ped of pedidosRaw) {
    try {
      const tinyId = str(ped.id ?? ped.numero)
      if (!tinyId) continue
      const valorTotal = Number(ped.total_pedido ?? ped.totalPedido ?? 0)
      const valorDesconto = Number(ped.desconto ?? 0)
      let itensPed: any[] = []
      try {
        const ret = await tinyFetch(token, 'pedidos.obter', { id: tinyId })
        const ped2 = ret?.pedido ?? ret
        const itensRaw = ped2?.itens?.item ?? ped2?.itens ?? []
        itensPed = Array.isArray(itensRaw) ? itensRaw : [itensRaw]
      } catch { /* sem itens */ }

      let estofaria = 0, marcenaria = 0
      const itensMapped = itensPed.map((it: any) => {
        const desc = str(it.descricao ?? it.produto?.descricao)
        const seg = classificarSegmentoProduto(desc)
        const qtd = Number(it.quantidade ?? 1)
        const unit = Number(it.valor_unitario ?? it.valorUnitario ?? 0)
        const tot = qtd * unit
        const custo = Number(it.preco_custo ?? it.produto?.preco_custo ?? 0)
        const custoTot = qtd * custo
        if (seg === 'estofaria') estofaria += tot
        if (seg === 'marcenaria') marcenaria += tot
        return { tiny_produto_id: str(it.produto?.id), codigo: str(it.codigo ?? it.produto?.codigo), descricao: desc, unidade: str(it.unidade), quantidade: qtd, valor_unitario: unit, valor_total: tot, custo_unitario: custo, custo_total: custoTot, segmento: seg, margem_valor: tot - custoTot, margem_percentual: tot > 0 ? ((tot - custoTot) / tot) * 100 : 0 }
      })

      const { data: vd } = await supabase.from('fin_vendas').upsert({
        tiny_id: tinyId, tipo_origem: 'pedido', numero: str(ped.numero),
        cliente: str(ped.nome_contato ?? ped.nome_cliente),
        data_venda: dataTinyParaISO(str(ped.data ?? ped.data_pedido)),
        data_emissao: dataTinyParaISO(str(ped.data_emissao ?? ped.data)),
        valor_total: valorTotal, valor_desconto: valorDesconto,
        valor_frete: Number(ped.total_frete ?? 0),
        valor_liquido: valorTotal - valorDesconto,
        situacao: str(ped.situacao), valor_estofaria: estofaria, valor_marcenaria: marcenaria,
        origem: 'tiny', sincronizado_em: new Date().toISOString(),
      }, { onConflict: 'tiny_id' }).select('id').maybeSingle()

      if (vd?.id && itensMapped.length > 0) {
        await supabase.from('fin_itens_venda').delete().eq('venda_id', vd.id)
        await supabase.from('fin_itens_venda').insert(itensMapped.map(it => ({ ...it, venda_id: vd.id })))
        itensTotal += itensMapped.length
      }
      pedidos++
      await new Promise(r => setTimeout(r, 150))
    } catch { /* continua */ }
  }

  const nfsRaw = await tinyFetchTodas(token, 'nota.fiscal.pesquisa', { tipo: 'S' }, 'nota_fiscal').catch(() => [])
  for (const nf of nfsRaw) {
    try {
      const tinyId = str(nf.id)
      if (!tinyId) continue
      const vt = Number(nf.valor_total ?? 0)
      await supabase.from('fin_vendas').upsert({
        tiny_id: `nf-${tinyId}`, tipo_origem: 'nf', numero: str(nf.numero ?? nf.numero_nota),
        cliente: str(nf.nome_contato ?? nf.cliente?.nome),
        data_venda: dataTinyParaISO(str(nf.data_emissao ?? nf.dataEmissao)),
        data_emissao: dataTinyParaISO(str(nf.data_emissao ?? nf.dataEmissao)),
        valor_total: vt, valor_desconto: Number(nf.valor_desconto ?? 0), valor_frete: Number(nf.valor_frete ?? 0),
        valor_liquido: vt - Number(nf.valor_desconto ?? 0),
        situacao: str(nf.situacao), valor_estofaria: 0, valor_marcenaria: 0,
        origem: 'tiny', sincronizado_em: new Date().toISOString(),
      }, { onConflict: 'tiny_id' })
      nfs++
    } catch { /* continua */ }
  }

  return { pedidos, nfs, itens: itensTotal }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const token = await getTinyToken(supabase)

    let body: any = {}
    try { body = await request.json() } catch { /* sem body */ }
    const escopo: string = body?.escopo ?? 'completo'

    const resultados: Record<string, any> = {}

    if (escopo === 'completo' || escopo === 'contas') {
      const [cr, cp] = await Promise.allSettled([
        sincronizarContasReceber(supabase, token),
        sincronizarContasPagar(supabase, token),
      ])
      resultados.contas_receber = cr.status === 'fulfilled' ? cr.value : { error: String((cr as any).reason) }
      resultados.contas_pagar = cp.status === 'fulfilled' ? cp.value : { error: String((cp as any).reason) }
    }

    if (escopo === 'completo' || escopo === 'caixa') {
      const caixa = await sincronizarCaixa(supabase, token).catch(e => ({ error: String(e) }))
      resultados.caixa = caixa
    }

    if (escopo === 'completo' || escopo === 'vendas') {
      const vendas = await sincronizarVendas(supabase, token).catch(e => ({ error: String(e) }))
      resultados.vendas = vendas
    }

    const syncedAt = new Date().toISOString()
    await supabase.from('integracoes_olist')
      .update({ ultimo_sync_em: syncedAt, updated_at: syncedAt })
      .eq('nome', 'olist_tiny')

    const totalSincronizados =
      (resultados.contas_receber?.sincronizados ?? 0) +
      (resultados.contas_pagar?.sincronizados ?? 0) +
      (resultados.caixa?.sincronizados ?? 0) +
      (resultados.vendas?.pedidos ?? 0) + (resultados.vendas?.nfs ?? 0)

    return NextResponse.json({ ...resultados, ultima_sync: syncedAt, total_sincronizados: totalSincronizados })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
