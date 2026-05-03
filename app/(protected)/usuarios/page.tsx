'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

type NivelAcesso = 'administrador' | 'operacional' | 'consulta'

type UsuarioSistema = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  cargo: string | null
  ativo: boolean
  nivel_acesso: NivelAcesso
}

export default function UsuariosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [nivelUsuarioLogado, setNivelUsuarioLogado] = useState<NivelAcesso>('consulta')
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [modalNovoUsuarioAberto, setModalNovoUsuarioAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioSistema | null>(null)

  const [nomeEdit, setNomeEdit] = useState('')
const [emailEdit, setEmailEdit] = useState('')
const [telefoneEdit, setTelefoneEdit] = useState('')
const [cargoEdit, setCargoEdit] = useState('')
const [nivelEdit, setNivelEdit] = useState<NivelAcesso>('operacional')
const [ativoEdit, setAtivoEdit] = useState(true)

const [modalSenhaAberto, setModalSenhaAberto] = useState(false)
const [usuarioSenha, setUsuarioSenha] = useState<UsuarioSistema | null>(null)
const [novaSenhaEdit, setNovaSenhaEdit] = useState('')
const [confirmarNovaSenhaEdit, setConfirmarNovaSenhaEdit] = useState('')

  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [novoCargo, setNovoCargo] = useState('')
  const [novoNivel, setNovoNivel] = useState<NivelAcesso>('operacional')
  const [criandoUsuario, setCriandoUsuario] = useState(false)

  async function buscarUsuarios() {
    setLoading(true)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, email, telefone, cargo, ativo, nivel_acesso')
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar usuários:', error)
      setUsuarios([])
      setLoading(false)
      return
    }

    setUsuarios((data || []) as UsuarioSistema[])
    setLoading(false)
  }

  useEffect(() => {
  async function carregar() {
    await buscarUsuarios()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('nivel_acesso')
      .eq('id', user.id)
      .single()

    if (data?.nivel_acesso) {
      setNivelUsuarioLogado(data.nivel_acesso)
    }
  }

  carregar()
}, [])

  function getNivelClasses(nivel: NivelAcesso) {
    if (nivel === 'administrador') return 'bg-blue-100 text-blue-700'
    if (nivel === 'operacional') return 'bg-green-100 text-green-700'
    return 'bg-amber-100 text-amber-700'
  }

  function getNivelLabel(nivel: NivelAcesso) {
    if (nivel === 'administrador') return 'Administrador'
    if (nivel === 'operacional') return 'Operacional'
    return 'Consulta'
  }

  function abrirModalEdicao(usuario: UsuarioSistema) {
    setUsuarioEditando(usuario)
    setNomeEdit(usuario.nome || '')
    setEmailEdit(usuario.email || '')
    setTelefoneEdit(usuario.telefone || '')
    setCargoEdit(usuario.cargo || '')
    setNivelEdit(usuario.nivel_acesso)
    setAtivoEdit(usuario.ativo)
    setModalAberto(true)
  }

  function fecharModal() {
  setModalAberto(false)
  setUsuarioEditando(null)
  setNomeEdit('')
  setEmailEdit('')
  setTelefoneEdit('')
  setCargoEdit('')
  setNivelEdit('operacional')
  setAtivoEdit(true)
}

function abrirModalSenha(usuario: UsuarioSistema) {
  setUsuarioSenha(usuario)
  setNovaSenhaEdit('')
  setConfirmarNovaSenhaEdit('')
  setModalSenhaAberto(true)
}

function fecharModalSenha() {
  setModalSenhaAberto(false)
  setUsuarioSenha(null)
  setNovaSenhaEdit('')
  setConfirmarNovaSenhaEdit('')
}

function exigirAdministrador() {
  if (nivelUsuarioLogado !== 'administrador') {
    alert('Somente administradores podem executar esta ação.')
    return false
  }

  return true
}

  async function salvarUsuario() {
    if (!usuarioEditando) return

    setSalvandoId(usuarioEditando.id)

    const { error } = await supabase
      .from('profiles')
      .update({
        nome: nomeEdit || null,
        email: emailEdit || null,
        telefone: telefoneEdit || null,
        cargo: cargoEdit || null,
        nivel_acesso: nivelEdit,
        ativo: ativoEdit,
      })
      .eq('id', usuarioEditando.id)

    if (error) {
      console.error('Erro ao salvar usuário:', error)
      alert('Erro ao salvar alterações do usuário.')
      setSalvandoId(null)
      return
    }

    setUsuarios((prev) =>
      prev.map((usuario) =>
        usuario.id === usuarioEditando.id
          ? {
              ...usuario,
              nome: nomeEdit || null,
              email: emailEdit || null,
              telefone: telefoneEdit || null,
              cargo: cargoEdit || null,
              nivel_acesso: nivelEdit,
              ativo: ativoEdit,
            }
          : usuario
      )
    )

    setSalvandoId(null)
    fecharModal()
  }

  async function alternarStatus(usuario: UsuarioSistema) {
    setSalvandoId(usuario.id)

    const novoStatus = !usuario.ativo

    const { error } = await supabase
      .from('profiles')
      .update({ ativo: novoStatus })
      .eq('id', usuario.id)

    if (error) {
      console.error('Erro ao alterar status do usuário:', error)
      alert('Erro ao alterar status do usuário.')
      setSalvandoId(null)
      return
    }

    setUsuarios((prev) =>
      prev.map((item) =>
        item.id === usuario.id
          ? {
              ...item,
              ativo: novoStatus,
            }
          : item
      )
    )

    setSalvandoId(null)
  }

  async function excluirUsuario(usuario: UsuarioSistema) {
  if (!exigirAdministrador()) return

  const nomeExibicao = usuario.nome || usuario.email || usuario.id
  const confirmar = confirm(`Deseja realmente excluir o usuário "${nomeExibicao}"?`)
  if (!confirmar) return

  setSalvandoId(usuario.id)

  try {
    const response = await fetch('/api/usuarios/excluir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: usuario.id }),
    })

    const result = await response.json()

    if (!response.ok) {
      alert(result.error || 'Erro ao excluir usuário.')
      setSalvandoId(null)
      return
    }

    setUsuarios((prev) => prev.filter((item) => item.id !== usuario.id))
    alert('Usuário excluído com sucesso.')
  } catch (error) {
    alert('Erro ao excluir usuário.')
  }

  setSalvandoId(null)
}

