'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type CadastroItem = {
  id: number
  nome: string
  ativo: boolean
  cor?: string | null
}

type TabelaConfig = {
  key: 'vendedores' | 'tiposContato' | 'statusLead' | 'produtos'
  titulo: string
  tabela: string
  placeholder: string
  temCor?: boolean
}

const tabelas: TabelaConfig[] = [
  {
    key: 'vendedores',
    titulo: 'Vendedores',
    tabela: 'cadastro_vendedores',
    placeholder: 'Nome do vendedor',
  },
  {
    key: 'tiposContato',
    titulo: 'Tipos de contato',
    tabela: 'cadastro_tipos_contato',
    placeholder: 'Nome do tipo de contato',
  },
  {
    key: 'statusLead',
    titulo: 'Status do lead',
    tabela: 'cadastro_status_lead',
    placeholder: 'Nome do status',
    temCor: true,
  },
  {
    key: 'produtos',
    titulo: 'Produtos de interesse',
    tabela: 'cadastro_produtos_interesse',
    placeholder: 'Nome do produto/interesse',
  },
]

export default function CadastrosManager() {
  const supabase = useMemo(() => createClient(), [])

  const [dados, setDados] = useState<Record<string, CadastroItem[]>>({})
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [cores, setCores] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  async function carregarTabela(config: TabelaConfig) {
    const { data, error } = await supabase
      .from(config.tabela)
      .select('*')
      .order('nome', { ascending: true })

    if (error) {
      console.error(`Erro ao buscar ${config.tabela}:`, error)
      return
    }

    setDados((prev) => ({
      ...prev,
      [config.key]: data || [],
    }))
  }

  async function carregarTudo() {
    for (const config of tabelas) {
      await carregarTabela(config)
    }
  }

  useEffect(() => {
    carregarTudo()
  }, [])

  function setInput(key: string, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  function setCor(key: string, value: string) {
    setCores((prev) => ({ ...prev, [key]: value }))
  }

  function iniciarEdicao(config: TabelaConfig, item: CadastroItem) {
    setEditando((prev) => ({ ...prev, [config.key]: item.id }))
    setInputs((prev) => ({ ...prev, [config.key]: item.nome }))
    if (config.temCor) {
      setCores((prev) => ({ ...prev, [config.key]: item.cor || '' }))
    }
  }

  function limpar(config: TabelaConfig) {
    setEditando((prev) => ({ ...prev, [config.key]: null }))
    setInputs((prev) => ({ ...prev, [config.key]: '' }))
    if (config.temCor) {
      setCores((prev) => ({ ...prev, [config.key]: '' }))
    }
  }

  async function salvar(config: TabelaConfig) {
    const nome = inputs[config.key]?.trim()

    if (!nome) {
      alert(`Informe um valor em ${config.titulo}.`)
      return
    }

    setLoading((prev) => ({ ...prev, [config.key]: true }))

    const id = editando[config.key]
    const payload = config.temCor
      ? { nome, cor: cores[config.key] || null }
      : { nome }

    if (id) {
      const { error } = await supabase
        .from(config.tabela)
        .update(payload)
        .eq('id', id)

      if (error) {
        console.error(`Erro ao atualizar ${config.titulo}:`, error)
        alert(`Erro ao atualizar ${config.titulo}.`)
        setLoading((prev) => ({ ...prev, [config.key]: false }))
        return
      }
    } else {
      const { error } = await supabase
        .from(config.tabela)
        .insert(payload)

      if (error) {
        console.error(`Erro ao cadastrar ${config.titulo}:`, error)
        alert(`Erro ao cadastrar ${config.titulo}.`)
        setLoading((prev) => ({ ...prev, [config.key]: false }))
        return
      }
    }

    limpar(config)
    await carregarTabela(config)
    setLoading((prev) => ({ ...prev, [config.key]: false }))
  }

  async function excluir(config: TabelaConfig, id: number) {
    const confirmar = confirm(`Deseja excluir este item de ${config.titulo}?`)
    if (!confirmar) return

    const { error } = await supabase
      .from(config.tabela)
      .delete()
      .eq('id', id)

    if (error) {
      console.error(`Erro ao excluir ${config.titulo}:`, error)
      alert(`Erro ao excluir ${config.titulo}.`)
      return
    }

    await carregarTabela(config)
  }

  async function alternarAtivo(config: TabelaConfig, item: CadastroItem) {
    const { error } = await supabase
      .from(config.tabela)
      .update({ ativo: !item.ativo })
      .eq('id', item.id)

    if (error) {
      console.error(`Erro ao atualizar status de ${config.titulo}:`, error)
      alert(`Erro ao atualizar ${config.titulo}.`)
      return
    }

    await carregarTabela(config)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
          Administração do sistema
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">Cadastros</h1>
        <p className="mt-2 text-sm text-slate-500">
          Gerencie os itens usados nas telas de lançamento de leads.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {tabelas.map((config) => {
          const itens = dados[config.key] || []
          const valor = inputs[config.key] || ''
          const cor = cores[config.key] || ''
          const carregando = loading[config.key] || false
          const editandoId = editando[config.key]

          return (
            <section
              key={config.key}
              className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-5">
                <h2 className="text-2xl font-black text-slate-900">{config.titulo}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cadastre, edite, ative ou exclua itens.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={valor}
                  onChange={(e) => setInput(config.key, e.target.value)}
                  placeholder={config.placeholder}
                  className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />

                {config.temCor ? (
                  <input
                    type="text"
                    value={cor}
                    onChange={(e) => setCor(config.key, e.target.value)}
                    placeholder="Cor do status: green, red, yellow..."
                    className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => salvar(config)}
                    disabled={carregando}
                    className="rounded-xl bg-[linear-gradient(90deg,#08142d_0%,#1e4ca1_100%)] px-5 py-3 text-sm font-bold text-white shadow-lg"
                  >
                    {carregando
                      ? 'Salvando...'
                      : editandoId
                      ? 'Atualizar'
                      : 'Cadastrar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => limpar(config)}
                    className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-bold">Nome</th>
                      {config.temCor ? <th className="px-4 py-3 font-bold">Cor</th> : null}
                      <th className="px-4 py-3 font-bold">Ativo</th>
                      <th className="px-4 py-3 font-bold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.nome}</td>
                        {config.temCor ? (
                          <td className="px-4 py-3">{item.cor || '-'}</td>
                        ) : null}
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              item.ativo
                                ? 'bg-green-50 text-green-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => iniciarEdicao(config, item)}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => alternarAtivo(config, item)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                            >
                              {item.ativo ? 'Inativar' : 'Ativar'}
                            </button>

                            <button
                              type="button"
                              onClick={() => excluir(config, item.id)}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {itens.length === 0 ? (
                      <tr>
                        <td
                          colSpan={config.temCor ? 4 : 3}
                          className="px-4 py-6 text-center text-slate-500"
                        >
                          Nenhum item cadastrado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}