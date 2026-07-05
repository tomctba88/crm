import ProdutoForm from '@/components/catalogo/produto-form'

export default async function ProdutoEditarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProdutoForm produtoId={Number(id)} />
}
