import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server-client'
import Sidebar from '@/components/layout/sidebar'
import Header from '@/components/layout/header'

export default async function ProtectedLayout({ children }: any) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
  <div className="flex min-h-screen w-full bg-slate-50">
    <Sidebar />

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header userEmail={user.email} />

      <main className="min-w-0 flex-1 overflow-x-auto p-4 lg:p-6">
        <div className="w-full min-w-0">
          {children}
        </div>
      </main>
    </div>
  </div>
)
}