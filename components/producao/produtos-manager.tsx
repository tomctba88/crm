'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/browser-client'
import { calcularQuantidade, ESCALONAMENTO_LABEL } from '@/lib/producao/calcular-materiais'

type TipoProduto = { id: number; nome: string; ativo: boolean }

type Insumo = {
  id: number
  sku: string | null
  nome: string
  descricao: string | null
  unidade: string
  ativo: boolean
}

type Produto = {
  id: number
  sku: string | null
  nome: string
  descricao: string | null
  tipo_produto_id: number | null
  comprimento_padrao: number | null
  largura_padrao: number | null
  altura_padrao: number | null
  tem_dimensao_variavel: boolean
  custo_mao_obra: number | null
  margem_lucro_pct: number | null
  ativo: boolean
  producao_tipos_produto: { nome: string } | null
}

type FichaTecnicaItem = {
  id: number
  insumo_id: number
  quantidade_padrao: number
  dimensao_afetada: string
  custo_unitario: number | null
  observacao: string | null
  producao_insumos: { id: number; nome: string; unidade: string }
}

type Linha = { kind: 'insumo'; ins: Insumo } | { kind: 'fabricado'; prod: Produto }

const card = 'bg-white border border-slate-200 rounded-2xl p-5 shadow-sm'
const input = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500'
const btnPrimario = 'rounded-xl bg-[#0b1733] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b4fd6] disabled:opacity-50'
const btnSecundario = 'rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'

const UNIDADES = ['un', 'm', 'm²', 'kg', 'l', 'cm', 'par']

const ESCALONAMENTOS = [
  { valor: 'fixo', label: 'Fixo (não escala)' },
  { valor: 'comprimento', label: 'Escala com comprimento' },
  { valor: 'largura', label: 'Escala com largura' },
  { valor: 'area', label: 'Escala com área (C×L)' },
]

