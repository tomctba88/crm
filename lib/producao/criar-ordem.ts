import { SupabaseClient } from '@supabase/supabase-js'

function matchTipoProduto(produto: string | null, tipos: { id: number; nome: string }[]): number | null {
  if (!produto) return tipos.find((t) => t.nome === 'Outros')?.id ?? null
  const lower = produto.toLowerCase()
  if (lower.includes('cadeira') || lower.includes('poltrona')) {
    return tipos.find((t) => t.nome === 'Cadeira / Poltrona')?.id ?? null
  }
  if (lower.includes('sofa') || lower.includes('sofá')) {
    return tipos.find((t) => t.nome === 'Sofá')?.id ?? null
  }
  if (lower.includes('estante') || lower.includes('armário') || lower.includes('armario') || lower.includes('guarda')) {
    return tipos.find((t) => t.nome === 'Estante / Armário')?.id ?? null
  }
  return tipos.find((t) => t.nome === 'Outros')?.id ?? null
}

async function criarItensDaOrdem(
  admin: SupabaseClient,
  ordemId: number,
  pedidoId: number | null,
  produto: string | null
) {
  if (pedidoId) {
    const { data: itensPedido } = await admin
      .from('pedido_itens')
      .select('id, produto_id, descricao, quantidade, valor_unitario')
      .eq('pedido_id', pedidoId)

    if (itensPedido && itensPedido.length > 0) {
      const produtoIds = itensPedido.map((i) => i.produto_id).filter(Boolean) as number[]
      const { data: produtos } = produtoIds.length
        ? await admin.from('producao_produtos').select('id, nome, preco_custo').in('id', produtoIds)
        : { data: [] }
      const porProduto = new Map((produtos || []).map((p) => [p.id, p]))

      await admin.from('producao_ordem_itens').insert(
        itensPedido.map((i) => ({
          ordem_id: ordemId,
          pedido_item_id: i.id,
          produto_id: i.produto_id,
          descricao: i.descricao || porProduto.get(i.produto_id!)?.nome || produto,
          qtd_planejada: i.quantidade,
          valor_unitario: i.valor_unitario,
          custo_unitario: porProduto.get(i.produto_id!)?.preco_custo || 0,
        }))
      )
      return
    }
  }

  await admin.from('producao_ordem_itens').insert({
    ordem_id: ordemId,
    descricao: produto || 'Sem descrição',
    qtd_planejada: 1,
  })
}

export async function criarOrdemProducao(
  admin: SupabaseClient,
  posVendaId: number,
  leadId: number,
  produto: string | null,
  responsavel: string | null
) {
  // Idempotência: só cria se ainda não existe para este pos_venda
  const { data: existente } = await admin
    .from('producao_ordens')
    .select('id')
    .eq('pos_venda_id', posVendaId)
    .maybeSingle()

  if (existente) return existente

  // Busca tipos de produto
  const { data: tipos } = await admin
    .from('producao_tipos_produto')
    .select('id, nome')
    .eq('ativo', true)

  const tipoProdutoId = matchTipoProduto(produto, tipos || [])

  // Gera número da ordem (OP-0001, OP-0002, ...)
  const { count } = await admin
    .from('producao_ordens')
    .select('*', { count: 'exact', head: true })

  const numero = 'OP-' + String((count || 0) + 1).padStart(4, '0')

  // Cria a ordem
  const { data: novaOrdem, error } = await admin
    .from('producao_ordens')
    .insert({
      numero,
      pos_venda_id: posVendaId,
      lead_id: leadId,
      tipo_produto_id: tipoProdutoId,
      status: 'AGUARDANDO',
      produto,
      responsavel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !novaOrdem) return null

  // Itens da ordem (modelo + quantidade) — base do volume, da curva ABC e da
  // taxa de refugo. Nascem do pedido quando ele existe; senão vira um item só
  // com o texto do produto, que o encarregado detalha depois na ficha da OP.
  await criarItensDaOrdem(admin, novaOrdem.id, novaOrdem.pedido_id ?? null, produto)

  // Copia processos padrão do tipo como etapas da ordem
  if (tipoProdutoId) {
    const { data: processos } = await admin
      .from('producao_processos')
      .select('nome, sequencia')
      .eq('tipo_produto_id', tipoProdutoId)
      .eq('ativo', true)
      .order('sequencia')

    if (processos && processos.length > 0) {
      await admin.from('producao_etapas').insert(
        processos.map((p) => ({
          ordem_id: novaOrdem.id,
          nome: p.nome,
          sequencia: p.sequencia,
          status: 'PENDENTE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
      )
    }
  }

  return novaOrdem
}
