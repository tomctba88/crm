import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      )
    }

    const { data: perfilLogado } = await supabase
      .from('profiles')
      .select('nivel_acesso, ativo')
      .eq('id', user.id)
      .single()

    if (!perfilLogado || perfilLogado.nivel_acesso !== 'administrador') {
      return NextResponse.json(
        { error: 'Sem permissão para cadastrar usuários.' },
        { status: 403 }
      )
    }

    const body = await req.json()

    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const senha = String(body.senha || '').trim()
    const telefone = String(body.telefone || '').trim()
    const cargo = String(body.cargo || '').trim()
    const nivelAcesso = String(body.nivel_acesso || 'operacional').trim()

    if (!nome || !email || !senha) {
      return NextResponse.json(
        { error: 'Nome, e-mail e senha são obrigatórios.' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: novoUsuario, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
        },
      })

    if (createError || !novoUsuario.user) {
      return NextResponse.json(
        { error: createError?.message || 'Erro ao criar usuário no Auth.' },
        { status: 400 }
      )
    }

    const novoUsuarioId = novoUsuario.user.id

    const roleGeral =
      nivelAcesso === 'administrador'
        ? 'admin'
        : nivelAcesso === 'consulta'
          ? 'consulta'
          : 'operacional'

    const { error: portalError } = await supabaseAdmin
      .from('usuarios_portal')
      .upsert(
        {
          id: novoUsuarioId,
          nome,
          email,
          role_geral: roleGeral,
          ativo: true,
        },
        { onConflict: 'id' }
      )

    if (portalError) {
      return NextResponse.json(
        { error: portalError.message || 'Erro ao criar usuário no portal.' },
        { status: 400 }
      )
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: novoUsuarioId,
          nome,
          email,
          telefone: telefone || null,
          cargo: cargo || null,
          nivel_acesso: nivelAcesso,
          ativo: true,
        },
        { onConflict: 'id' }
      )

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message || 'Erro ao criar perfil no CRM.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Usuário criado com sucesso.',
    })
  } catch (err) {
    console.error('ERRO AO CRIAR USUÁRIO:', err)

    return NextResponse.json(
      { error: 'Erro interno no servidor.' },
      { status: 500 }
    )
  }
}