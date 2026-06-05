'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Produto = { id: number; nome: string; sku: string | null; largura: number | null; comprimento: number | null; altura: number | null; peso: number | null }

export default function ProdutosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [nome, setNome] = useState('')
  const [sku, setSku] = useState('')
  const [largura, setLargura] = useState('')
  const [comprimento, setComprimento] = useState('')
  const [altura, setAltura] = useState('')
  const [peso, setPeso] = useState('')
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { buscarProdutos() }, [])

  async function buscarProdutos() {
    setLoading(true)
    const { data } = await supabase.from('frete_produtos').select('id,nome,sku,largura,comprimento,altura,peso').order('id')
    setLoading(false)
    setProdutos(data || [])
  }

  async function salvarOuAtualizar() {
    if (!nome || !largura || !comprimento || !altura) { alert('Preencha nome, largura, comprimento e altura.'); return }
    const payload = { nome: nome.trim(), sku: sku.trim() || null, largura: Number(largura.replace(',', '.')), comprimento: Number(comprimento.replace(',', '.')), altura: Number(altura.replace(',', '.')), peso: peso ? Number(peso.replace(',', '.')) : null }
    if (editandoId) {
      const { error } = await supabase.from('frete_produtos').update(payload).eq('id', editandoId)
      if (error) { alert(error.message || 'Erro ao atualizar.'); return }
      alert('Produto atualizado!')
    } else {
      const { error } = await supabase.from('frete_produtos').insert([payload])
      if (error) { alert(error.message || 'Erro ao salvar.'); return }
      alert('Produto cadastrado!')
    }
    limpar(); buscarProdutos()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este produto?')) return
    const { error } = await supabase.from('frete_produtos').delete().eq('id', id)
    if (error) { alert(error.message || 'Erro ao excluir.'); return }
    if (editandoId === id) limpar()
    buscarProdutos()
  }

  function editar(p: Produto) {
    setNome(p.nome); setSku(p.sku ?? ''); setLargura(p.largura != null ? String(p.largura) : ''); setComprimento(p.comprimento != null ? String(p.comprimento) : '')
    setAltura(p.altura != null ? String(p.altura) : ''); setPeso(p.peso != null ? String(p.peso) : ''); setEditandoId(p.id)
  }

  function limpar() { setNome(''); setSku(''); setLargura(''); setComprimento(''); setAltura(''); setPeso(''); setEditandoId(null) }

  function calcCubagem(p: Produto) { return (Number(p.largura || 0) / 1000) * (Number(p.comprimento || 0) / 1000) * (Number(p.altura || 0) / 1000) }
  function fmtN(v: number, casas = 2) { return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) }

  const produtosFiltrados = useMemo(() => {
    const q = busca.toLowerCase()
    return produtos.filter((p) => p.nome.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
  }, [produtos, busca])

  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5'
  const input = 'rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 w-full'
  const th = { padding: '12px 10px', textAlign: 'left' as const, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13px', fontWeight: 700 }
  const td = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }

  return (
    <div>
      <div className={card}>
        <p className="mb-4 font-bold text-slate-700">{editandoId ? 'Editar produto' : 'Novo produto'}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <div className="lg:col-span-2"><input type="text" placeholder="Nome do produto" value={nome} onChange={(e) => setNome(e.target.value)} className={input} /></div>
          <input type="text" placeholder="SKU (Shopify)" value={sku} onChange={(e) => setSku(e.target.value)} className={input} />
          <input type="text" placeholder="Largura (mm)" value={largura} onChange={(e) => setLargura(e.target.value)} className={input} />
          <input type="text" placeholder="Comprimento (mm)" value={comprimento} onChange={(e) => setComprimento(e.target.value)} className={input} />
          <input type="text" placeholder="Altura (mm)" value={altura} onChange={(e) => setAltura(e.target.value)} className={input} />
          <input type="text" placeholder="Peso (kg)" value={peso} onChange={(e) => setPeso(e.target.value)} className={input} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={salvarOuAtualizar} className="rounded-xl bg-slate-800 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-900 transition-colors cursor-pointer border-none">{editandoId ? 'Atualizar Produto' : 'Salvar Produto'}</button>
          {editandoId && <button onClick={limpar} className="rounded-xl bg-slate-500 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-600 transition-colors cursor-pointer border-none">Cancelar Edição</button>}
        </div>
      </div>

      <div className={card}>
        <input type="text" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 w-full max-w-sm" />
        <p className="mb-3 text-xs text-slate-400">{loading ? 'Carregando...' : `${produtosFiltrados.length} produto(s) exibido(s).`}</p>
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
            <thead>
              <tr>{['ID','Nome','SKU','Largura (mm)','Comprimento (mm)','Altura (mm)','Peso (kg)','Cubagem Unit. (m³)','Ações'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {produtosFiltrados.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.id}</td>
                  <td style={td}>{p.nome}</td>
                  <td style={td}>{p.sku || '-'}</td>
                  <td style={td}>{p.largura != null ? fmtN(p.largura, 0) : '-'}</td>
                  <td style={td}>{p.comprimento != null ? fmtN(p.comprimento, 0) : '-'}</td>
                  <td style={td}>{p.altura != null ? fmtN(p.altura, 0) : '-'}</td>
                  <td style={td}>{p.peso != null ? fmtN(p.peso, 2) : '-'}</td>
                  <td style={td}>{fmtN(calcCubagem(p), 4)} m³</td>
                  <td style={td}>
                    <button onClick={() => editar(p)} className="mr-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer border-none">Editar</button>
                    <button onClick={() => excluir(p.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer border-none">Excluir</button>
                  </td>
                </tr>
              ))}
              {!loading && produtosFiltrados.length === 0 && <tr><td style={td} colSpan={9} className="text-center text-slate-400">Nenhum produto encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
