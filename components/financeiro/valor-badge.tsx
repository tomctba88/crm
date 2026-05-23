import { formatBRL } from '@/lib/financeiro/formatters'

type ValorBadgeProps = {
  valor: number
  tipo?: 'positivo' | 'negativo' | 'neutro' | 'auto'
  className?: string
}

export default function ValorBadge({ valor, tipo = 'auto', className = '' }: ValorBadgeProps) {
  let cor = 'text-slate-700'
  if (tipo === 'positivo' || (tipo === 'auto' && valor > 0)) cor = 'text-green-600'
  if (tipo === 'negativo' || (tipo === 'auto' && valor < 0)) cor = 'text-red-600'
  if (tipo === 'auto' && valor === 0) cor = 'text-slate-400'

  return (
    <span className={`font-bold tabular-nums ${cor} ${className}`}>
      {formatBRL(valor)}
    </span>
  )
}
