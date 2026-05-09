'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type TipoProduto = { id: number; nome: string; ativo: boolean }
type Processo = { id: number; tipo_produto_id: number; nome: string; sequencia: number; ativo: boolean }

export default function CadastrosProducaoPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [tipoSelecionado, setTipoSelecionado] = useState<number | null>(null)
  const [novoTipo, setNovoTipo] = useState('')
  const [novoProcesso, setNovoProcesso] = useState('')
  const [editandoTipoId, setEditandoTipoId] = useState<number | null>(null)
  const [editandoTipoNome, setEditandoTipoNome] = useState('')
  const [editandoProcessoId, setEditandoProcessoId] = useState<number | null>(null)
  const [editandoProcessoNome, setEditandoProcessoNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregarTodos() }, [])

  async function carregarTodos() {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('producao_tipos_produto').select('*').order('id'),
      supabase.from('producao_processos').select('*').order('sequencia'),
    ])
    setTipos(t || [])
    setProcessos(p || [])
    if (!tipoSelecionado && t && t.length > 0) setTipoSelecionado(t[0].id)
  }

  const processosFiltrados = processos.filter((p) => p.tipo_produto_id === tipoSelecionado)

  // TIPOS
  async function adicionarTipo() {
    if (!novoTipo.trim()) return
    setSalvando(true)
    await supabase.from('producao_tipos_produto').insert({ nome: novoTipo.trim() })
    setNovoTipo('')
    await carregarTodos()
    setSalvando(false)
  }

  async function salvarEdicaoTipo(id: number) {
    if (!editandoTipoNome.trim()) return
    setSalvando(true)
    await supabase.from('producao_tipos_produto').update({ nome: editandoTipoNome.trim() }).eq('id', id)
    setEditandoTipoId(null)
    await carregarTodos()
    setSalvando(false)
  }

  async function toggleAtivoTipo(id: number, ativo: boolean) {
    await supabase.from('producao_tipos_produto').update({ ativo: !ativo }).eq('id', id)
    await carregarTodos()
  }

  async function excluirTipo(id: number) {
    if (!confirm('Excluir este tipo? Os processos vinculados serão excluídos também.')) return
    await supabase.from('producao_tipos_produto').delete().eq('id', id)
    if (tipoSelecionado === id) setTipoSelecionado(null)
    await carregarTodos()
  }

  // PROCESSOS
  async function adicionarProcesso() {
    if (!novoProcesso.trim() || !tipoSelecionado) return
    setSalvando(true)
    const maxSeq = processosFiltrados.reduce((m, p) => Math.max(m, p.sequencia), 0)
    await supabase.from('producao_processos').insert({ tipo_produto_id: tipoSelecionado, nome: novoProcesso.trim(), sequencia: maxSeq + 1 })
    setNovoProcesso('')
    await carregarTodos()
    setSalvando(false)
  }

  async function salvarEdicaoProcesso(id: number) {
    if (!editandoProcessoNome.trim()) return
    setSalvando(true)
    await supabase.from('producao_processos').update({ nome: editandoProcessoNome.trim() }).eq('id', id)
    setEditandoProcessoId(null)
    await carregarTodos()
    setSalvando(false)
  }

  async function excluirProcesso(id: number) {
    if (!confirm('Excluir este processo?')) return
    await supabase.from('producao_processos').delete().eq('id', id)
    await carregarTodos()
  }

  async function moverProcesso(id: number, direcao: 'cima' | 'baixo') {
    const idx = processosFiltrados.findIndex((p) => p.id === id)
    const outro = direcao === 'cima' ? processosFiltrados[idx - 1] : processosFiltrados[idx + 1]
    if (!outro) return
    const atual = processosFiltrados[idx]
    await Promise.all([
      supabase.from('producao_processos').update({ sequencia: outro.sequencia }).eq('id', atual.id),
      supabase.from('producao_processos').update({ sequencia: atual.sequencia }).eq('id', outro.id),
    ])
    await carregarTodos()
  }

  async function toggleAtivoProcesso(id: number, ativo: boolean) {
    await supabase.from('producao_processos').update({ ativo: !ativo }).eq('id', id)
    await carregarTodos()
  }

  const card = 'bg-white border border-slate-200 rounded-2xl shadow-sm'
  const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
  const btn = (cor: string) => `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer border-none text-white ${cor}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-[#0b1733]">Cadastros de Produção</h1>
        <p className="text-sm text-slate-500">Gerencie os tipos de produto e os processos de cada tipo</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* Tipos de produto */}
        <div className={`${card} p-5`}>
          <h2 className="mb-4 text-base font-bold text-[#0b1733]">Tipos de Produto</h2>

          <div className="mb-4 flex gap-2">
            <input
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && adicionarTipo()}
              placeholder="Novo tipo..."
              className={`${input} flex-1`}
            />
            <button onClick={adicionarTipo} disabled={salvando || !novoTipo.trim()} className={btn('bg-slate-800 hover:bg-slate-900 disabled:opacity-50')}>
              Adicionar
            </button>
          </div>

          <div className="space-y-1">
            {tipos.map((tipo) => (
              <div
                key={tipo.id}
                onClick={() => setTipoSelecionado(tipo.id)}
                className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${tipoSelecionado === tipo.id ? 'bg-[#0b1733] text-white' : 'hover:bg-slate-100'}`}
              >
                {editandoTipoId === tipo.id ? (
                  <input
                    value={editandoTipoNome}
                    onChange={(e) => setEditandoTipoNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicaoTipo(tipo.id); if (e.key === 'Escape') setEditandoTipoId(null) }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none"
                  />
                ) : (
                  <span className={`text-sm font-medium ${!tipo.ativo ? 'line-through opacity-50' : ''}`}>{tipo.nome}</span>
                )}

                <div className="ml-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {editandoTipoId === tipo.id ? (
                    <>
                      <button onClick={() => salvarEdicaoTipo(tipo.id)} className="rounded px-1.5 py-0.5 text-xs bg-green-500 text-white">✓</button>
                      <button onClick={() => setEditandoTipoId(null)} className="rounded px-1.5 py-0.5 text-xs bg-slate-400 text-white">✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditandoTipoId(tipo.id); setEditandoTipoNome(tipo.nome) }} className={`rounded px-1.5 py-0.5 text-xs ${tipoSelecionado === tipo.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>✎</button>
                      <button onClick={() => toggleAtivoTipo(tipo.id, tipo.ativo)} className={`rounded px-1.5 py-0.5 text-xs ${tipoSelecionado === tipo.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{tipo.ativo ? '○' : '●'}</button>
                      <button onClick={() => excluirTipo(tipo.id)} className={`rounded px-1.5 py-0.5 text-xs ${tipoSelecionado === tipo.id ? 'bg-red-400 text-white' : 'bg-red-100 text-red-600'}`}>✕</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Processos do tipo selecionado */}
        <div className={`${card} p-5`}>
          <h2 className="mb-4 text-base font-bold text-[#0b1733]">
            Processos
            {tipoSelecionado && <span className="ml-2 text-slate-400 font-normal text-sm">— {tipos.find(t => t.id === tipoSelecionado)?.nome}</span>}
          </h2>

          {!tipoSelecionado ? (
            <p className="text-sm text-slate-400">Selecione um tipo de produto para ver os processos.</p>
          ) : (
            <>
              <div className="mb-4 flex gap-2">
                <input
                  value={novoProcesso}
                  onChange={(e) => setNovoProcesso(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && adicionarProcesso()}
                  placeholder="Nome do processo..."
                  className={`${input} flex-1`}
                />
                <button onClick={adicionarProcesso} disabled={salvando || !novoProcesso.trim()} className={btn('bg-slate-800 hover:bg-slate-900 disabled:opacity-50')}>
                  Adicionar
                </button>
              </div>

              {processosFiltrados.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum processo cadastrado para este tipo.</p>
              ) : (
                <div className="space-y-2">
                  {processosFiltrados.map((proc, idx) => (
                    <div key={proc.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${!proc.ativo ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'}`}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{idx + 1}</span>

                      {editandoProcessoId === proc.id ? (
                        <input
                          value={editandoProcessoNome}
                          onChange={(e) => setEditandoProcessoNome(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicaoProcesso(proc.id); if (e.key === 'Escape') setEditandoProcessoId(null) }}
                          autoFocus
                          className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
                        />
                      ) : (
                        <span className={`flex-1 text-sm font-medium ${!proc.ativo ? 'line-through' : ''}`}>{proc.nome}</span>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        {editandoProcessoId === proc.id ? (
                          <>
                            <button onClick={() => salvarEdicaoProcesso(proc.id)} className={btn('bg-green-500')}>✓</button>
                            <button onClick={() => setEditandoProcessoId(null)} className={btn('bg-slate-400')}>✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => moverProcesso(proc.id, 'cima')} disabled={idx === 0} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">↑</button>
                            <button onClick={() => moverProcesso(proc.id, 'baixo')} disabled={idx === processosFiltrados.length - 1} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30">↓</button>
                            <button onClick={() => { setEditandoProcessoId(proc.id); setEditandoProcessoNome(proc.nome) }} className={btn('bg-blue-600')}>✎</button>
                            <button onClick={() => toggleAtivoProcesso(proc.id, proc.ativo)} className={btn(proc.ativo ? 'bg-amber-500' : 'bg-green-500')}>{proc.ativo ? 'Desativar' : 'Ativar'}</button>
                            <button onClick={() => excluirProcesso(proc.id)} className={btn('bg-red-600')}>Excluir</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
