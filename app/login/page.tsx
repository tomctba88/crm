'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser-client'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectedFrom = searchParams.get('redirectedFrom') || '/dashboard'

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }

    router.refresh()
    router.replace(redirectedFrom)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#163d7a_0%,_#0b2a5b_38%,_#061733_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl grid-cols-1 overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur md:grid-cols-[1.35fr_0.9fr]">
        <div className="relative flex flex-col justify-between bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-8 text-white md:p-12">
          <div>
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold tracking-wide text-white/90">
              SISTEMA INTERNO
            </div>

            <div className="mt-8">
              <img
                src="/logo.png"
                alt="Ergotex"
                className="h-28 w-28 rounded-xl bg-white object-contain p-2 shadow-lg md:h-36 md:w-36"
              />
            </div>

            <div className="mt-10">
              <h1 className="text-5xl font-black leading-tight tracking-tight md:text-7xl">
                Ergotex CRM
              </h1>

              <p className="mt-3 text-2xl font-semibold text-white/90 md:text-3xl">
                Ergotex Mobiliário Corporativo
              </p>

              <p className="mt-8 max-w-2xl text-lg leading-8 text-white/80">
                Acesse o sistema central da Ergotex para acompanhar leads,
                negociações, propostas, tarefas e indicadores comerciais em um
                ambiente seguro, organizado e profissional.
              </p>

              <p className="mt-8 text-2xl font-extrabold italic text-white md:text-4xl">
                “A escolha certa para o seu negócio.”
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl">
                  📦
                </div>
                <div>
                  <p className="text-xl font-bold">Leads & Propostas</p>
                  <p className="text-sm text-white/75">
                    Controle centralizado do comercial.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl">
                  📊
                </div>
                <div>
                  <p className="text-xl font-bold">Dashboard</p>
                  <p className="text-sm text-white/75">
                    Indicadores visuais e acompanhamento rápido.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center bg-[#f7f8fb] p-6 md:p-10">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-8 shadow-[0_25px_60px_rgba(15,23,42,0.18)] md:p-10">
            <div className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-[#1b4fd6]">
              Entrar no sistema
            </div>

            <h2 className="mt-6 text-4xl font-black leading-tight text-[#0b1733] md:text-5xl">
              Bem-vindo de volta
            </h2>

            <p className="mt-3 text-lg leading-7 text-slate-500">
              Faça login para acessar o painel comercial da Ergotex.
            </p>

            <form onSubmit={handleLogin} className="mt-10 space-y-6">
              <div>
                <label className="mb-3 block text-lg font-bold text-[#0b1733]">
                  E-mail
                </label>
                <input
                  type="email"
                  placeholder="Digite seu e-mail"
                  className="h-16 w-full rounded-2xl border border-slate-200 bg-[#eef3fb] px-5 text-lg text-slate-900 outline-none transition focus:border-[#1b4fd6] focus:ring-4 focus:ring-blue-100"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-3 block text-lg font-bold text-[#0b1733]">
                  Senha
                </label>

                <div className="flex h-16 overflow-hidden rounded-2xl border border-slate-200 bg-[#eef3fb] focus-within:border-[#1b4fd6] focus-within:ring-4 focus-within:ring-blue-100">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    className="h-full flex-1 bg-transparent px-5 text-lg text-slate-900 outline-none"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setMostrarSenha((prev) => !prev)}
                    className="m-2 rounded-xl bg-white px-5 text-base font-bold text-[#0b1733] shadow-sm transition hover:bg-slate-50"
                  >
                    {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              {erro ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {erro}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="h-16 w-full rounded-2xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] text-xl font-extrabold text-white shadow-[0_16px_35px_rgba(29,78,216,0.35)] transition hover:scale-[1.01] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Entrando...' : 'Entrar no Ergotex CRM'}
              </button>
            </form>

            <p className="mt-8 text-center text-base text-slate-500">
              Acesso restrito a usuários autorizados.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}