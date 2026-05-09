import OrdemDetalhe from '@/components/producao/ordem-detalhe'

export default async function OrdemDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OrdemDetalhe ordemId={Number(id)} />
}