function cadastrarNovoUsuario() {
  setNovoNome('')
  setNovoEmail('')
  setNovaSenha('')
  setNovoTelefone('')
  setNovoCargo('')
  setNovoNivel('operacional')
  setModalNovoUsuarioAberto(true)
}

    async function salvarNovoUsuario() {
    if (!novoNome || !novoEmail || !novaSenha) {
      alert('Preencha nome, e-mail e senha.')
      return
    }

    setCriandoUsuario(true)

    try {
      const response = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: novoNome,
          email: novoEmail,
          senha: novaSenha,
          telefone: novoTelefone,
          cargo: novoCargo,
          nivel_acesso: novoNivel,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.error || 'Erro ao criar usuário.')
        setCriandoUsuario(false)
        return
      }

      setModalNovoUsuarioAberto(false)
      setCriandoUsuario(false)
      await buscarUsuarios()
    } catch (error) {
      alert('Erro ao criar usuário.')
      setCriandoUsuario(false)
    }
  }

async function salvarNovaSenha() {
  if (!exigirAdministrador()) return
  if (!usuarioSenha) return

  if (!novaSenhaEdit || !confirmarNovaSenhaEdit) {
    alert('Preencha a nova senha e a confirmação.')
    return
  }

  if (novaSenhaEdit.length < 6) {
    alert('A senha deve ter pelo menos 6 caracteres.')
    return
  }

  if (novaSenhaEdit !== confirmarNovaSenhaEdit) {
    alert('A confirmação da senha não confere.')
    return
  }

  setSalvandoId(usuarioSenha.id)

  try {
    const response = await fetch('/api/usuarios/alterar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: usuarioSenha.id,
        novaSenha: novaSenhaEdit,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      alert(result.error || 'Erro ao alterar senha.')
      setSalvandoId(null)
      return
    }

    alert('Senha alterada com sucesso.')
    fecharModalSenha()
  } catch (error) {
    alert('Erro ao alterar senha.')
  }

  setSalvandoId(null)
}

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Administração do sistema
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Usuários</h1>
            <p className="mt-3 max-w-3xl text-slate-500">
              Gerencie os usuários, níveis de acesso e situação de cada perfil no sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={cadastrarNovoUsuario}
            disabled={nivelUsuarioLogado !== 'administrador'}
            className={`rounded-xl px-5 py-3 text-sm font-bold text-white transition ${
              nivelUsuarioLogado === 'administrador'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            Cadastrar novo usuário
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
            Administrador
          </p>
          <p className="mt-2 text-sm text-blue-700">
            Acesso completo ao sistema.
          </p>
        </div>

        <div className="rounded-[24px] border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-700">
            Operacional
          </p>
          <p className="mt-2 text-sm text-green-700">
            Dashboard, Leads, Pipeline, Pós-vendas, Tarefas e acesso aos Relatórios de Vendedores.
          </p>
        </div>

        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
            Consulta
          </p>
          <p className="mt-2 text-sm text-amber-700">
            Pode consultar o sistema, sem cadastrar, editar, excluir ou movimentar registros.
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">Usuários cadastrados</h2>
            <p className="mt-1 text-sm text-slate-500">
              Edite informações, altere o nível de acesso e controle quem está ativo.
            </p>
          </div>

          <button
            type="button"
            onClick={buscarUsuarios}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Carregando usuários...
          </div>
        ) : usuarios.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-bold">Nome</th>
                  <th className="px-4 py-3 font-bold">E-mail</th>
                  <th className="px-4 py-3 font-bold">Cargo</th>
                  <th className="px-4 py-3 font-bold">Nível</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {usuario.nome || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {usuario.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {usuario.cargo || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${getNivelClasses(
                          usuario.nivel_acesso
                        )}`}
                      >
                        {getNivelLabel(usuario.nivel_acesso)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          usuario.ativo
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
  type="button"
  onClick={() => {
    if (nivelUsuarioLogado === 'administrador') {
      abrirModalEdicao(usuario)
    } else {
      alert('Somente administradores podem editar usuários.')
    }
  }}
  disabled={nivelUsuarioLogado !== 'administrador'}
  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
    nivelUsuarioLogado === 'administrador'
      ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
  }`}
>
  Editar
</button>

<button
  type="button"
  onClick={() => {
    if (nivelUsuarioLogado === 'administrador') {
      abrirModalSenha(usuario)
    } else {
      alert('Somente administradores podem alterar senha.')
    }
  }}
  disabled={nivelUsuarioLogado !== 'administrador'}
  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
    nivelUsuarioLogado === 'administrador'
      ? 'border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
  }`}
