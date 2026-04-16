'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser-client'

type Lead = {
  id: number
  created_at: string
  user_id: string
  data_contato: string | null
  tipo_contato: string | null
  vendedor: string | null
  nome_cliente: string
  nome_empresa: string | null
  telefone: string | null
  uf: string | null
  produto_interesse: string | null
  valor_orcamento: number | null
  valor_frete: number | null
  status: string | null
  data_retorno: string | null
  observacoes: string | null
}

type FormDataType = {
  data_contato: string
  tipo_contato: string
  vendedor: string
  nome_cliente: string
  nome_empresa: string
  telefone: string
  uf: string
  produto_interesse: string
  valor_orcamento: string
  valor_frete: string
  status: string
  data_retorno: string
  observacoes: string
}

type CadastroOption = {
  id: number
  nome: string
  ativo: boolean
  cor?: string | null
}

const initialForm: FormDataType = {
  data_contato: '',
  tipo_contato: '',
  vendedor: '',
  nome_cliente: '',
  nome_empresa: '',
  telefone: '',
  uf: '',
  produto_interesse: '',
  valor_orcamento: '',
  valor_frete: '',
  status: '',
  data_retorno: '',
  observacoes: '',
}

const ufOptions = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)

  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function parseCurrencyToNumber(value: string) {
  if (!value) return null

  const normalized = value
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')

  if (!normalized) return null

  const number = Number(normalized)
  return Number.isNaN(number) ? null : number
}

