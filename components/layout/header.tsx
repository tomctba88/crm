import LogoutButton from './logout-button'
import Link from 'next/link'

export default function Header({ userEmail }: any) {
  return (
    <header className="bg-white border-b px-6 py-4 flex justify-between items-center">

      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Dashboard
        </h1>
        <p className="text-xs text-slate-500">
          Visão geral do seu CRM
        </p>
      </div>

      <div className="flex items-center gap-4">
  <Link
  href="/dashboard"
  className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
>
  ⬅ Portal
</Link>

  <span className="text-sm text-slate-700">
    {userEmail}
  </span>

  <LogoutButton />
</div>
    </header>
  )
}