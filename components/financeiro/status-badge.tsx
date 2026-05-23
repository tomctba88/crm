type StatusBadgeProps = {
  status: string
  tipo: 'receber' | 'pagar'
}

const COR_RECEBER: Record<string, string> = {
  aberto: 'bg-blue-100 text-blue-700',
  recebido: 'bg-green-100 text-green-700',
  vencido: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
}

const COR_PAGAR: Record<string, string> = {
  aberto: 'bg-blue-100 text-blue-700',
  pago: 'bg-green-100 text-green-700',
  vencido: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
}

const LABEL_RECEBER: Record<string, string> = {
  aberto: 'Aberto',
  recebido: 'Recebido',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

const LABEL_PAGAR: Record<string, string> = {
  aberto: 'Aberto',
  pago: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

export default function StatusBadge({ status, tipo }: StatusBadgeProps) {
  const mapa = tipo === 'receber' ? COR_RECEBER : COR_PAGAR
  const labels = tipo === 'receber' ? LABEL_RECEBER : LABEL_PAGAR
  const cor = mapa[status] ?? 'bg-slate-100 text-slate-500'
  const label = labels[status] ?? status

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>
      {label}
    </span>
  )
}
