'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type Produto = { id: number; nome: string; largura: number | null; comprimento: number | null; altura: number | null; peso: number | null }
type Transportadora = { id: number; nome: string }
type Estado = { id: number; nome: string; uf: string }
type Cidade = { id: number; nome: string; estado_id: number }
type Lancamento = { id: number; quantidade: number; valor_frete: number; data: string; produto_id: number; transportadora_id: number; cidade_id: number; prazo_entrega: number | null }

export default function LancamentosPage() {
  const supabase = useMemo(() => createClient(), [])

  const [produtoId, setProdutoId] = useState('')
  const [transportadoraId, setTransportadoraId] = useState('')
  const [estadoId, setEstadoId] = useState('')
  const [cidadeId, setCidadeId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [valorFrete, setValorFrete] = useState('')
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const [buscaProduto, setBuscaProduto] = useState('')
  const [buscaTransportadora, setBuscaTransportadora] = useState('')
  const [buscaCidade, setBuscaCidade] = useState('')
  const [buscaLista, setBuscaLista] = useState('')
  const [filtroProdutoLista, setFiltroProdutoLista] = useState('')
  const [filtroTransportadoraLista, setFiltroTransportadoraLista] = useState('')
  const [dataInicialLista, setDataInicialLista] = useState('')
  const [dataFinalLista, setDataFinalLista] = useState('')

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([])
  const [estados, setEstados] = useState<Estado[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [cidadesFiltradas, setCidadesFiltradas] = useState<Cidade[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])

  useEffect(() => { buscarProdutos(); buscarTransportadoras(); buscarEstados(); buscarCidades(); buscarLancamentos() }, [])

  useEffect(() => {
    if (!estadoId) { setCidadesFiltradas([]); setCidadeId(''); setBuscaCidade(''); return }
    const filtradas = cidades.filter((c) => String(c.estado_id) === estadoId)
    setCidadesFiltradas(filtradas)
    if (!filtradas.find((c) => String(c.id) === cidadeId)) { setCidadeId(''); setBuscaCidade('') }
  }, [estadoId, cidades])

  async function buscarProdutos() {
    const { data } = await supabase.from('frete_produtos').select('*').order('nome')
    setProdutos(data || [])
  }
  async function buscarTransportadoras() {
    const { data } = await supabase.from('frete_transportadoras').select('*').order('nome')
    setTransportadoras(data || [])
  }
  async function buscarEstados() {
    const { data } = await supabase.from('frete_estados').select('*').order('nome')
    setEstados(data || [])
  }
  async function buscarCidades() {
    const { data } = await supabase.from('frete_cidades').select('*').order('nome')
    setCidades(data || [])
  }
  async function buscarLancamentos() {
    const { data } = await supabase.from('frete_lancamentos').select('*').order('id', { ascending: false })
    setLancamentos(data || [])
  }

  async function salvarOuAtualizar() {
    if (!produtoId || !transportadoraId || !estadoId || !cidadeId || !quantidade || !valorFrete) {
      alert('Preencha todos os campos obrigatórios.')
      return
    }
    const payload = {
      produto_id: Number(produtoId),
      transportadora_id: Number(transportadoraId),
      cidade_id: Number(cidadeId),
      quantidade: Number(quantidade),
      valor_frete: Number(valorFrete.replace(',', '.')),
      prazo_entrega: prazoEntrega ? Number(prazoEntrega) : null,
    }
    if (editandoId) {
      const { error } = await supabase.from('frete_lancamentos').update(payload).eq('id', editandoId)
      if (error) { alert(error.message || 'Erro ao atualizar.'); return }
      alert('Lançamento atualizado!')
    } else {
      const { error } = await supabase.from('frete_lancamentos').insert([payload])
      if (error) { alert(error.message || 'Erro ao salvar.'); return }
      alert('Lançamento salvo!')
    }
    limparFormulario(); buscarLancamentos()
  }

  function editarLancamento(l: Lancamento) {
    setEditandoId(l.id); setProdutoId(String(l.produto_id)); setTransportadoraId(String(l.transportadora_id))
    setCidadeId(String(l.cidade_id)); setQuantidade(String(l.quantidade)); setValorFrete(String(l.valor_frete))
    setPrazoEntrega(l.prazo_entrega != null ? String(l.prazo_entrega) : '')
    const cidade = cidades.find((c) => c.id === l.cidade_id)
    if (cidade) setEstadoId(String(cidade.estado_id))
    setBuscaProduto(''); setBuscaTransportadora(''); setBuscaCidade('')
  }

  async function excluirLancamento(id: number) {
    if (!confirm('Excluir este lançamento?')) return
    const { error } = await supabase.from('frete_lancamentos').delete().eq('id', id)
    if (error) { alert(error.message || 'Erro ao excluir.'); return }
    if (editandoId === id) limparFormulario()
    buscarLancamentos()
  }

  function limparFormulario() {
    setProdutoId(''); setTransportadoraId(''); setEstadoId(''); setCidadeId('')
    setQuantidade(''); setValorFrete(''); setPrazoEntrega('')
    setBuscaProduto(''); setBuscaTransportadora(''); setBuscaCidade(''); setEditandoId(null)
  }

  function fmtMoeda(v: number | string) {
    return Number(typeof v === 'string' ? v.replace(',', '.') : v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  function fmtN(v: number, casas = 2) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) }

  const produtoSelecionado = useMemo(() => produtos.find((p) => String(p.id) === produtoId) || null, [produtoId, produtos])
  const cubagemUnitaria = useMemo(() => {
    if (!produtoSelecionado) return 0
    return (Number(produtoSelecionado.largura || 0) / 1000) * (Number(produtoSelecionado.comprimento || 0) / 1000) * (Number(produtoSelecionado.altura || 0) / 1000)
  }, [produtoSelecionado])
  const cubagemTotal = useMemo(() => cubagemUnitaria * Number(quantidade || 0), [cubagemUnitaria, quantidade])
  const pesoTotal = useMemo(() => Number(produtoSelecionado?.peso || 0) * Number(quantidade || 0), [produtoSelecionado, quantidade])

  const lancamentosFiltrados = useMemo(() => lancamentos.filter((l) => {
    const nomeProduto = (produtos.find((p) => p.id === l.produto_id)?.nome || '').toLowerCase()
    const nomeTrans = (transportadoras.find((t) => t.id === l.transportadora_id)?.nome || '').toLowerCase()
    const nomeCidade = (cidades.find((c) => c.id === l.cidade_id)?.nome || '').toLowerCase()
    const texto = buscaLista.toLowerCase()
    const passouBusca = !buscaLista || nomeProduto.includes(texto) || nomeTrans.includes(texto) || nomeCidade.includes(texto)
    const passouProduto = filtroProdutoLista ? String(l.produto_id) === filtroProdutoLista : true
    const passouTrans = filtroTransportadoraLista ? String(l.transportadora_id) === filtroTransportadoraLista : true
    const dataL = l.data.slice(0, 10)
    return passouBusca && passouProduto && passouTrans && (dataInicialLista ? dataL >= dataInicialLista : true) && (dataFinalLista ? dataL <= dataFinalLista : true)
  }), [lancamentos, buscaLista, filtroProdutoLista, filtroTransportadoraLista, dataInicialLista, dataFinalLista, produtos, transportadoras, cidades])

  const produtosUnicosLista = useMemo(() => [...new Set(lancamentos.map((l) => String(l.produto_id)))], [lancamentos])
  const transUnicasLista = useMemo(() => [...new Set(lancamentos.map((l) => String(l.transportadora_id)))], [lancamentos])

  const input = 'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500'
  const btn = 'w-full rounded-xl bg-slate-800 text-white text-sm font-semibold py-2.5 hover:bg-slate-900 transition-colors cursor-pointer border-none'
  const btnCancel = 'w-full rounded-xl bg-slate-500 text-white text-sm font-semibold py-2.5 hover:bg-slate-600 transition-colors cursor-pointer border-none'
  const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5'
  const th = { padding: '12px 10px', textAlign: 'left' as const, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '13px', fontWeight: 700 }
  const td = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }
  const dropStyle: React.CSSProperties = { position: 'absolute', background: '#fff', border: '1px solid #d1d5db', width: '100%', maxHeight: '160px', overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', borderRadius: '10px' }
  const dropItem: React.CSSProperties = { padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '14px' }

  return (
    <div>
      {/* Formulário */}
      <div className={card}>
        <p className="mb-4 font-bold text-slate-700">{editandoId ? 'Editar lançamento' : 'Novo lançamento'}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Produto */}
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Buscar produto..." value={produtoSelecionado ? produtoSelecionado.nome : buscaProduto}
              onChange={(e) => { setProdutoId(''); setBuscaProduto(e.target.value) }} className={input} />
            {buscaProduto && !produtoId && (
              <div style={dropStyle}>
                {produtos.filter((p) => p.nome.toLowerCase().includes(buscaProduto.toLowerCase())).map((p) => (
                  <div key={p.id} onClick={() => { setProdutoId(String(p.id)); setBuscaProduto('') }} style={dropItem}>{p.nome}</div>
                ))}
              </div>
            )}
          </div>

          {/* Transportadora */}
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Buscar transportadora..." value={transportadoras.find((t) => String(t.id) === transportadoraId)?.nome || buscaTransportadora}
              onChange={(e) => { setTransportadoraId(''); setBuscaTransportadora(e.target.value) }} className={input} />
            {buscaTransportadora && !transportadoraId && (
              <div style={dropStyle}>
                {transportadoras.filter((t) => t.nome.toLowerCase().includes(buscaTransportadora.toLowerCase())).map((t) => (
                  <div key={t.id} onClick={() => { setTransportadoraId(String(t.id)); setBuscaTransportadora('') }} style={dropItem}>{t.nome}</div>
                ))}
              </div>
            )}
          </div>

          {/* Estado */}
          <select value={estadoId} onChange={(e) => setEstadoId(e.target.value)} className={input}>
            <option value="">Selecione o estado</option>
            {estados.map((e) => <option key={e.id} value={e.id}>{e.nome} - {e.uf}</option>)}
          </select>

          {/* Cidade */}
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="Buscar cidade..." value={cidadesFiltradas.find((c) => String(c.id) === cidadeId)?.nome || buscaCidade}
              onChange={(e) => { setCidadeId(''); setBuscaCidade(e.target.value) }} disabled={!estadoId} className={input} />
            {buscaCidade && !cidadeId && estadoId && (
              <div style={dropStyle}>
                {cidadesFiltradas.filter((c) => c.nome.toLowerCase().includes(buscaCidade.toLowerCase())).map((c) => (
                  <div key={c.id} onClick={() => { setCidadeId(String(c.id)); setBuscaCidade('') }} style={dropItem}>{c.nome}</div>
                ))}
              </div>
            )}
          </div>

          <input type="number" placeholder="Quantidade" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={input} />
          <input type="text" placeholder="Valor do frete" value={valorFrete} onChange={(e) => setValorFrete(e.target.value)} className={input} />
          <input type="number" placeholder="Prazo de entrega (dias)" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} className={input} />
        </div>

        {/* Preview do produto selecionado */}
        {produtoSelecionado && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: 'Largura', value: `${fmtN(Number(produtoSelecionado.largura || 0), 0)} mm`, color: '' },
              { label: 'Comprimento', value: `${fmtN(Number(produtoSelecionado.comprimento || 0), 0)} mm`, color: '' },
              { label: 'Altura', value: `${fmtN(Number(produtoSelecionado.altura || 0), 0)} mm`, color: '' },
              { label: 'Peso unitário', value: `${fmtN(Number(produtoSelecionado.peso || 0), 2)} kg`, color: 'bg-orange-50 border-orange-200' },
              { label: 'Cubagem unit.', value: `${fmtN(cubagemUnitaria, 4)} m³`, color: 'bg-blue-50 border-blue-200' },
              { label: 'Cubagem total', value: quantidade ? `${fmtN(cubagemTotal, 4)} m³` : '-', color: 'bg-green-50 border-green-200' },
              { label: 'Peso total', value: quantidade ? `${fmtN(pesoTotal, 2)} kg` : '-', color: 'bg-red-50 border-red-200' },
            ].map((item, i) => (
              <div key={i} className={`rounded-xl border p-3 ${item.color || 'bg-slate-50 border-slate-200'}`}>
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className="font-bold text-slate-800 text-sm">{item.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button onClick={salvarOuAtualizar} className={btn}>{editandoId ? 'Atualizar Lançamento' : 'Salvar Lançamento'}</button>
          {editandoId && <button onClick={limparFormulario} className={btnCancel}>Cancelar Edição</button>}
        </div>
      </div>

      {/* Filtros da lista */}
      <div className={card}>
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="text" placeholder="Buscar na lista..." value={buscaLista} onChange={(e) => setBuscaLista(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 min-w-[200px]" />
          <select value={filtroProdutoLista} onChange={(e) => setFiltroProdutoLista(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none">
            <option value="">Todos os produtos</option>
            {produtosUnicosLista.map((id) => <option key={id} value={id}>{produtos.find((p) => String(p.id) === id)?.nome || id}</option>)}
          </select>
          <select value={filtroTransportadoraLista} onChange={(e) => setFiltroTransportadoraLista(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none">
            <option value="">Todas as transportadoras</option>
            {transUnicasLista.map((id) => <option key={id} value={id}>{transportadoras.find((t) => String(t.id) === id)?.nome || id}</option>)}
          </select>
          <input type="date" value={dataInicialLista} onChange={(e) => setDataInicialLista(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none" />
          <input type="date" value={dataFinalLista} onChange={(e) => setDataFinalLista(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none" />
          <button onClick={() => { setBuscaLista(''); setFiltroProdutoLista(''); setFiltroTransportadoraLista(''); setDataInicialLista(''); setDataFinalLista('') }}
            className="rounded-xl bg-slate-500 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-600 transition-colors cursor-pointer border-none">
            Limpar filtros
          </button>
        </div>

        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px' }}>
            <thead>
              <tr>
                {['Data','Produto','Transportadora','Cidade','Quantidade','Cubagem Total','Peso Total','Valor do Frete','Prazo (dias)','Ações'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lancamentosFiltrados.map((l) => {
                const prod = produtos.find((p) => p.id === l.produto_id)
                const cub = ((Number(prod?.largura || 0) / 1000) * (Number(prod?.comprimento || 0) / 1000) * (Number(prod?.altura || 0) / 1000)) * Number(l.quantidade || 0)
                const peso = Number(prod?.peso || 0) * Number(l.quantidade || 0)
                return (
                  <tr key={l.id}>
                    <td style={td}>{new Date(l.data).toLocaleDateString('pt-BR')}</td>
                    <td style={td}>{prod?.nome || '-'}</td>
                    <td style={td}>{transportadoras.find((t) => t.id === l.transportadora_id)?.nome || '-'}</td>
                    <td style={td}>{cidades.find((c) => c.id === l.cidade_id)?.nome || '-'}</td>
                    <td style={td}>{l.quantidade}</td>
                    <td style={td}>{fmtN(cub, 4)} m³</td>
                    <td style={td}>{fmtN(peso, 2)} kg</td>
                    <td style={td}>{fmtMoeda(l.valor_frete)}</td>
                    <td style={td}>{l.prazo_entrega != null ? `${l.prazo_entrega} dia(s)` : '-'}</td>
                    <td style={td}>
                      <button onClick={() => editarLancamento(l)} className="mr-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer border-none">Editar</button>
                      <button onClick={() => excluirLancamento(l.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer border-none">Excluir</button>
                    </td>
                  </tr>
                )
              })}
              {lancamentosFiltrados.length === 0 && <tr><td style={td} colSpan={10} className="text-center text-slate-400">Nenhum lançamento encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
