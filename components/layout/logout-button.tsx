'use client'

import { createClient } from '@/lib/supabase/browser-client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()

    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={logout} className="text-sm text-red-500">
      Sair
    </button>
  )
}