>
  Trocar senha
</button>

                        <button
  type="button"
  onClick={() => {
    if (nivelUsuarioLogado === 'administrador') {
      alternarStatus(usuario)
    } else {
      alert('Somente administradores podem alterar o status.')
    }
  }}
  disabled={salvandoId === usuario.id || nivelUsuarioLogado !== 'administrador'}
  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
    nivelUsuarioLogado === 'administrador'
      ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
  }`}
>
  {usuario.ativo ? 'Inativar' : 'Ativar'}
</button>

                        <button
  type="button"
  onClick={() => excluirUsuario(usuario)}
  disabled={salvandoId === usuario.id || nivelUsuarioLogado !== 'administrador'}
  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
    nivelUsuarioLogado === 'administrador'
      ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
  }`}
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
        )}
      </section>

      {modalAberto && usuarioEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-black text-slate-900">
              Editar usuário
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nome
                </label>
                <input
                  value={nomeEdit}
                  onChange={(e) => setNomeEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  E-mail
                </label>
                <input
                  value={emailEdit}
                  onChange={(e) => setEmailEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Telefone
                </label>
                <input
                  value={telefoneEdit}
                  onChange={(e) => setTelefoneEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Cargo
                </label>
                <input
                  value={cargoEdit}
                  onChange={(e) => setCargoEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nível de acesso
                </label>
                <select
                  value={nivelEdit}
                  onChange={(e) => setNivelEdit(e.target.value as NivelAcesso)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                >
                  <option value="administrador">Administrador</option>
                  <option value="operacional">Operacional</option>
                  <option value="consulta">Consulta</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Status
                </label>
                <select
                  value={ativoEdit ? 'ativo' : 'inativo'}
                  onChange={(e) => setAtivoEdit(e.target.value === 'ativo')}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={fecharModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancelar
              </button>

              <button
  type="button"
  onClick={() => {
    if (nivelUsuarioLogado === 'administrador') {
      salvarUsuario()
    } else {
      alert('Somente administradores podem salvar alterações.')
    }
  }}
  disabled={salvandoId === usuarioEditando.id || nivelUsuarioLogado !== 'administrador'}
  className={`rounded-lg px-4 py-2 text-sm font-bold ${
    nivelUsuarioLogado === 'administrador'
      ? 'bg-blue-600 text-white'
      : 'cursor-not-allowed bg-slate-300 text-slate-500'
  }`}
>
  Salvar alterações
</button>
            </div>
          </div>
        </div>
      ) : null}
      {modalNovoUsuarioAberto ? (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
      <h2 className="mb-4 text-xl font-black text-slate-900">
        Cadastrar novo usuário
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            Nome
          </label>
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            E-mail
          </label>
          <input
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            Senha
          </label>
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            Telefone
          </label>
          <input
            value={novoTelefone}
            onChange={(e) => setNovoTelefone(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            Cargo
          </label>
          <input
            value={novoCargo}
            onChange={(e) => setNovoCargo(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            Nível de acesso
          </label>
          <select
            value={novoNivel}
            onChange={(e) => setNovoNivel(e.target.value as NivelAcesso)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3"
          >
            <option value="administrador">Administrador</option>
            <option value="operacional">Operacional</option>
            <option value="consulta">Consulta</option>
          </select>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={() => setModalNovoUsuarioAberto(false)}
          className="rounded-lg border px-4 py-2"
        >
          Cancelar
        </button>

        <button
          onClick={salvarNovoUsuario}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          Cadastrar usuário
        </button>
      </div>
    </div>
  </div>
) : null}

      {modalSenhaAberto && usuarioSenha ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-black text-slate-900">
              Alterar senha do usuário
            </h2>

            <p className="mb-4 text-sm text-slate-500">
              Usuário: <span className="font-bold text-slate-700">{usuarioSenha.nome || usuarioSenha.email || usuarioSenha.id}</span>
            </p>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nova senha
                </label>
                <input
                  type="password"
                  value={novaSenhaEdit}
                  onChange={(e) => setNovaSenhaEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmarNovaSenhaEdit}
                  onChange={(e) => setConfirmarNovaSenhaEdit(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={fecharModalSenha}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={salvarNovaSenha}
                disabled={salvandoId === usuarioSenha.id}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white"
              >
                Salvar nova senha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}