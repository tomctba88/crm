'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Estado = { id: number; nome: string; uf: string }
type Cidade = { id: number; nome: string; estado_id: number; frete_estados?: { nome: string; uf: string } | { nome: string; uf: string }[] }

export default function CidadesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [nomeCidade, setNomeCidade] = useState('')
  const [estadoId, setEstadoId] = useState('')
  const [estados, setEstados] = useState<Estado[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [busca, setBusca] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)

  useEffect(() => { buscarEstados(); buscarCidades() }, [])

  async function buscarEstados() {
    const { data } = await supabase.from('frete_estados').select('*').order('nome')
    setEstados(data || [])
  }

  async function buscarCidades() {
    const { data } = await supabase.from('frete_cidades').select('id,nome,estado_id,frete_estados(nome,uf)').order('id')
    setCidades((data || []) as Cidade[])
  }

  async function salvarOuAtualizar() {
    if (!nomeCidade || !estadoId) { alert('Preencha o nome da cidade e selecione o estado.'); return }
    if (editandoId) {
      const { error } = await supabase.from('frete_cidades').update({ nome: nomeCidade, estado_id: Number(estadoId) }).eq('id', editandoId)
      if (error) { alert('Erro ao atualizar cidade.'); return }
      alert('Cidade atualizada!')
    } else {
      const { error } = await supabase.from('frete_cidades').insert([{ nome: nomeCidade, estado_id: Number(estadoId) }])
      if (error) { alert('Erro ao salvar cidade.'); return }
      alert('Cidade cadastrada!')
    }
    limpar(); buscarCidades()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir esta cidade?')) return
    const { error } = await supabase.from('frete_cidades').delete().eq('id', id)
    if (error) { alert('Erro ao excluir cidade.'); return }
    if (editandoId === id) limpar()
    buscarCidades()
  }

  function limpar() { setNomeCidade(''); setEstadoId(''); setEditandoId(null) }

  function getNome(c: Cidade) { return Array.isArray(c.frete_estados) ? c.frete_estados[0]?.nome || '-' : c.frete_estados?.nome || '-' }
  function getUF(c: Cidade) { return Array.isArray(c.frete_estados) ? c.frete_estados[0]?.uf || '-' : c.frete_estados?.uf || '-' }

  const filtradas = cidades.filter((c) => {
    const texto = busca.toLowerCase()
    return c.nome.toLowerCase().includes(texto) || getNome(c).toLowerCase().includes(texto) || getUF(c).toLowerCase().includes(texto)
  })

  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5'
  const input = 'rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500'
  const th = { padding: '12px 10px', textAlign: 'left' as const, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13px', fontWeight: 700 }
  const td = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }

  return (
    <div>
      <div className={card}>
        <p className="mb-4 font-bold text-slate-700">{editandoId ? 'Editar cidade' : 'Nova cidade'}</p>
        <div className="flex flex-wrap gap-3 items-end">
          <input type="text" placeholder="Nome da cidade" value={nomeCidade} onChange={(e) => setNomeCidade(e.target.value)} className={input} style={{ minWidth: '220px' }} />
          <select value={estadoId} onChange={(e) => setEstadoId(e.target.value)} className={input} style={{ minWidth: '200px' }}>
            <option value="">Selecione o estado</option>
            {estados.map((e) => <option key={e.id} value={e.id}>{e.nome} - {e.uf}</option>)}
          </select>
          <button onClick={salvarOuAtualizar} className="rounded-xl bg-slate-800 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-900 transition-colors cursor-pointer border-none">
            {editandoId ? 'Atualizar Cidade' : 'Salvar Cidade'}
          </button>
          {editandoId && <button onClick={limpar} className="rounded-xl bg-slate-500 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-600 transition-colors cursor-pointer border-none">Cancelar Edição</button>}
        </div>
      </div>

      <div className={card}>
        <input type="text" placeholder="Buscar cidade, estado ou UF..." value={busca} onChange={(e) => setBusca(e.target.value)}
          className="mb-4 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 w-full max-w-sm" />
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '500px' }}>
            <thead><tr>{['ID','Cidade','Estado','UF','Ações'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.id}</td>
                  <td style={td}>{c.nome}</td>
                  <td style={td}>{getNome(c)}</td>
                  <td style={td}>{getUF(c)}</td>
                  <td style={td}>
                    <button onClick={() => { setNomeCidade(c.nome); setEstadoId(String(c.estado_id)); setEditandoId(c.id) }} className="mr-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer border-none">Editar</button>
                    <button onClick={() => excluir(c.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer border-none">Excluir</button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && <tr><td style={td} colSpan={5} className="text-center text-slate-400">Nenhuma cidade encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
