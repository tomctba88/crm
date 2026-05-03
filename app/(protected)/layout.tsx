import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server-client'
import ProtectedShell from '@/components/layout/protected-shell'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: usuario } = await supabase
    .from('usuarios_portal')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  let modulos: any[] = []

  if (usuario?.role_geral === 'admin') {
    const { data } = await supabase
      .from('modulos')
      .select('id, nome, slug, url, icone')
      .eq('ativo', true)
      .order('ordem', { ascending: true })

    modulos = data || []
  } else {
    const { data } = await supabase
      .from('usuarios_modulos')
      .select('modulo:modulo_id(id, nome, slug, url, icone)')
      .eq('usuario_id', user.id)
      .eq('pode_acessar', true)

    modulos =
      data
        ?.map((item: any) =>
          Array.isArray(item.modulo) ? item.modulo[0] : item.modulo
        )
        .filter(Boolean) || []
  }

  return (
    <ProtectedShell
      userEmail={user.email}
      usuario={usuario}
      modulos={modulos}
    >
      {children}
    </ProtectedShell>
  )
}