function fmt(n: number) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}
function brl(n: number) {
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const FORM_VAZIO = {
  tipo: 'fabricado' as 'insumo' | 'fabricado',
  sku: '',
  nome: '',
  descricao: '',
  unidade: 'un',
  tipo_produto_id: '' as string,
  tem_dimensao_variavel: false,
  comprimento_padrao: '',
  largura_padrao: '',
  altura_padrao: '',
  custo_mao_obra: '',
  margem_lucro_pct: '',
}

const LOTE_IMPORT = 500

export default function ProdutosManager() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [importando, setImportando] = useState(false)
  const [progressoImport, setProgressoImport] = useState<{ feito: number; total: number } | null>(null)
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [contagens, setContagens] = useState<Record<number, number>>({})
  const [custosInsumo, setCustosInsumo] = useState<Record<number, number>>({})
  const [custoMateriaisProduto, setCustoMateriaisProduto] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'insumo' | 'fabricado'>('todos')

  // Modal de cadastro
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<{ kind: 'insumo' | 'fabricado'; id: number } | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })

  // Painel ficha técnica
  const [fichaProduto, setFichaProduto] = useState<Produto | null>(null)
  const [ficha, setFicha] = useState<FichaTecnicaItem[]>([])
  const [novoItem, setNovoItem] = useState({ insumo_id: '', quantidade_padrao: '', dimensao_afetada: 'fixo', custo_unitario: '', observacao: '' })
  const [maoObra, setMaoObra] = useState('')
  const [margem, setMargem] = useState('')

  // Simulador
  const [simC, setSimC] = useState('')
  const [simL, setSimL] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [{ data: ins }, { data: prods }, { data: tp }, { data: fichas }, { data: est }] = await Promise.all([
      supabase.from('producao_insumos').select('id, sku, nome, descricao, unidade, ativo').order('nome'),
      supabase.from('producao_produtos').select('*, producao_tipos_produto(nome)').order('nome'),
      supabase.from('producao_tipos_produto').select('*').eq('ativo', true).order('nome'),
      supabase.from('producao_ficha_tecnica').select('produto_id, insumo_id, quantidade_padrao, custo_unitario'),
      supabase.from('producao_estoque_insumos').select('insumo_id, custo_unitario'),
    ])
    setInsumos((ins || []) as Insumo[])
    setProdutos((prods || []) as unknown as Produto[])
    setTipos(tp || [])

    const custos: Record<number, number> = {}
    for (const e of est || []) {
      const row = e as { insumo_id: number; custo_unitario: number | null }
      custos[row.insumo_id] = row.custo_unitario != null ? Number(row.custo_unitario) : 0
    }
    setCustosInsumo(custos)

    const cont: Record<number, number> = {}
    const custoMat: Record<number, number> = {}
    for (const f of fichas || []) {
      const row = f as { produto_id: number; insumo_id: number; quantidade_padrao: number; custo_unitario: number | null }
      cont[row.produto_id] = (cont[row.produto_id] || 0) + 1
      const cu = row.custo_unitario != null ? Number(row.custo_unitario) : (custos[row.insumo_id] ?? 0)
      custoMat[row.produto_id] = (custoMat[row.produto_id] || 0) + Number(row.quantidade_padrao) * cu
    }
    setContagens(cont)
    setCustoMateriaisProduto(custoMat)
    setLoading(false)
  }

  function flash(tipo: 'ok' | 'erro', texto: string) {
    setMsg({ tipo, texto })
    setTimeout(() => setMsg(null), 4000)
  }

  function custoUnitItem(it: FichaTecnicaItem): number {
    return it.custo_unitario != null ? Number(it.custo_unitario) : (custosInsumo[it.insumo_id] ?? 0)
  }

  function precoFinalProduto(p: Produto): number {
    const materiais = custoMateriaisProduto[p.id] || 0
    const total = materiais + (Number(p.custo_mao_obra) || 0)
    return total * (1 + (Number(p.margem_lucro_pct) || 0) / 100)
  }

  // Gera o próximo SKU: INS-0001 para insumo, PRD-0001 para fabricado
  function proximoSku(tipo: 'insumo' | 'fabricado'): string {
    const prefix = tipo === 'insumo' ? 'INS-' : 'PRD-'
    const skus = (tipo === 'insumo' ? insumos.map((i) => i.sku) : produtos.map((p) => p.sku))
    let max = 0
    for (const s of skus) {
      if (s && s.startsWith(prefix)) {
        const n = parseInt(s.slice(prefix.length), 10)
        if (!isNaN(n) && n > max) max = n
      }
    }
    return prefix + String(max + 1).padStart(4, '0')
  }

  // ---- Modal de cadastro --------------------------------------------------
  function abrirNovo() {
    setEditando(null)
    setForm({ ...FORM_VAZIO, tipo: 'fabricado', sku: proximoSku('fabricado') })
    setModalAberto(true)
  }

  function trocarTipo(t: 'insumo' | 'fabricado') {
    setForm((f) => ({ ...f, tipo: t, sku: proximoSku(t) }))
  }

  function abrirEdicaoInsumo(ins: Insumo) {
    setEditando({ kind: 'insumo', id: ins.id })
    setForm({ ...FORM_VAZIO, tipo: 'insumo', sku: ins.sku || '', nome: ins.nome, descricao: ins.descricao || '', unidade: ins.unidade })
    setModalAberto(true)
  }

  function abrirEdicaoProduto(p: Produto) {
    setEditando({ kind: 'fabricado', id: p.id })
    setForm({
      tipo: 'fabricado',
      sku: p.sku || '',
      nome: p.nome,
      descricao: p.descricao || '',
      unidade: 'un',
      tipo_produto_id: p.tipo_produto_id != null ? String(p.tipo_produto_id) : '',
      tem_dimensao_variavel: p.tem_dimensao_variavel,
      comprimento_padrao: p.comprimento_padrao != null ? String(p.comprimento_padrao) : '',
      largura_padrao: p.largura_padrao != null ? String(p.largura_padrao) : '',
      altura_padrao: p.altura_padrao != null ? String(p.altura_padrao) : '',
      custo_mao_obra: p.custo_mao_obra != null ? String(p.custo_mao_obra) : '',
      margem_lucro_pct: p.margem_lucro_pct != null ? String(p.margem_lucro_pct) : '',
    })
    setModalAberto(true)
  }

  async function salvar() {
    if (!form.nome.trim()) { flash('erro', 'Nome é obrigatório.'); return }
    setSalvando(true)

    if (form.tipo === 'insumo') {
      const payload = {
        sku: form.sku.trim() || null,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        unidade: form.unidade,
        updated_at: new Date().toISOString(),
      }
      if (editando) {
        const { error } = await supabase.from('producao_insumos').update(payload).eq('id', editando.id)
        if (error) { flash('erro', error.code === '23505' ? 'SKU já existe.' : 'Erro ao salvar insumo.'); setSalvando(false); return }
      } else {
        const { data: novo, error } = await supabase.from('producao_insumos').insert(payload).select().single()
        if (error || !novo) { flash('erro', error?.code === '23505' ? 'SKU já existe.' : 'Erro ao salvar insumo.'); setSalvando(false); return }
        await supabase.from('producao_estoque_insumos').insert({ insumo_id: novo.id, quantidade_atual: 0, ponto_reposicao: 0 })
      }
    } else {
      if (form.tem_dimensao_variavel) {
        const c = Number(form.comprimento_padrao), l = Number(form.largura_padrao)
        if (!c || c <= 0 || !l || l <= 0) { flash('erro', 'Comprimento e largura padrão são obrigatórios (> 0) para dimensão variável.'); setSalvando(false); return }
      }
      const payload = {
        sku: form.sku.trim() || null,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        tipo_produto_id: form.tipo_produto_id ? Number(form.tipo_produto_id) : null,
        tem_dimensao_variavel: form.tem_dimensao_variavel,
        comprimento_padrao: form.tem_dimensao_variavel && form.comprimento_padrao ? Number(form.comprimento_padrao) : null,
        largura_padrao: form.tem_dimensao_variavel && form.largura_padrao ? Number(form.largura_padrao) : null,
        altura_padrao: form.tem_dimensao_variavel && form.altura_padrao ? Number(form.altura_padrao) : null,
        custo_mao_obra: form.custo_mao_obra ? Number(form.custo_mao_obra) : 0,
        margem_lucro_pct: form.margem_lucro_pct ? Number(form.margem_lucro_pct) : 0,
        updated_at: new Date().toISOString(),
      }
      const { error } = editando
        ? await supabase.from('producao_produtos').update(payload).eq('id', editando.id)
        : await supabase.from('producao_produtos').insert(payload)
      if (error) { flash('erro', error.code === '23505' ? 'SKU já existe.' : 'Erro ao salvar produto.'); setSalvando(false); return }
    }

    setModalAberto(false)
    flash('ok', 'Salvo com sucesso!')
    await carregar()
    setSalvando(false)
  }

  async function toggleAtivo(linha: Linha) {
    if (linha.kind === 'insumo') {
      await supabase.from('producao_insumos').update({ ativo: !linha.ins.ativo }).eq('id', linha.ins.id)
    } else {
      await supabase.from('producao_produtos').update({ ativo: !linha.prod.ativo }).eq('id', linha.prod.id)
    }
    await carregar()
  }

  // ---- Ficha técnica ------------------------------------------------------
  async function abrirFicha(p: Produto) {
    setFichaProduto(p)
    setSimC(p.comprimento_padrao != null ? String(p.comprimento_padrao) : '')
    setSimL(p.largura_padrao != null ? String(p.largura_padrao) : '')
    setMaoObra(p.custo_mao_obra != null ? String(p.custo_mao_obra) : '')
    setMargem(p.margem_lucro_pct != null ? String(p.margem_lucro_pct) : '')
    setNovoItem({ insumo_id: '', quantidade_padrao: '', dimensao_afetada: 'fixo', custo_unitario: '', observacao: '' })
    await carregarFicha(p.id)
  }

  async function carregarFicha(produtoId: number) {
    const { data } = await supabase
      .from('producao_ficha_tecnica')
      .select('*, producao_insumos(id, nome, unidade)')
      .eq('produto_id', produtoId)
      .order('id')
    setFicha((data || []) as unknown as FichaTecnicaItem[])
  }

  function fecharFicha() {
    setFichaProduto(null)
    setFicha([])
  }

  async function salvarCustosProduto() {
    if (!fichaProduto) return
    setSalvando(true)
    const patch = {
      custo_mao_obra: maoObra ? Number(maoObra) : 0,
      margem_lucro_pct: margem ? Number(margem) : 0,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('producao_produtos').update(patch).eq('id', fichaProduto.id)
    setFichaProduto({ ...fichaProduto, custo_mao_obra: patch.custo_mao_obra, margem_lucro_pct: patch.margem_lucro_pct })
    flash('ok', 'Custos do produto atualizados!')
    await carregar()
    setSalvando(false)
  }

  async function adicionarItemFicha() {
    if (!fichaProduto) return
    const insumoId = Number(novoItem.insumo_id)
    const qtd = Number(novoItem.quantidade_padrao)
    if (!insumoId) { flash('erro', 'Selecione um insumo.'); return }
    if (!qtd || qtd <= 0) { flash('erro', 'Informe uma quantidade válida.'); return }
    setSalvando(true)
    const { error } = await supabase.from('producao_ficha_tecnica').insert({
      produto_id: fichaProduto.id,
      insumo_id: insumoId,
      quantidade_padrao: qtd,
      dimensao_afetada: fichaProduto.tem_dimensao_variavel ? novoItem.dimensao_afetada : 'fixo',
      custo_unitario: novoItem.custo_unitario !== '' ? Number(novoItem.custo_unitario) : null,
      observacao: novoItem.observacao.trim() || null,
    })
    if (error) {
      flash('erro', error.code === '23505' ? 'Este insumo já está na ficha.' : 'Erro ao adicionar insumo.')
      setSalvando(false)
      return
    }
    setNovoItem({ insumo_id: '', quantidade_padrao: '', dimensao_afetada: 'fixo', custo_unitario: '', observacao: '' })
    await carregarFicha(fichaProduto.id)
    await carregar()
    setSalvando(false)
  }

  async function removerItemFicha(id: number) {
    if (!fichaProduto) return
    if (!confirm('Remover este insumo da ficha técnica?')) return
    await supabase.from('producao_ficha_tecnica').delete().eq('id', id)
    await carregarFicha(fichaProduto.id)
    await carregar()
  }

  async function onImportarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setImportando(true)
    setProgressoImport(null)
    try {
      let linhas: Record<string, unknown>[] = []
      for (const f of files) {
        const buf = await f.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        linhas = linhas.concat(XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[])
      }
      let feito = 0, inseridos = 0, atualizados = 0
      setProgressoImport({ feito: 0, total: linhas.length })
      for (let i = 0; i < linhas.length; i += LOTE_IMPORT) {
        const lote = linhas.slice(i, i + LOTE_IMPORT)
        const res = await fetch('/api/producao/produtos/importar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produtos: lote }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        inseridos += json.inseridos || 0
        atualizados += json.atualizados || 0
        feito += lote.length
        setProgressoImport({ feito, total: linhas.length })
      }
      flash('ok', `Importação concluída: ${inseridos} novos, ${atualizados} atualizados.`)
      await carregar()
    } catch (err) {
      flash('erro', `Erro na importação: ${(err as Error).message}`)
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const insumosAtivos = insumos.filter((i) => i.ativo)

  const linhas: Linha[] = useMemo(() => {
    const arr: Linha[] = [
      ...insumos.map((ins) => ({ kind: 'insumo' as const, ins })),
      ...produtos.map((prod) => ({ kind: 'fabricado' as const, prod })),
    ]
    const filtradas = filtro === 'todos' ? arr : arr.filter((l) => l.kind === filtro)
    return filtradas.sort((a, b) => {
      const na = a.kind === 'insumo' ? a.ins.nome : a.prod.nome
      const nb = b.kind === 'insumo' ? b.ins.nome : b.prod.nome
      return na.localeCompare(nb)
    })
  }, [insumos, produtos, filtro])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0b1733]">Produtos</h1>
          <p className="text-sm text-slate-500">Cadastro (formato Tiny), insumos, fichas técnicas e estoque</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btnSecundario} cursor-pointer ${importando ? 'opacity-50 pointer-events-none' : ''}`}>
            {importando ? 'Importando…' : '⬆ Importar planilha (Tiny)'}
            <input type="file" accept=".xls,.xlsx" multiple className="hidden" disabled={importando} onChange={onImportarArquivos} />
          </label>
          <Link href="/producao/produtos/novo" className={btnSecundario}>+ Produto (completo)</Link>
          <button onClick={abrirNovo} className={btnPrimario}>+ Novo Cadastro</button>
        </div>
      </div>

      {progressoImport && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Importando… {progressoImport.feito.toLocaleString('pt-BR')} / {progressoImport.total.toLocaleString('pt-BR')}</span>
            <span>{progressoImport.total > 0 ? Math.round((progressoImport.feito / progressoImport.total) * 100) : 0}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-[#1b4fd6] transition-all" style={{ width: `${progressoImport.total > 0 ? Math.round((progressoImport.feito / progressoImport.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {msg && (
        <div className={`rounded-xl border px-4 py-2 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Filtro por tipo */}
      <div className="flex gap-1">
        {([['todos', 'Todos'], ['insumo', 'Insumos'], ['fabricado', 'Fabricados']] as const).map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => setFiltro(val)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${filtro === val ? 'bg-[#0b1733] text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Lista unificada */}
      <div className={card}>
        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum cadastro ainda. Clique em “+ Novo Cadastro”.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 940 }}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Un. / Dimensões</th>
                  <th className="py-2 pr-3 text-right">Custo</th>
                  <th className="py-2 pr-3 text-right">Preço Venda</th>
                  <th className="py-2 pr-3">Ativo</th>
                  <th className="py-2 pr-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  if (l.kind === 'insumo') {
                    const ins = l.ins
                    return (
                      <tr key={`i${ins.id}`} className={`border-b border-slate-100 ${!ins.ativo ? 'opacity-50' : ''}`}>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-500">{ins.sku || '—'}</td>
                        <td className="py-2 pr-3">
                          <div className="font-semibold text-[#0b1733]">{ins.nome}</div>
                          {ins.descricao && <div className="text-xs text-slate-400">{ins.descricao}</div>}
                        </td>
                        <td className="py-2 pr-3"><span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">Insumo</span></td>
                        <td className="py-2 pr-3 text-slate-600">{ins.unidade}</td>
                        <td className="py-2 pr-3 text-right text-slate-600">{custosInsumo[ins.id] ? brl(custosInsumo[ins.id]) : '—'}</td>
                        <td className="py-2 pr-3 text-right text-slate-400">—</td>
                        <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ins.ativo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>{ins.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td className="py-2 pr-3">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => abrirEdicaoInsumo(ins)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Editar</button>
                            <button onClick={() => toggleAtivo(l)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">{ins.ativo ? 'Desativar' : 'Ativar'}</button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  const p = l.prod
                  return (
                    <tr key={`p${p.id}`} className={`border-b border-slate-100 ${!p.ativo ? 'opacity-50' : ''}`}>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">{p.sku || '—'}</td>
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-[#0b1733]">{p.nome}</div>
                        <div className="text-xs text-slate-400">
                          {p.producao_tipos_produto?.nome || 'Sem tipo'} · {contagens[p.id] || 0} insumos
                        </div>
                      </td>
                      <td className="py-2 pr-3"><span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">Fabricado</span></td>
                      <td className="py-2 pr-3 text-slate-600">{p.comprimento_padrao && p.largura_padrao ? `${fmt(p.comprimento_padrao)}m × ${fmt(p.largura_padrao)}m` : '—'}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{brl(custoMateriaisProduto[p.id] || 0)}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-green-700">{brl(precoFinalProduto(p))}</td>
                      <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.ativo ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td className="py-2 pr-3">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => router.push(`/producao/produtos/${p.id}`)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Editar</button>
                          <button onClick={() => abrirFicha(p)} className="rounded-lg bg-[#0b1733] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1b4fd6]">Ficha Técnica</button>
                          <button onClick={() => toggleAtivo(l)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">{p.ativo ? 'Desativar' : 'Ativar'}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de cadastro */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalAberto(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-[#0b1733]">
              {editando ? 'Editar' : 'Novo'} {form.tipo === 'insumo' ? 'Insumo' : 'Produto Fabricado'}
            </h2>

            {/* Seletor de tipo (só ao criar) */}
            {!editando && (
              <div className="mb-4 flex gap-2">
                <button onClick={() => trocarTipo('insumo')} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${form.tipo === 'insumo' ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                  Insumo (matéria-prima)
                </button>
                <button onClick={() => trocarTipo('fabricado')} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${form.tipo === 'fabricado' ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                  Produto Fabricado
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">SKU</label>
                  <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={`${input} w-full font-mono`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Nome *</label>
                  <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={`${input} w-full`} placeholder={form.tipo === 'insumo' ? 'Ex: Tampo MDF 15mm' : 'Ex: Mesa Escritório'} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Descrição</label>
                <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className={`${input} w-full resize-none`} />
              </div>

              {form.tipo === 'insumo' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Unidade *</label>
                  <select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} className={`${input} w-full`}>
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <p className="mt-2 text-xs text-slate-400">O saldo, custo e ponto de reposição deste insumo são gerenciados na aba Estoque.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Tipo de produto</label>
                    <select value={form.tipo_produto_id} onChange={(e) => setForm({ ...form, tipo_produto_id: e.target.value })} className={`${input} w-full`}>
                      <option value="">—</option>
                      {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={form.tem_dimensao_variavel} onChange={(e) => setForm({ ...form, tem_dimensao_variavel: e.target.checked })} className="h-4 w-4" />
                    <span className="text-sm font-semibold text-slate-700">Tem dimensão variável?</span>
                  </label>
                  {form.tem_dimensao_variavel && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Comprimento (m) *</label>
                          <input type="number" step="0.01" value={form.comprimento_padrao} onChange={(e) => setForm({ ...form, comprimento_padrao: e.target.value })} className={`${input} w-full`} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Largura (m) *</label>
                          <input type="number" step="0.01" value={form.largura_padrao} onChange={(e) => setForm({ ...form, largura_padrao: e.target.value })} className={`${input} w-full`} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Altura (m)</label>
                          <input type="number" step="0.01" value={form.altura_padrao} onChange={(e) => setForm({ ...form, altura_padrao: e.target.value })} className={`${input} w-full`} />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">As dimensões padrão são a referência para calcular variações no pedido.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Custo mão de obra (R$)</label>
                      <input type="number" step="0.01" value={form.custo_mao_obra} onChange={(e) => setForm({ ...form, custo_mao_obra: e.target.value })} className={`${input} w-full`} placeholder="0,00" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Margem de lucro (%)</label>
                      <input type="number" step="0.1" value={form.margem_lucro_pct} onChange={(e) => setForm({ ...form, margem_lucro_pct: e.target.value })} className={`${input} w-full`} placeholder="0" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Os insumos que compõem este produto e o preço final são definidos na Ficha Técnica.</p>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModalAberto(false)} className={btnSecundario}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} className={btnPrimario}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de ficha técnica (drawer lateral) */}
      {fichaProduto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={fecharFicha}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-slate-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={fecharFicha} className="mb-3 text-sm text-slate-400 hover:text-slate-600">← {fichaProduto.nome}</button>
            <h2 className="text-xl font-black text-[#0b1733]">Ficha Técnica</h2>
            <p className="text-sm text-slate-500">{fichaProduto.sku ? `${fichaProduto.sku} · ` : ''}{ficha.length} insumo(s) na composição</p>
            {fichaProduto.tem_dimensao_variavel && fichaProduto.comprimento_padrao && fichaProduto.largura_padrao && (
              <p className="mt-1 text-sm text-slate-500">Dimensões padrão: {fmt(fichaProduto.comprimento_padrao)}m × {fmt(fichaProduto.largura_padrao)}m</p>
            )}

            {/* Lista de insumos da ficha */}
            <div className={`${card} mt-4`}>
              {ficha.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum insumo na composição ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                        <th className="py-2 pr-3">Insumo</th>
                        <th className="py-2 pr-3">Un.</th>
                        <th className="py-2 pr-3 text-right">Qtd</th>
                        <th className="py-2 pr-3 text-right">Custo Unit.</th>
                        <th className="py-2 pr-3 text-right">Custo Total</th>
                        <th className="py-2 pr-3">Escalonamento</th>
                        <th className="py-2 pr-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ficha.map((it) => {
                        const cu = custoUnitItem(it)
                        const total = Number(it.quantidade_padrao) * cu
                        return (
                          <tr key={it.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-[#0b1733]">
                              {it.producao_insumos.nome}
                              {it.observacao && <span className="block text-xs text-slate-400">{it.observacao}</span>}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">{it.producao_insumos.unidade}</td>
                            <td className="py-2 pr-3 text-right text-slate-700">{Number(it.quantidade_padrao).toFixed(3)}</td>
                            <td className="py-2 pr-3 text-right text-slate-600">
                              {brl(cu)}
                              {it.custo_unitario == null && cu > 0 && <span className="block text-[10px] text-slate-400">estoque</span>}
                            </td>
                            <td className="py-2 pr-3 text-right font-semibold text-slate-800">{brl(total)}</td>
                            <td className="py-2 pr-3 text-slate-600">{ESCALONAMENTO_LABEL[it.dimensao_afetada] || it.dimensao_afetada}</td>
                            <td className="py-2 pr-3 text-right">
                              <button onClick={() => removerItemFicha(it.id)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Remover</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Resumo de custos e preço final */}
            {(() => {
              const custoMateriais = ficha.reduce((s, it) => s + Number(it.quantidade_padrao) * custoUnitItem(it), 0)
              const mo = Number(maoObra) || 0
              const mg = Number(margem) || 0
              const custoTotal = custoMateriais + mo
              const preco = custoTotal * (1 + mg / 100)
              const lucro = preco - custoTotal
              return (
                <div className={`${card} mt-4`}>
                  <h3 className="mb-3 text-sm font-bold text-[#0b1733]">Resumo de Custos e Preço</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Custo de mão de obra (R$)</label>
                      <input type="number" step="0.01" value={maoObra} onChange={(e) => setMaoObra(e.target.value)} className={`${input} w-full`} placeholder="0,00" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Margem de lucro (%)</label>
                      <input type="number" step="0.1" value={margem} onChange={(e) => setMargem(e.target.value)} className={`${input} w-full`} placeholder="0" />
                    </div>
                  </div>

                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">Custo de materiais ({ficha.length} insumo(s))</dt><dd className="font-semibold text-slate-800">{brl(custoMateriais)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Custo de mão de obra</dt><dd className="font-semibold text-slate-800">{brl(mo)}</dd></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5"><dt className="font-semibold text-slate-600">Custo total de produção</dt><dd className="font-bold text-[#0b1733]">{brl(custoTotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Margem de lucro ({mg.toLocaleString('pt-BR')}%)</dt><dd className="font-semibold text-green-700">+ {brl(lucro)}</dd></div>
                    <div className="flex justify-between rounded-xl bg-[#0b1733] px-3 py-2 text-white"><dt className="font-bold">Preço final de venda</dt><dd className="text-lg font-black">{brl(preco)}</dd></div>
                  </dl>

                  <div className="mt-3">
                    <button onClick={salvarCustosProduto} disabled={salvando} className={btnPrimario}>Salvar custos do produto</button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Materiais somados da ficha (quantidade × custo unitário). Mão de obra e margem são salvas no produto.</p>
                </div>
              )
            })()}

            {/* Formulário para adicionar insumo */}
            <div className={`${card} mt-4`}>
              <h3 className="mb-3 text-sm font-bold text-[#0b1733]">Adicionar insumo à composição</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Insumo *</label>
                  <select value={novoItem.insumo_id} onChange={(e) => setNovoItem({ ...novoItem, insumo_id: e.target.value })} className={`${input} w-full`}>
                    <option value="">Selecione...</option>
                    {insumosAtivos.map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Quantidade padrão *</label>
                  <input type="number" step="0.001" value={novoItem.quantidade_padrao} onChange={(e) => setNovoItem({ ...novoItem, quantidade_padrao: e.target.value })} className={`${input} w-full`} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Custo unitário (R$)</label>
                  <input
                    type="number" step="0.0001" value={novoItem.custo_unitario}
                    onChange={(e) => setNovoItem({ ...novoItem, custo_unitario: e.target.value })}
                    placeholder={novoItem.insumo_id && custosInsumo[Number(novoItem.insumo_id)] ? `estoque: ${brl(custosInsumo[Number(novoItem.insumo_id)])}` : 'usa custo do estoque'}
                    className={`${input} w-full`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Escalonamento *</label>
                  <select
                    value={fichaProduto.tem_dimensao_variavel ? novoItem.dimensao_afetada : 'fixo'}
                    onChange={(e) => setNovoItem({ ...novoItem, dimensao_afetada: e.target.value })}
                    disabled={!fichaProduto.tem_dimensao_variavel}
                    className={`${input} w-full disabled:bg-slate-100 disabled:text-slate-400`}
                  >
                    {ESCALONAMENTOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Observação</label>
                  <input value={novoItem.observacao} onChange={(e) => setNovoItem({ ...novoItem, observacao: e.target.value })} className={`${input} w-full`} />
                </div>
              </div>
              <div className="mt-3">
                <button onClick={adicionarItemFicha} disabled={salvando} className={btnPrimario}>Adicionar à Composição</button>
              </div>
            </div>

            {/* Simulador de variação */}
            {fichaProduto.tem_dimensao_variavel && (
              <div className={`${card} mt-4`}>
                <h3 className="mb-1 text-sm font-bold text-[#0b1733]">Simular pedido com dimensões diferentes</h3>
                <p className="mb-3 text-xs text-slate-500">Padrão: {fmt(fichaProduto.comprimento_padrao || 0)}m × {fmt(fichaProduto.largura_padrao || 0)}m</p>
                <div className="mb-4 flex flex-wrap gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Comprimento (m)</label>
                    <input type="number" step="0.01" value={simC} onChange={(e) => setSimC(e.target.value)} className={`${input} w-28`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Largura (m)</label>
                    <input type="number" step="0.01" value={simL} onChange={(e) => setSimL(e.target.value)} className={`${input} w-28`} />
                  </div>
                </div>
                {ficha.length === 0 ? (
                  <p className="text-sm text-slate-400">Adicione insumos para simular.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-500">
                          <th className="py-2 pr-3">Insumo</th>
                          <th className="py-2 pr-3">Qtd Padrão</th>
                          <th className="py-2 pr-3">Qtd Pedido</th>
                          <th className="py-2 pr-3">Diferença</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ficha.map((it) => {
                          const qtdPedido = calcularQuantidade(
                            it,
                            simC ? Number(simC) : null,
                            simL ? Number(simL) : null,
                            fichaProduto
                          )
                          const dif = +(qtdPedido - Number(it.quantidade_padrao)).toFixed(4)
                          const un = it.producao_insumos.unidade
                          return (
                            <tr key={it.id} className="border-b border-slate-100">
                              <td className="py-2 pr-3 font-medium text-[#0b1733]">{it.producao_insumos.nome}</td>
                              <td className="py-2 pr-3 text-slate-600">{Number(it.quantidade_padrao).toFixed(3)} {un}</td>
                              <td className="py-2 pr-3 font-semibold text-slate-800">{qtdPedido.toFixed(3)} {un}</td>
                              <td className={`py-2 pr-3 font-semibold ${dif > 0 ? 'text-orange-600' : dif < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                {dif > 0 ? '+' : ''}{dif.toFixed(3)} {un}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
