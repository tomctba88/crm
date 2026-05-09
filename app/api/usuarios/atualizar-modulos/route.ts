import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: perfilLogado } = await supabase
      .from('profiles')
      .select('nivel_acesso')
      .eq('id', user.id)
      .single()

    if (perfilLogado?.nivel_acesso !== 'administrador') {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
    }

    const body = await req.json()
    const userId = String(body.userId || '')
    const modulosSelecionados: string[] = Array.isArray(body.modulos) ? body.modulos : []
    const nivelAcesso = String(body.nivel_acesso || 'operacional')

    if (!userId) return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Sincroniza role_geral no usuarios_portal
    const roleGeral = nivelAcesso === 'administrador' ? 'admin' : nivelAcesso === 'consulta' ? 'consulta' : 'operacional'
    await admin.from('usuarios_portal').update({ role_geral: roleGeral }).eq('id', userId)

    // Remove todas as permissões anteriores do usuário
    await admin.from('usuarios_modulos').delete().eq('usuario_id', userId)

    // Não insere módulos para admin (tem acesso a tudo automaticamente)
    if (roleGeral !== 'admin' && modulosSelecionados.length > 0) {
      const { data: modulosEncontrados } = await admin
        .from('modulos')
        .select('id, slug')
        .in('slug', modulosSelecionados)

      const registros = (modulosEncontrados || []).map((m) => ({
        usuario_id: userId,
        modulo_id: m.id,
        pode_acessar: true,
        nivel_acesso: 'padrao',
      }))

      if (registros.length > 0) {
        await admin.from('usuarios_modulos').upsert(registros, { onConflict: 'usuario_id,modulo_id' })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
