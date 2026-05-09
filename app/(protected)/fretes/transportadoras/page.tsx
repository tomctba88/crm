'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Transportadora = { id: number; nome: string }

export default function TransportadorasPage() {
  const supabase = useMemo(() => createClient(), [])
  const [nome, setNome] = useState('')
  const [busca, setBusca] = useState('')
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([])
  const [editandoId, setEditandoId] = useState<number | null>(null)

  useEffect(() => { buscarTransportadoras() }, [])

  async function buscarTransportadoras() {
    const { data } = await supabase.from('frete_transportadoras').select('*').order('id')
    setTransportadoras(data || [])
  }

  async function salvarOuAtualizar() {
    if (!nome.trim()) { alert('Preencha o nome da transportadora.'); return }
    if (editandoId) {
      const { error } = await supabase.from('frete_transportadoras').update({ nome: nome.trim() }).eq('id', editandoId)
      if (error) { alert(error.message || 'Erro ao atualizar.'); return }
      alert('Transportadora atualizada!')
    } else {
      const { error } = await supabase.from('frete_transportadoras').insert([{ nome: nome.trim() }])
      if (error) { alert(error.message || 'Erro ao salvar.'); return }
      alert('Transportadora cadastrada!')
    }
    limpar(); buscarTransportadoras()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir esta transportadora?')) return
    const { error } = await supabase.from('frete_transportadoras').delete().eq('id', id)
    if (error) { alert(error.message || 'Erro ao excluir.'); return }
    if (editandoId === id) limpar()
    buscarTransportadoras()
  }

  function limpar() { setNome(''); setEditandoId(null) }

  const filtradas = transportadoras.filter((t) => t.nome.toLowerCase().includes(busca.toLowerCase()))

  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5'
  const th = { padding: '12px 10px', textAlign: 'left' as const, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13px', fontWeight: 700 }
  const td = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }

  return (
    <div>
      <div className={card}>
        <p className="mb-4 font-bold text-slate-700">{editandoId ? 'Editar transportadora' : 'Nova transportadora'}</p>
        <div className="flex flex-wrap gap-3 items-end">
          <input type="text" placeholder="Nome da transportadora" value={nome} onChange={(e) => setNome(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 w-full max-w-sm" />
          <button onClick={salvarOuAtualizar} className="rounded-xl bg-slate-800 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-900 transition-colors cursor-pointer border-none">
            {editandoId ? 'Atualizar Transportadora' : 'Salvar Transportadora'}
          </button>
          {editandoId && <button onClick={limpar} className="rounded-xl bg-slate-500 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-600 transition-colors cursor-pointer border-none">Cancelar Edição</button>}
        </div>
      </div>

      <div className={card}>
        <input type="text" placeholder="Buscar transportadora..." value={busca} onChange={(e) => setBusca(e.target.value)}
          className="mb-4 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 w-full max-w-sm" />
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '400px' }}>
            <thead><tr>{['ID','Nome','Ações'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtradas.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{t.id}</td>
                  <td style={td}>{t.nome}</td>
                  <td style={td}>
                    <button onClick={() => { setNome(t.nome); setEditandoId(t.id) }} className="mr-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer border-none">Editar</button>
                    <button onClick={() => excluir(t.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer border-none">Excluir</button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && <tr><td style={td} colSpan={3} className="text-center text-slate-400">Nenhuma transportadora encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
