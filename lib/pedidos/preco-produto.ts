// Helpers do módulo Pedidos.
// Preço final do produto = (custo dos materiais da ficha + mão de obra) * (1 + margem%).
// Mesma fórmula usada em components/producao/produtos-manager.tsx (precoFinalProduto),
// replicada aqui no servidor para o item do pedido puxar o "valor de tabela".

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Calcula o preço final de venda de um produto fabricado, a partir da ficha técnica.
 * Retorna 0 se o produto não tiver ficha/custos.
 */
export async function precoFinalProduto(
  admin: SupabaseClient,
  produtoId: number
): Promise<number> {
  const [{ data: produto }, { data: ficha }, { data: estoques }] = await Promise.all([
    admin
      .from('producao_produtos')
      .select('id, custo_mao_obra, margem_lucro_pct')
      .eq('id', produtoId)
      .maybeSingle(),
    admin
      .from('producao_ficha_tecnica')
      .select('insumo_id, quantidade_padrao, custo_unitario')
      .eq('produto_id', produtoId),
    admin.from('producao_estoque_insumos').select('insumo_id, custo_unitario'),
  ])

  if (!produto) return 0

  const custoEstoque: Record<number, number> = {}
  for (const e of estoques || []) {
    const row = e as { insumo_id: number; custo_unitario: number | null }
    custoEstoque[row.insumo_id] = row.custo_unitario != null ? Number(row.custo_unitario) : 0
  }

  let custoMateriais = 0
  for (const f of ficha || []) {
    const row = f as { insumo_id: number; quantidade_padrao: number; custo_unitario: number | null }
    const cu = row.custo_unitario != null ? Number(row.custo_unitario) : (custoEstoque[row.insumo_id] ?? 0)
    custoMateriais += Number(row.quantidade_padrao) * cu
  }

  const maoObra = Number((produto as { custo_mao_obra: number | null }).custo_mao_obra) || 0
  const margem = Number((produto as { margem_lucro_pct: number | null }).margem_lucro_pct) || 0
  const total = (custoMateriais + maoObra) * (1 + margem / 100)

  return Math.round(total * 100) / 100
}

/**
 * Recalcula e persiste os totais do pedido a partir dos seus itens.
 * valor_produtos = soma dos subtotais; valor_total = produtos - desconto + frete.
 * Não altera itens, apenas os campos agregados do pedido.
 */
export async function recalcularTotaisPedido(
  admin: SupabaseClient,
  pedidoId: number
): Promise<void> {
  const [{ data: itens }, { data: pedido }] = await Promise.all([
    admin.from('pedido_itens').select('subtotal').eq('pedido_id', pedidoId),
    admin.from('pedidos').select('valor_frete, valor_desconto').eq('id', pedidoId).maybeSingle(),
  ])

  const valorProdutos = (itens || []).reduce(
    (acc, it) => acc + Number((it as { subtotal: number | null }).subtotal || 0),
    0
  )
  const frete = Number((pedido as { valor_frete: number | null } | null)?.valor_frete) || 0
  const desconto = Number((pedido as { valor_desconto: number | null } | null)?.valor_desconto) || 0
  const valorTotal = valorProdutos - desconto + frete

  await admin
    .from('pedidos')
    .update({
      valor_produtos: Math.round(valorProdutos * 100) / 100,
      valor_total: Math.round(valorTotal * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId)
}