function formatCurrencyInput(value: string) {
  const digits = onlyDigits(value)

  if (!digits) return ''

  const number = Number(digits) / 100

  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return 'R$ 0,00'

  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateBR(value: string | null) {
  if (!value) return '-'

  const [ano, mes, dia] = value.split('-')
  if (!ano || !mes || !dia) return value

  return `${dia}/${mes}/${ano}`
}

function getStatusBadgeClassByColor(cor?: string | null) {
  switch ((cor || '').toLowerCase()) {
    case 'green':
    case 'verde':
      return 'bg-green-50 text-green-700'
    case 'red':
    case 'vermelho':
      return 'bg-red-50 text-red-600'
    case 'yellow':
    case 'amarelo':
      return 'bg-yellow-50 text-yellow-700'
    case 'blue':
    case 'azul':
      return 'bg-blue-50 text-blue-700'
    case 'orange':
    case 'laranja':
      return 'bg-orange-50 text-orange-700'
    case 'purple':
    case 'roxo':
      return 'bg-purple-50 text-purple-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export default function LeadsManager() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()

  const [leads, setLeads] = useState<Lead[]>([])
  const [form, setForm] = useState<FormDataType>(initialForm)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [mensagemTopo, setMensagemTopo] = useState<string | null>(null)
  const nomeClienteRef = useRef<HTMLInputElement | null>(null)
  const tabelaScrollTopRef = useRef<HTMLDivElement | null>(null)
  const tabelaScrollBottomRef = useRef<HTMLDivElement | null>(null)
  const tabelaScrollContentRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [leadEmFoco, setLeadEmFoco] = useState<number | null>(null)
  const [leadAutoOpenDone, setLeadAutoOpenDone] = useState(false)

  const [vendedores, setVendedores] = useState<CadastroOption[]>([])
  const [tiposContato, setTiposContato] = useState<CadastroOption[]>([])
  const [statusLead, setStatusLead] = useState<CadastroOption[]>([])
  const [produtosInteresse, setProdutosInteresse] = useState<CadastroOption[]>([])

  const leadIdFromUrl = useMemo(() => {
    const value = searchParams.get('lead')
    if (!value) return null

    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }, [searchParams])

  async function buscarCadastros() {
    const [
      vendedoresRes,
      tiposContatoRes,
      statusLeadRes,
      produtosRes,
    ] = await Promise.all([
      supabase.from('cadastro_vendedores').select('*').eq('ativo', true).order('nome', { ascending: true }),
      supabase.from('cadastro_tipos_contato').select('*').eq('ativo', true).order('nome', { ascending: true }),
      supabase.from('cadastro_status_lead').select('*').eq('ativo', true).order('nome', { ascending: true }),
      supabase.from('cadastro_produtos_interesse').select('*').eq('ativo', true).order('nome', { ascending: true }),
    ])

    if (!vendedoresRes.error) setVendedores(vendedoresRes.data || [])
    if (!tiposContatoRes.error) setTiposContato(tiposContatoRes.data || [])
    if (!statusLeadRes.error) setStatusLead(statusLeadRes.data || [])
    if (!produtosRes.error) setProdutosInteresse(produtosRes.data || [])

    setForm((prev) => ({
      ...prev,
      tipo_contato: prev.tipo_contato || tiposContatoRes.data?.[0]?.nome || '',
      vendedor: prev.vendedor || vendedoresRes.data?.[0]?.nome || '',
      produto_interesse: prev.produto_interesse || produtosRes.data?.[0]?.nome || '',
      status: prev.status || statusLeadRes.data?.[0]?.nome || '',
    }))
  }

  async function buscarLeads() {
    setCarregandoLista(true)

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar leads:', error)
      setCarregandoLista(false)
      return
    }

    setLeads(data || [])
    setCarregandoLista(false)
  }

  useEffect(() => {
    buscarCadastros()
    buscarLeads()
  }, [])

  function atualizarCampo<K extends keyof FormDataType>(
    campo: K,
    valor: FormDataType[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }))
  }

  function limparFormulario() {
    setForm({
      ...initialForm,
      tipo_contato: tiposContato[0]?.nome || '',
      vendedor: vendedores[0]?.nome || '',
      produto_interesse: produtosInteresse[0]?.nome || '',
      status: statusLead[0]?.nome || '',
    })
    setEditandoId(null)
    setLeadEmFoco(null)
  }

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      alert('Usuário não autenticado.')
      setLoading(false)
      return
    }

    if (!form.nome_cliente.trim()) {
      alert('Informe o nome do cliente.')
      setLoading(false)
      return
    }

    const payload = {
      user_id: user.id,
      data_contato: form.data_contato || null,
      tipo_contato: form.tipo_contato || null,
      vendedor: form.vendedor || null,
      nome_cliente: form.nome_cliente.trim(),
      nome_empresa: form.nome_empresa.trim() || null,
      telefone: form.telefone.trim() || null,
      uf: form.uf || null,
      produto_interesse: form.produto_interesse || null,
      valor_orcamento: parseCurrencyToNumber(form.valor_orcamento),
      valor_frete: parseCurrencyToNumber(form.valor_frete),
      status: form.status || null,
      data_retorno: form.data_retorno || null,
      observacoes: form.observacoes.trim() || null,
    }

    if (editandoId) {
      const { error } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', editandoId)

      if (error) {
        console.error('Erro ao atualizar lead:', error)
        alert('Erro ao atualizar lead.')
        setLoading(false)
        return
      }

      alert('Lead atualizado com sucesso!')
    } else {
      const { error } = await supabase
        .from('leads')
        .insert(payload)

      if (error) {
        console.error('Erro ao cadastrar lead:', error)
        alert('Erro ao cadastrar lead.')
        setLoading(false)
        return
      }

      alert('Lead cadastrado com sucesso!')
    }

    limparFormulario()
    await buscarLeads()
    setLoading(false)
  }

  function editarLead(lead: Lead) {
    setEditandoId(lead.id)
    setMensagemTopo(`Lead #${lead.id} carregado para edição`)
    setLeadEmFoco(lead.id)

    setForm({
      data_contato: lead.data_contato || '',
      tipo_contato: lead.tipo_contato || '',
      vendedor: lead.vendedor || '',
      nome_cliente: lead.nome_cliente || '',
      nome_empresa: lead.nome_empresa || '',
      telefone: formatPhone(lead.telefone || ''),
      uf: lead.uf || '',
      produto_interesse: lead.produto_interesse || '',
      valor_orcamento:
        lead.valor_orcamento !== null && lead.valor_orcamento !== undefined
          ? lead.valor_orcamento.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '',
      valor_frete:
        lead.valor_frete !== null && lead.valor_frete !== undefined
          ? lead.valor_frete.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '',
      status: lead.status || '',
      data_retorno: lead.data_retorno || '',
      observacoes: lead.observacoes || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })

setTimeout(() => {
  nomeClienteRef.current?.focus()
}, 250)

setTimeout(() => {
  setMensagemTopo(null)
}, 4000)
}

  async function excluirLead(id: number) {
    const confirmar = confirm('Tem certeza que deseja excluir este lead?')
    if (!confirmar) return

    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Erro ao excluir lead:', error)
      alert('Erro ao excluir lead.')
      return
    }

    alert('Lead excluído com sucesso!')

    if (editandoId === id) {
      limparFormulario()
    }

    await buscarLeads()
  }

  async function excluirSelecionados() {
    if (selecionados.length === 0) {
      alert('Nenhum lead selecionado.')
      return
    }

    const confirmar = confirm(`Excluir ${selecionados.length} lead(s) selecionado(s)?`)
    if (!confirmar) return

    const { error } = await supabase
      .from('leads')
      .delete()
      .in('id', selecionados)

    if (error) {
      console.error('Erro ao excluir leads selecionados:', error)
      alert('Erro ao excluir leads selecionados.')
      return
    }

    setSelecionados([])
    await buscarLeads()
    alert('Leads excluídos com sucesso!')
  }

  useEffect(() => {
    if (!leadIdFromUrl) return
    if (leads.length === 0) return
    if (leadAutoOpenDone) return

    const leadEncontrado = leads.find((lead) => lead.id === leadIdFromUrl)
    if (!leadEncontrado) return

    editarLead(leadEncontrado)
    setLeadAutoOpenDone(true)

    
  }, [leadIdFromUrl, leads, leadAutoOpenDone])

  const leadsFiltrados = leads.filter((lead) => {
    const termo = busca.toLowerCase()

    const bateBusca =
      lead.nome_cliente?.toLowerCase().includes(termo) ||
      lead.nome_empresa?.toLowerCase().includes(termo) ||
      lead.telefone?.toLowerCase().includes(termo) ||
      lead.vendedor?.toLowerCase().includes(termo) ||
      lead.produto_interesse?.toLowerCase().includes(termo)

    const bateStatus =
      filtroStatus === 'Todos' ? true : lead.status === filtroStatus

    return Boolean(bateBusca) && bateStatus
  })

  const mapaCoresStatus = new Map(statusLead.map((item) => [item.nome, item.cor || null]))

  const todosSelecionados =
  leadsFiltrados.length > 0 &&
  leadsFiltrados.every((lead) => selecionados.includes(lead.id))

