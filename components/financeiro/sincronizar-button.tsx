'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Escopo = 'completo' | 'caixa' | 'contas' | 'vendas'

type Props = {
  escopo?: Escopo
  ultimaSync?: string | null
  className?: string
  onSucesso?: () => void
}

export default function SincronizarButton({ escopo = 'completo', ultimaSync, className, onSucesso }: Props) {
  const [estado, setEstado] = useState<'idle' | 'loading' | 'sucesso' | 'erro'>('idle')
  const [mensagem, setMensagem] = useState('')
  const router = useRouter()

  async function handleClick() {
    setEstado('loading')
    setMensagem('')
    try {
      const res = await fetch('/api/financeiro/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escopo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEstado('erro')
        setMensagem(data.error ?? 'Erro ao sincronizar.')
        return
      }
      setEstado('sucesso')
      const partes = []
      if (data.caixa?.sincronizados) partes.push(`${data.caixa.sincronizados} caixa`)
      if (data.contas_receber?.sincronizados) partes.push(`${data.contas_receber.sincronizados} receber`)
      if (data.contas_pagar?.sincronizados) partes.push(`${data.contas_pagar.sincronizados} pagar`)
      if (data.vendas?.pedidos) partes.push(`${data.vendas.pedidos} pedidos`)
      setMensagem(partes.length > 0 ? partes.join(' · ') : 'Sincronizado.')
      onSucesso?.()
      router.refresh()
      setTimeout(() => setEstado('idle'), 5000)
    } catch {
      setEstado('erro')
      setMensagem('Erro de conexão.')
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        onClick={handleClick}
        disabled={estado === 'loading'}
        className={
          className ??
          'h-11 rounded-2xl bg-[#0b1733] px-6 text-sm font-bold text-white shadow transition hover:bg-[#1b4fd6] disabled:opacity-60'
        }
      >
        {estado === 'loading' ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sincronizando...
          </span>
        ) : estado === 'sucesso' ? (
          <span className="flex items-center gap-2">✓ Sincronizado</span>
        ) : estado === 'erro' ? (
          '✗ Tentar novamente'
        ) : (
          'Sincronizar com Tiny'
        )}
      </button>
      {mensagem && (
        <span className={`text-xs font-semibold ${estado === 'erro' ? 'text-red-500' : 'text-green-600'}`}>
          {mensagem}
        </span>
      )}
      {ultimaSync && estado === 'idle' && (
        <span className="text-[10px] text-slate-400">
          Última sync: {new Date(ultimaSync).toLocaleString('pt-BR')}
        </span>
      )}
    </div>
  )
}
