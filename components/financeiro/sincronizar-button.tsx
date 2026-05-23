'use client'

import { useState } from 'react'

type Tipo = 'completo' | 'receber' | 'pagar' | 'caixa' | 'fluxo'

const ROTAS: Record<Tipo, string> = {
  completo: '/api/financeiro/sincronizar',
  receber: '/api/financeiro/sincronizar/contas-receber',
  pagar: '/api/financeiro/sincronizar/contas-pagar',
  caixa: '/api/financeiro/sincronizar/caixa',
  fluxo: '/api/financeiro/sincronizar/fluxo-caixa',
}

const LABELS: Record<Tipo, string> = {
  completo: 'Sincronizar com Tiny',
  receber: 'Sincronizar Receber',
  pagar: 'Sincronizar Pagar',
  caixa: 'Sincronizar Caixa',
  fluxo: 'Sincronizar Fluxo',
}

type SincronizarButtonProps = {
  tipo?: Tipo
  onSucesso?: () => void
  className?: string
}

export default function SincronizarButton({ tipo = 'completo', onSucesso, className }: SincronizarButtonProps) {
  const [estado, setEstado] = useState<'idle' | 'loading' | 'sucesso' | 'erro'>('idle')
  const [mensagem, setMensagem] = useState('')

  async function handleClick() {
    setEstado('loading')
    setMensagem('')
    try {
      const res = await fetch(ROTAS[tipo], { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setEstado('erro')
        setMensagem(data.error ?? 'Erro ao sincronizar.')
        return
      }
      setEstado('sucesso')
      const total = data.total_sincronizados ?? data.sincronizados ?? 0
      setMensagem(`${total} registro(s) sincronizado(s).`)
      onSucesso?.()
      setTimeout(() => setEstado('idle'), 4000)
    } catch {
      setEstado('erro')
      setMensagem('Erro de conexão.')
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleClick}
        disabled={estado === 'loading'}
        className={
          className ??
          'h-11 rounded-2xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] px-6 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(29,78,216,0.25)] transition hover:opacity-95 disabled:opacity-70'
        }
      >
        {estado === 'loading' ? 'Sincronizando...' : LABELS[tipo]}
      </button>
      {mensagem && (
        <span
          className={`text-xs font-semibold ${
            estado === 'erro' ? 'text-red-500' : 'text-green-600'
          }`}
        >
          {mensagem}
        </span>
      )}
    </div>
  )
}
