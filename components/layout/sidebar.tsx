  'use client'

  import { useEffect, useMemo, useState } from 'react'
  import { usePathname } from 'next/navigation'
  import { createClient } from '@/lib/supabase/browser-client'
  import Image from 'next/image'

  type NivelAcesso = 'administrador' | 'operacional' | 'consulta'

  type Profile = {
    nivel_acesso: NivelAcesso
  }

  export default function Sidebar() {
    const pathname = usePathname()
    const supabase = useMemo(() => createClient(), [])
    const [nivelAcesso, setNivelAcesso] = useState<NivelAcesso>('administrador')

    useEffect(() => {
      async function carregarNivel() {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setNivelAcesso('administrador')
          return
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('nivel_acesso')
          .eq('id', user.id)
          .single()

        if (error || !data) {
          console.error('Erro ao buscar nível de acesso:', error)
          setNivelAcesso('administrador')
          return
        }

        setNivelAcesso((data as Profile).nivel_acesso || 'administrador')
      }

      carregarNivel()
    }, [supabase])

    const isAdministrador = nivelAcesso === 'administrador'
    const isOperacional = nivelAcesso === 'operacional'
    const isConsulta = nivelAcesso === 'consulta'

    const podeVerDashboard = true
    const podeVerLeads = true
    const podeVerPipeline = true
    const podeVerPosVendas = true
    const podeVerTarefas = true
    const podeVerRelatorioComercial = isAdministrador || isConsulta
    const podeVerRelatorioVendedores = isAdministrador || isOperacional || isConsulta
    const podeVerImportacao = isAdministrador
    const podeVerCadastros = isAdministrador
    const podeVerUsuarios = isAdministrador
    const podeVerConfiguracoes = isAdministrador
    const podeVerMarketing = isAdministrador || isConsulta
    const podeVerRelatorios =
          podeVerRelatorioComercial || podeVerRelatorioVendedores || podeVerMarketing

    return (
      <aside className="w-64 shrink-0 bg-[#0A2A3A] text-white flex min-h-screen flex-col">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <Image
  src="/logo.png"
  alt="Ergotex"
  width={40}
  height={40}
  className="object-contain"
/>
          <span className="font-bold text-lg">Ergotex</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 text-sm">
          {podeVerDashboard ? (
            <a
              href="/crm"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/crm' ? 'bg-white/10' : ''
              }`}
            >
              Dashboard
            </a>
          ) : null}

          {podeVerLeads ? (
            <a
              href="/leads"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/leads' ? 'bg-white/10' : ''
              }`}
            >
              Leads
            </a>
          ) : null}

          {podeVerImportacao ? (
            <a
              href="/importacao-leads"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/importacao-leads' ? 'bg-white/10' : ''
              }`}
            >
              Importação
            </a>
          ) : null}

          {podeVerCadastros ? (
            <a
              href="/cadastros"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/cadastros' ? 'bg-white/10' : ''
              }`}
            >
              Cadastros
            </a>
          ) : null}

          {podeVerPipeline ? (
            <a
              href="/pipeline"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/pipeline' ? 'bg-white/10' : ''
              }`}
            >
              Pipeline
            </a>
          ) : null}

          {podeVerPosVendas ? (
            <a
              href="/pos-vendas"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/pos-vendas' ? 'bg-white/10' : ''
              }`}
            >
              Pós-vendas
            </a>
          ) : null}

          {podeVerTarefas ? (
            <a
              href="/tarefas"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/tarefas' ? 'bg-white/10' : ''
              }`}
            >
              Tarefas
            </a>
          ) : null}

          {podeVerRelatorios ? (
            <div className="space-y-1">
              <div
                className={`px-4 py-2 rounded-lg font-medium ${
                  pathname.startsWith('/relatorios') ? 'bg-white/10' : ''
                }`}
              >
                Relatórios
              </div>

              <div className="ml-3 space-y-1 border-l border-white/10 pl-3">
                {podeVerRelatorioComercial ? (
                  <a
                    href="/relatorios/comercial"
                    className={`block rounded-lg px-3 py-2 text-sm hover:bg-white/10 ${
                      pathname === '/relatorios/comercial' ? 'bg-white/10' : ''
                    }`}
                  >
                    Comercial
                  </a>
                ) : null}

                {podeVerRelatorioVendedores ? (
                  <a
                    href="/relatorios/vendedores"
                    className={`block rounded-lg px-3 py-2 text-sm hover:bg-white/10 ${
                      pathname === '/relatorios/vendedores' ? 'bg-white/10' : ''
                    }`}
                  >
                    Vendedores
                  </a>
                ) : null}

                {podeVerMarketing ? (
  <>
    <a
      href="/relatorios/marketing/google"
      className={`block rounded-lg px-3 py-2 text-sm hover:bg-white/10 ${
        pathname === '/relatorios/marketing/google' ? 'bg-white/10' : ''
      }`}
    >
      Marketing
    </a>

    <a
      href="/relatorios/marketing/comparativo"
      className={`block rounded-lg px-3 py-2 text-sm hover:bg-white/10 ${
        pathname === '/relatorios/marketing/comparativo' ? 'bg-white/10' : ''
      }`}
    >
      Comparativo
    </a>
  </>
) : null}
              </div>
            </div>
          ) : null}

          {podeVerUsuarios ? (
            <a
              href="/usuarios"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/usuarios' ? 'bg-white/10' : ''
              }`}
            >
              Usuários
            </a>
          ) : null}

          {podeVerConfiguracoes ? (
            <a
              href="/configuracoes"
              className={`block px-4 py-2 rounded-lg hover:bg-white/10 ${
                pathname === '/configuracoes' ? 'bg-white/10' : ''
              }`}
            >
              Configurações
            </a>
          ) : null}
        </nav>

        <div className="px-4 pb-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              Perfil atual
            </p>
            <p className="mt-1 text-xs font-bold text-white">
              {isAdministrador
                ? 'Administrador'
                : isOperacional
                ? 'Operacional'
                : isConsulta
                ? 'Consulta'
                : 'Administrador'}
            </p>
          </div>
        </div>

        <div className="p-4 text-xs text-white/50 border-t border-white/10">
          © Ergotex
        </div>
      </aside>
    )
  }