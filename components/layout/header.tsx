import LogoutButton from './logout-button'

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
        <span className="text-sm text-slate-700">
          {userEmail}
        </span>

        <LogoutButton />
      </div>
    </header>
  )
}