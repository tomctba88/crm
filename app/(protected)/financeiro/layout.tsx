'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const abas = [
  { href: '/financeiro', label: 'Dashboard', exact: true },
  { href: '/financeiro/contas-receber', label: 'Contas a Receber' },
  { href: '/financeiro/contas-pagar', label: 'Contas a Pagar' },
  { href: '/financeiro/fluxo-caixa', label: 'Fluxo de Caixa' },
  { href: '/financeiro/dre', label: 'DRE' },
  { href: '/financeiro/integracoes', label: 'Integrações' },
]

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-0">
        {abas.map((aba) => {
          const ativo = aba.exact ? pathname === aba.href : pathname.startsWith(aba.href)
          return (
            <Link
              key={aba.href}
              href={aba.href}
              className={[
                'px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors',
                ativo
                  ? 'bg-white border-slate-200 text-[#1b4fd6] -mb-px'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {aba.label}
            </Link>
          )
        })}
      </nav>

      <div>{children}</div>
    </div>
  )
}
