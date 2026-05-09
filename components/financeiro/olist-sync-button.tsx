'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OlistSyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  async function handleSync() {
    setLoading(true)
    setMensagem('')
    setErro('')
    try {
      const response = await fetch('/api/integracoes/olist/sincronizar', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) { setErro(data.error || 'Erro ao sincronizar dados.'); return }
      setMensagem(data.message || 'Sincronização concluída com sucesso.')
      router.refresh()
    } catch {
      setErro('Erro inesperado ao sincronizar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-2xl font-black text-[#0b1733]">Sincronização manual</h3>
      <p className="mt-3 text-slate-600">Executa a sincronização dos dados do Tiny/Olist para o Ergotex One.</p>
      <div className="mt-6">
        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="h-14 rounded-2xl bg-green-600 px-6 text-base font-extrabold text-white transition hover:bg-green-700 disabled:opacity-70"
        >
          {loading ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>
      {mensagem && (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {mensagem}
        </div>
      )}
      {erro && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {erro}
        </div>
      )}
    </div>
  )
}
