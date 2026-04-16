import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, senha, nome, nivel_acesso } = body

    // CLIENTE COM SERVICE ROLE (ADMIN)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // CLIENTE NORMAL (USUÁRIO LOGADO)
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value || ''

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: accessToken ? `Bearer ${accessToken}` : '',
          },
        },
      }
    )

    // 1. VERIFICAR USUÁRIO LOGADO
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      )
    }

    // 2. BUSCAR PERFIL DO USUÁRIO LOGADO
    const { data: perfil, error: perfilError } = await supabaseUser
      .from('profiles')
      .select('nivel_acesso')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return NextResponse.json(
        { error: 'Perfil não encontrado' },
        { status: 403 }
      )
    }

    // 3. BLOQUEAR SE NÃO FOR ADMIN
    if (perfil.nivel_acesso !== 'administrador') {
      return NextResponse.json(
        { error: 'Sem permissão' },
        { status: 403 }
      )
    }

    // 4. CRIAR USUÁRIO NO AUTH
    const { data: novoUsuario, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      })

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }

    // 5. CRIAR PERFIL
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: novoUsuario.user.id,
        nome,
        email,
        nivel_acesso,
        ativo: true,
      })

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Erro interno no servidor' },
      { status: 500 }
    )
  }
}