'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const abas = [
  { href: '/fretes', label: 'Dashboard', exact: true },
  { href: '/fretes/lancamentos', label: 'Lançamentos' },
  { href: '/fretes/resultados', label: 'Resultados' },
  { href: '/fretes/produtos', label: 'Produtos' },
  { href: '/fretes/transportadoras', label: 'Transportadoras' },
  { href: '/fretes/cidades', label: 'Cidades' },
  { href: '/fretes/tabela-shopify', label: 'Tabela Shopify' },
]

export default function FretesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black text-[#0b1733]">Módulo de Fretes</h1>
        <p className="text-sm text-slate-500">Gestão de fretes, transportadoras e análise logística</p>
      </div>

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
