type StatusBadgeProps = {
  status: string
  tipo?: 'receber' | 'pagar' | 'caixa'
}

const CORES: Record<string, string> = {
  aberto: 'bg-blue-100 text-blue-700',
  vencido: 'bg-red-100 text-red-700',
  recebido: 'bg-green-100 text-green-700',
  pago: 'bg-green-100 text-green-700',
  entrada: 'bg-green-100 text-green-700',
  saida: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
}

const LABELS: Record<string, string> = {
  aberto: 'Aberto',
  vencido: 'Vencido',
  recebido: 'Recebido',
  pago: 'Pago',
  entrada: 'Entrada',
  saida: 'Saída',
  cancelado: 'Cancelado',
}

export default function StatusBadge({ status, tipo }: StatusBadgeProps) {
  void tipo
  const cor = CORES[status] ?? 'bg-slate-100 text-slate-500'
  const label = LABELS[status] ?? status

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>
      {label}
    </span>
  )
}
