'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser-client'
import Image from 'next/image'

type NivelAcesso = 'administrador' | 'operacional' | 'consulta'

type Profile = {
  nivel_acesso: NivelAcesso
}

export default function Sidebar({
  isOpen = false,
  onClose,
}: {
  isOpen?: boolean
  onClose?: () => void
}) {
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

  const link = (href: string, label: string, prefix?: boolean) => (
    <a
      href={href}
      onClick={onClose}
      className={`block px-4 py-2.5 rounded-lg hover:bg-white/10 transition-colors ${
        (prefix ? pathname.startsWith(href) : pathname === href) ? 'bg-white/15 font-semibold' : ''
      }`}
    >
      {label}
    </a>
  )

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#0A2A3A] text-white',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:relative lg:z-auto lg:w-64 lg:translate-x-0 lg:shrink-0',
      ].join(' ')}
    >
      {/* Logo + fechar */}
      <div className="flex items-center justify-between border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Ergotex"
            width={36}
            height={36}
            className="rounded-lg object-contain"
          />
          <span className="text-lg font-bold">Ergotex</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Fechar menu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 text-sm">
        {podeVerDashboard && link('/crm', 'Dashboard')}
        {podeVerLeads && link('/leads', 'Leads')}
        {podeVerImportacao && link('/importacao-leads', 'Importação')}
        {podeVerCadastros && link('/cadastros', 'Cadastros')}
        {podeVerPipeline && link('/pipeline', 'Pipeline')}
        {podeVerPosVendas && link('/pos-vendas', 'Pós-vendas')}
        {podeVerTarefas && link('/tarefas', 'Tarefas')}
        {link('/fretes', 'Fretes', true)}

        {podeVerRelatorios && (
          <div className="space-y-0.5">
            <div
              className={`px-4 py-2.5 rounded-lg font-medium text-white/70 ${
                pathname.startsWith('/relatorios') ? 'bg-white/10 text-white' : ''
              }`}
            >
              Relatórios
            </div>

            <div className="ml-3 space-y-0.5 border-l border-white/10 pl-3">
              {podeVerRelatorioComercial && link('/relatorios/comercial', 'Comercial')}
              {podeVerRelatorioVendedores && link('/relatorios/vendedores', 'Vendedores')}
              {podeVerMarketing && (
                <>
                  {link('/relatorios/marketing/google', 'Marketing')}
                  {link('/relatorios/marketing/comparativo', 'Comparativo')}
                  {link('/relatorios/marketing/resumo', 'Resumo MKT')}
                </>
              )}
            </div>
          </div>
        )}

        {podeVerUsuarios && link('/usuarios', 'Usuários')}
        {podeVerConfiguracoes && link('/configuracoes', 'Configurações')}
      </nav>

      {/* Perfil */}
      <div className="p-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Perfil</p>
          <p className="mt-0.5 text-xs font-bold text-white">
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

      <div className="border-t border-white/10 p-4 text-xs text-white/50">
        © Ergotex
      </div>
    </aside>
  )
}
