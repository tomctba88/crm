'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/sidebar'
import Header from '@/components/layout/header'
import LogoutButton from '@/components/layout/logout-button'

type Modulo = {
  id: string
  nome: string
  slug: string
  url: string | null
  icone?: string | null
}

type UsuarioPortal = {
  nome?: string | null
  email?: string | null
  role_geral?: string | null
}

function getModuloEmoji(icone?: string | null) {
  if (icone === 'briefcase') return '💼'
  if (icone === 'truck') return '🚚'
  if (icone === 'factory') return '🏭'
  if (icone === 'wallet') return '💰'
  return '🧩'
}

export default function ProtectedShell({
  children,
  userEmail,
  usuario,
  modulos,
}: {
  children: React.ReactNode
  userEmail?: string | null
  usuario: UsuarioPortal | null
  modulos: Modulo[]
}) {
  const pathname = usePathname()
  const isPortal = pathname === '/dashboard'

  const modulos_externos = [
    { prefix: '/fretes', emoji: '🚚', titulo: 'Fretes / Expedição' },
    { prefix: '/financeiro', emoji: '💰', titulo: 'Financeiro' },
    { prefix: '/producao', emoji: '🏭', titulo: 'Produção' },
    { prefix: '/usuarios', emoji: '👥', titulo: 'Usuários' },
  ]
  const moduloAtivo = modulos_externos.find((m) => pathname.startsWith(m.prefix))

  const [sidebarAberta, setSidebarAberta] = useState(false)

  if (moduloAtivo) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-[#0A2A3A] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Portal
            </Link>
            <div className="h-4 w-px bg-white/20" />
            <div className="flex items-center gap-2">
              <span className="text-lg">{moduloAtivo.emoji}</span>
              <span className="text-sm font-bold text-white">{moduloAtivo.titulo}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-white/50 sm:block">{userEmail}</span>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 lg:p-6">
          <div className="w-full">{children}</div>
        </main>
      </div>
    )
  }

  if (!isPortal) {
    return (
      <div className="flex min-h-screen w-full bg-slate-50">
        {/* Overlay mobile */}
        {sidebarAberta && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarAberta(false)}
          />
        )}

        <Sidebar
          isOpen={sidebarAberta}
          onClose={() => setSidebarAberta(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header
            userEmail={userEmail}
            onMenuToggle={() => setSidebarAberta((v) => !v)}
          />

          <main className="min-w-0 flex-1 overflow-x-auto p-3 sm:p-4 lg:p-6">
            <div className="w-full min-w-0">{children}</div>
          </main>
        </div>
      </div>
    )
  }

  // Layout do Portal (dashboard principal)
  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[290px_1fr]">
        <aside className="border-r border-slate-200 bg-[linear-gradient(180deg,#08142d_0%,#0f2552_100%)] text-white">
          <div className="flex h-full flex-col p-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-6">
              <img
                src="/logo.png"
                alt="Ergotex"
                className="h-14 w-14 rounded-xl bg-white object-contain p-1"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                  Portal central
                </p>
                <h1 className="text-2xl font-black">Ergotex One</h1>
              </div>
            </div>

            <nav className="mt-8 flex flex-1 flex-col gap-2">
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Dashboard
              </Link>

              {usuario?.role_geral === 'admin' ? (
                <Link
                  href="/usuarios"
                  className="rounded-2xl px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Usuários
                </Link>
              ) : null}

              {modulos.map((modulo) => (
                <Link
                  key={modulo.id}
                  href={modulo.slug === 'crm' ? '/crm' : modulo.url || '#'}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  <span className="mr-2">{getModuloEmoji(modulo.icone)}</span>
                  {modulo.nome}
                </Link>
              ))}
            </nav>

            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm text-white/70">Usuário logado</p>
                <p className="mt-1 break-all text-sm font-semibold text-white">
                  {usuario?.email || userEmail}
                </p>
              </div>

              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#1b4fd6]">
                  Portal central
                </p>
                <h2 className="text-xl font-black text-[#0b1733] sm:text-2xl">
                  Ergotex One
                </h2>
              </div>

              <div className="hidden rounded-2xl bg-[#eef3fb] px-4 py-3 text-sm font-semibold text-[#0b1733] sm:block">
                A escolha certa para o seu negócio.
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
