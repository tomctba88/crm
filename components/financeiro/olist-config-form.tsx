'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type OlistConfigFormProps = {
  tokenInicial: string
  statusInicial: string
  ativoInicial: boolean
  observacoesIniciais: string
}

export default function OlistConfigForm({
  tokenInicial,
  statusInicial,
  ativoInicial,
  observacoesIniciais,
}: OlistConfigFormProps) {
  const router = useRouter()
  const [token, setToken] = useState(tokenInicial)
  const [ativo, setAtivo] = useState(ativoInicial)
  const [status, setStatus] = useState(statusInicial)
  const [observacoes, setObservacoes] = useState(observacoesIniciais)
  const [loadingSalvar, setLoadingSalvar] = useState(false)
  const [loadingTeste, setLoadingTeste] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoadingSalvar(true)
    setMensagem('')
    setErro('')
    try {
      const response = await fetch('/api/integracoes/olist/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ativo, observacoes }),
      })
      const data = await response.json()
      if (!response.ok) { setErro(data.error || 'Erro ao salvar configuração.'); return }
      setStatus(data.status || 'configurado')
      setMensagem('Configuração salva com sucesso.')
      router.refresh()
    } catch {
      setErro('Erro inesperado ao salvar configuração.')
    } finally {
      setLoadingSalvar(false)
    }
  }

  async function handleTestarConexao() {
    setLoadingTeste(true)
    setMensagem('')
    setErro('')
    try {
      const response = await fetch('/api/integracoes/olist/testar', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) { setErro(data.error || 'Falha ao testar conexão.'); setStatus(data.status || 'erro'); return }
      setStatus(data.status || 'conectado')
      setMensagem(data.message || 'Conexão com Olist/Tiny validada com sucesso.')
      router.refresh()
    } catch {
      setErro('Erro inesperado ao testar conexão.')
    } finally {
      setLoadingTeste(false)
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-2xl font-black text-[#0b1733]">Configuração da integração</h3>
      <p className="mt-3 text-slate-600">
        Informe o token da API do Olist/Tiny para permitir sincronizações futuras.
      </p>

      <form onSubmit={handleSalvar} className="mt-8 space-y-6">
        <div>
          <label className="mb-3 block text-lg font-bold text-[#0b1733]">Token da API</label>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole aqui o token da API do Olist/Tiny"
            className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-[#eef3fb] px-5 py-4 text-sm text-slate-900 outline-none transition focus:border-[#1b4fd6] focus:ring-4 focus:ring-blue-100"
          />
          <p className="mt-2 text-sm text-slate-500">O token será salvo para uso nas integrações do sistema.</p>
        </div>

        <div>
          <label className="mb-3 block text-lg font-bold text-[#0b1733]">Observações</label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Informações internas sobre a integração"
            className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-[#eef3fb] px-5 py-4 text-sm text-slate-900 outline-none transition focus:border-[#1b4fd6] focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <label className="flex items-center gap-3 rounded-2xl bg-[#eef3fb] px-4 py-4">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300"
          />
          <span className="text-sm font-semibold text-[#0b1733]">Deixar integração ativa</span>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="submit"
            disabled={loadingSalvar}
            className="h-14 rounded-2xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] text-base font-extrabold text-white shadow-[0_16px_35px_rgba(29,78,216,0.25)] transition hover:opacity-95 disabled:opacity-70"
          >
            {loadingSalvar ? 'Salvando...' : 'Salvar configuração'}
          </button>
          <button
            type="button"
            onClick={handleTestarConexao}
            disabled={loadingTeste}
            className="h-14 rounded-2xl border border-slate-200 bg-white text-base font-extrabold text-[#0b1733] transition hover:bg-slate-50 disabled:opacity-70"
          >
            {loadingTeste ? 'Testando...' : 'Testar conexão'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Status atual</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">{status}</p>
          </div>
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Integração ativa</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">{ativo ? 'Sim' : 'Não'}</p>
          </div>
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Token informado</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">{token ? 'Sim' : 'Não'}</p>
          </div>
        </div>

        {mensagem && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {mensagem}
          </div>
        )}
        {erro && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {erro}
          </div>
        )}
      </form>
    </div>
  )
}