useEffect(() => {
  const topEl = tabelaScrollTopRef.current
  const bottomEl = tabelaScrollBottomRef.current
  const contentEl = tabelaScrollContentRef.current

  if (!topEl || !bottomEl || !contentEl) return

  const syncWidth = () => {
    contentEl.style.width = `${bottomEl.scrollWidth}px`
  }

  const onTopScroll = () => {
    bottomEl.scrollLeft = topEl.scrollLeft
  }

  const onBottomScroll = () => {
    topEl.scrollLeft = bottomEl.scrollLeft
  }

  syncWidth()

  topEl.addEventListener('scroll', onTopScroll)
  bottomEl.addEventListener('scroll', onBottomScroll)
  window.addEventListener('resize', syncWidth)

  return () => {
    topEl.removeEventListener('scroll', onTopScroll)
    bottomEl.removeEventListener('scroll', onBottomScroll)
    window.removeEventListener('resize', syncWidth)
  }
}, [leadsFiltrados])

  return (
    <div className="space-y-6">
  {mensagemTopo && (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
      {mensagemTopo}
    </div>
  )}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Lançamento de informações
            </p>
            <h1 className="text-3xl font-black text-slate-900">
              Cadastro de Leads
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Registre todos os dados comerciais conforme o controle operacional da Ergotex.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              Total de leads: <span className="font-bold text-slate-900">{leads.length}</span>
            </div>

            {editandoId ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">
                Editando lead #{editandoId}
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSalvar} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Data do contato
            </label>
            <input
              type="date"
              value={form.data_contato}
              onChange={(e) => atualizarCampo('data_contato', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Tipo de contato
            </label>
            <select
              value={form.tipo_contato}
              onChange={(e) => atualizarCampo('tipo_contato', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Selecione</option>
              {tiposContato.map((item) => (
                <option key={item.id} value={item.nome}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Vendedor
            </label>
            <select
              value={form.vendedor}
              onChange={(e) => atualizarCampo('vendedor', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Selecione</option>
              {vendedores.map((item) => (
                <option key={item.id} value={item.nome}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Nome do cliente
            </label>
            <input
  ref={nomeClienteRef}
  type="text"
  value={form.nome_cliente}
  onChange={(e) => atualizarCampo('nome_cliente', e.target.value)}
  className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
  placeholder="Ex.: Patrícia Bergo"
  required
/>
          </div>

          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Nome da empresa
            </label>
            <input
              type="text"
              value={form.nome_empresa}
              onChange={(e) => atualizarCampo('nome_empresa', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Ex.: SPD Fabricação e Comércio"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Telefone
            </label>
            <input
              type="text"
              value={form.telefone}
              onChange={(e) => atualizarCampo('telefone', formatPhone(e.target.value))}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="(41) 99999-9999"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              UF
            </label>
            <select
              value={form.uf}
              onChange={(e) => atualizarCampo('uf', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Selecione</option>
              {ufOptions.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Produto de interesse
            </label>
            <select
              value={form.produto_interesse}
              onChange={(e) => atualizarCampo('produto_interesse', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Selecione</option>
              {produtosInteresse.map((item) => (
                <option key={item.id} value={item.nome}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Valor orçamento
            </label>
            <input
              type="text"
              value={form.valor_orcamento}
              onChange={(e) => atualizarCampo('valor_orcamento', formatCurrencyInput(e.target.value))}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="0,00"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Valor do frete
            </label>
            <input
              type="text"
              value={form.valor_frete}
              onChange={(e) => atualizarCampo('valor_frete', formatCurrencyInput(e.target.value))}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="0,00"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => atualizarCampo('status', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Selecione</option>
              {statusLead.map((item) => (
                <option key={item.id} value={item.nome}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Data de Retorno Previsto
            </label>
            <input
              type="date"
              value={form.data_retorno}
              onChange={(e) => atualizarCampo('data_retorno', e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="md:col-span-2 xl:col-span-4">
            <label className="mb-2 block text-sm font-bold text-slate-700">
              OBS
            </label>
            <textarea
              value={form.observacoes}
              onChange={(e) => atualizarCampo('observacoes', e.target.value)}
              className="min-h-[120px] w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Ex.: Só para próximo mês / oferta feita msg 1 / sem retorno das msgs..."
            />
          </div>

          <div className="xl:col-span-4 flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95 disabled:opacity-60"
            >
              {loading ? 'Salvando...' : editandoId ? 'Atualizar lead' : 'Cadastrar lead'}
            </button>

            <button
              type="button"
              onClick={limparFormulario}
              className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Limpar formulário
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              Leads cadastrados
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Consulte, edite e acompanhe os registros lançados no sistema.
            </p>
          </div>

          <div className="grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Buscar
              </label>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Cliente, empresa, telefone, vendedor..."
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Filtrar status
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="Todos">Todos</option>
                {statusLead.map((item) => (
                  <option key={item.id} value={item.nome}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selecionados.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="text-sm font-bold text-red-700">
              {selecionados.length} lead(s) selecionado(s)
            </span>

            <button
              type="button"
              onClick={excluirSelecionados}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              Excluir selecionados
            </button>

            <button
              type="button"
              onClick={() => setSelecionados([])}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white"
            >
              Limpar seleção
            </button>
          </div>
        ) : null}

        {carregandoLista ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando leads...
          </div>
        ) : leadsFiltrados.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Nenhum lead encontrado.
          </div>
        ) : (
          <>
  <div
    ref={tabelaScrollTopRef}
    className="mb-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50"
  >
    <div ref={tabelaScrollContentRef} className="h-4" />
  </div>

  <div
    ref={tabelaScrollBottomRef}
    className="overflow-x-auto rounded-2xl border border-slate-200"
  >
            <table className="min-w-[1700px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 font-bold shadow-[4px_0_6px_-4px_rgba(0,0,0,0.08)]">
  <input
    type="checkbox"
    checked={todosSelecionados}
    onChange={(e) => {
      if (e.target.checked) {
        setSelecionados(leadsFiltrados.map((lead) => lead.id))
      } else {
        setSelecionados([])
      }
    }}
  />
</th>
                  <th className="px-4 py-3 font-bold">Data Contato</th>
                  <th className="px-4 py-3 font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Vendedor</th>
                  <th className="sticky left-[56px] z-20 bg-slate-50 px-4 py-3 font-bold shadow-[4px_0_6px_-4px_rgba(0,0,0,0.08)]">
                  Cliente
                  </th>
                  <th className="px-4 py-3 font-bold">Empresa</th>
                  <th className="px-4 py-3 font-bold">Telefone</th>
                  <th className="px-4 py-3 font-bold">UF</th>
                  <th className="px-4 py-3 font-bold">Produto</th>
                  <th className="px-4 py-3 font-bold">Orçamento</th>
                  <th className="px-4 py-3 font-bold">Frete</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Data</th>
                  <th className="px-4 py-3 font-bold">OBS</th>
                  <th className="sticky right-0 z-20 bg-slate-50 px-4 py-3 font-bold shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]">
  Ações
</th>
                </tr>
              </thead>

              <tbody>
                {leadsFiltrados.map((lead) => (
                  <tr
                    key={lead.id}
                    id={`lead-${lead.id}`}
                    className={`border-t border-slate-200 align-top ${
                      leadEmFoco === lead.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td
  className={`sticky left-0 z-10 px-4 py-3 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.08)] ${
    leadEmFoco === lead.id ? 'bg-blue-50' : 'bg-white'
  }`}
>
  <input
    type="checkbox"
    checked={selecionados.includes(lead.id)}
    onChange={(e) => {
      if (e.target.checked) {
        setSelecionados((prev) => [...prev, lead.id])
      } else {
        setSelecionados((prev) => prev.filter((id) => id !== lead.id))
      }
    }}
  />
</td>
                    <td className="px-4 py-3">{formatDateBR(lead.data_contato)}</td>
                    <td className="px-4 py-3">{lead.tipo_contato || '-'}</td>
                    <td className="px-4 py-3">{lead.vendedor || '-'}</td>
                    <td  className={`sticky left-[56px] z-10 px-4 py-3 font-medium text-slate-900 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.08)] ${
                     leadEmFoco === lead.id ? 'bg-blue-50' : 'bg-white'
  }`}
>
  {lead.nome_cliente}
</td>
                    <td className="px-4 py-3">{lead.nome_empresa || '-'}</td>
                    <td className="px-4 py-3">{lead.telefone || '-'}</td>
                    <td className="px-4 py-3">{lead.uf || '-'}</td>
                    <td className="px-4 py-3">{lead.produto_interesse || '-'}</td>
                    <td className="px-4 py-3">{formatCurrency(lead.valor_orcamento)}</td>
                    <td className="px-4 py-3">{formatCurrency(lead.valor_frete)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusBadgeClassByColor(
                          mapaCoresStatus.get(lead.status || '') || null
                        )}`}
                      >
                        {lead.status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDateBR(lead.data_retorno)}</td>
                    <td className="min-w-[220px] px-4 py-3">{lead.observacoes || '-'}</td>
                    <td
  className={`sticky right-0 z-10 px-4 py-3 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)] ${
    leadEmFoco === lead.id ? 'bg-blue-50' : 'bg-white'
  }`}
>
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => editarLead(lead)}
      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
    >
      Editar
    </button>

    <button
      type="button"
      onClick={() => excluirLead(lead.id)}
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
    >
      Excluir
    </button>
  </div>
</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
</>
        )}
      </section>
    </div>
  )
}