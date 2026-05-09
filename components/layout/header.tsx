import LogoutButton from './logout-button'
import Link from 'next/link'

export default function Header({
  userEmail,
  onMenuToggle,
}: {
  userEmail?: string | null
  onMenuToggle?: () => void
}) {
  return (
    <header className="flex items-center justify-between border-b bg-white px-4 py-3 lg:px-6 lg:py-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect y="4"  width="20" height="2" rx="1" fill="currentColor"/>
            <rect y="9"  width="20" height="2" rx="1" fill="currentColor"/>
            <rect y="14" width="20" height="2" rx="1" fill="currentColor"/>
          </svg>
        </button>

        <div>
          <h1 className="text-base font-bold text-slate-900 lg:text-xl">Dashboard</h1>
          <p className="hidden text-xs text-slate-500 sm:block">Visão geral do seu CRM</p>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <span>⬅</span>
          <span className="hidden sm:inline">Portal</span>
        </Link>

        <span className="hidden max-w-[180px] truncate text-sm text-slate-700 md:block">
          {userEmail}
        </span>

        <LogoutButton />
      </div>
    </header>
  )
}
