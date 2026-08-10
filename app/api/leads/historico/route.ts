import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

export async function GET(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const leadId = Number(searchParams.get('leadId'))
    if (!leadId) {
      return NextResponse.json({ error: 'leadId obrigatório.' }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: registros, error } = await admin
      .from('lead_alteracoes')
      .select('id, tipo, resumo, alteracoes, user_id, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Tabela ainda não criada ou outro erro: devolve vazio sem quebrar o app
    if (error) {
      return NextResponse.json({ historico: [], disponivel: false })
    }

    const userIds = [
      ...new Set((registros || []).map((r) => r.user_id).filter(Boolean)),
    ]

    const usuariosMap = new Map<string, string>()
    if (userIds.length > 0) {
      const [{ data: profilesData }, { data: portalData }] = await Promise.all([
        admin.from('profiles').select('id, nome').in('id', userIds),
        admin.from('usuarios_portal').select('id, nome').in('id', userIds),
      ])
      for (const u of portalData || []) {
        if (u.id && u.nome) usuariosMap.set(u.id, u.nome)
      }
      for (const u of profilesData || []) {
        if (u.id && u.nome) usuariosMap.set(u.id, u.nome)
      }
    }

    const historico = (registros || []).map((r) => ({
      id: r.id,
      tipo: r.tipo,
      resumo: r.resumo,
      alteracoes: r.alteracoes || [],
      usuario: r.user_id
        ? usuariosMap.get(r.user_id) || 'Usuário desconhecido'
        : 'Sistema',
      timestamp: r.created_at,
    }))

    return NextResponse.json({ historico, disponivel: true })
  } catch (error) {
    console.error('ERRO AO BUSCAR HISTÓRICO DO LEAD:', error)
    return NextResponse.json({ historico: [], disponivel: false })
  }
}
