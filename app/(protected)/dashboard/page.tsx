import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server-client'

function getRoleLabel(role?: string | null) {
  if (role === 'admin') return 'Administrador'
  if (role === 'operacional') return 'Operacional'
  if (role === 'consulta') return 'Consulta'
  return 'Não definido'
}

function getModuloEmoji(icone?: string) {
  if (icone === 'briefcase') return '💼'
  if (icone === 'truck') return '🚚'
  if (icone === 'factory') return '🏭'
  if (icone === 'wallet') return '💰'
  return '🧩'
}

function getCategoria(modulo: any) {
  return modulo.categoria || 'Outros'
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios_portal')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  let modulos: any[] = []

  if (usuario?.role_geral === 'admin') {
    const { data } = await supabase
      .from('modulos')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true })

    modulos = data || []
  } else {
    const { data } = await supabase
      .from('usuarios_modulos')
      .select('modulo:modulo_id(*)')
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
    <div className="space-y-8">
      <div className="rounded-3xl bg-[linear-gradient(135deg,#08142d_0%,#1f4fa8_100%)] p-8 text-white">
        <h1 className="text-4xl font-black">Ergotex One</h1>
        <p className="mt-2 text-white/80">Portal central de gestão da empresa</p>
        <p className="mt-4 text-sm text-white/70">
          {usuario?.nome || user.email}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm text-slate-500">Módulos disponíveis</p>
          <p className="text-3xl font-black">{modulos.length}</p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm text-slate-500">Perfil</p>
          <p className="text-3xl font-black">
            {getRoleLabel(usuario?.role_geral)}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm text-slate-500">Status</p>
          <p className="text-3xl font-black text-green-600">Online</p>
        </div>
      </div>

      <div>
        <h2 className="text-3xl font-black text-[#0b1733]">Módulos do portal</h2>
        <p className="mt-2 text-slate-500">
          Acesse os sistemas liberados para o seu usuário.
        </p>
      </div>

      {modulos.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {modulos.map((modulo) => (
            <a
              key={modulo.id}
              href={modulo.slug === 'crm' ? '/crm' : modulo.url || '#'}
              className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_60%)] opacity-0 transition group-hover:opacity-100" />

              <div className="relative z-10 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {getCategoria(modulo)}
              </div>

              <div className="relative z-10 mt-4 text-4xl transition-transform duration-300 group-hover:scale-110">
                {getModuloEmoji(modulo.icone)}
              </div>

              <h3 className="relative z-10 mt-4 text-xl font-black text-[#0b1733]">
                {modulo.nome}
              </h3>

              <p className="relative z-10 mt-2 text-sm leading-relaxed text-slate-500">
                {modulo.descricao || 'Acessar módulo'}
              </p>

              <div className="relative z-10 mt-6 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#1b4fd6] transition group-hover:translate-x-1">
                  Acessar módulo →
                </span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-8 text-slate-500 shadow">
          Nenhum módulo liberado para este usuário. Solicite acesso ao administrador do sistema.
        </div>
      )}
    </div>
  )
}