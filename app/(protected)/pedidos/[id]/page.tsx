import PedidoDetalhe from '@/components/pedidos/pedido-detalhe'

export default async function PedidoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PedidoDetalhe pedidoId={Number(id)} />
}
