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
    const modulo = searchParams.get('modulo') || ''
    const userId = searchParams.get('userId') || ''
    const dataInicio = searchParams.get('dataInicio') || ''
    const dataFim = searchParams.get('dataFim') || ''

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Busca nomes de ambas as tabelas; profiles tem prioridade
    const [{ data: profilesData }, { data: portalData }] = await Promise.all([
      admin.from('profiles').select('id, nome, email'),
      admin.from('usuarios_portal').select('id, nome, email'),
    ])

    const usuariosMap = new Map<string, string>()
    for (const u of portalData || []) {
      if (u.id && u.nome) usuariosMap.set(u.id, u.nome)
    }
    for (const u of profilesData || []) {
      if (u.id && u.nome) usuariosMap.set(u.id, u.nome)
    }

    const atividades: {
      id: string
      modulo: string
      descricao: string
      usuario: string
      user_id: string | null
      timestamp: string
    }[] = []

    // ── Pipeline: lead_movimentacoes ─────────────────────────────────────────
    if (!modulo || modulo === 'Pipeline') {
      let q = admin
        .from('lead_movimentacoes')
        .select('id, lead_id, user_id, status_anterior, novo_status, movido_em')
        .order('movido_em', { ascending: false })
        .limit(300)

      if (userId) q = q.eq('user_id', userId)
      if (dataInicio) q = q.gte('movido_em', `${dataInicio}T00:00:00`)
      if (dataFim) q = q.lte('movido_em', `${dataFim}T23:59:59`)

      const { data: movs } = await q

      if (movs && movs.length > 0) {
        const leadIds = [...new Set(movs.map((m: any) => m.lead_id))]
        const { data: leadsData } = await admin
          .from('leads')
          .select('id, nome_cliente, nome_empresa')
          .in('id', leadIds)

        const leadsMap = new Map((leadsData || []).map((l: any) => [l.id, l]))

        for (const m of movs) {
          const lead = leadsMap.get(m.lead_id)
          const nomeCliente = lead?.nome_cliente || `Lead #${m.lead_id}`
          const empresa = lead?.nome_empresa ? ` (${lead.nome_empresa})` : ''
          atividades.push({
            id: `pipeline-${m.id}`,
            modulo: 'Pipeline',
            descricao: `${nomeCliente}${empresa}: ${m.status_anterior || '?'} → ${m.novo_status}`,
            usuario: usuariosMap.get(m.user_id) || 'Usuário desconhecido',
            user_id: m.user_id,
            timestamp: m.movido_em,
          })
        }
      }
    }

    // ── Leads: criações ──────────────────────────────────────────────────────
    if (!modulo || modulo === 'Leads') {
      let q = admin
        .from('leads')
        .select('id, nome_cliente, nome_empresa, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

      if (userId) q = q.eq('user_id', userId)
      if (dataInicio) q = q.gte('created_at', `${dataInicio}T00:00:00`)
      if (dataFim) q = q.lte('created_at', `${dataFim}T23:59:59`)

      const { data: leadsData } = await q

      for (const l of leadsData || []) {
        const empresa = l.nome_empresa ? ` (${l.nome_empresa})` : ''
        atividades.push({
          id: `lead-${l.id}`,
          modulo: 'Leads',
          descricao: `Novo lead cadastrado: ${l.nome_cliente}${empresa}`,
          usuario: usuariosMap.get(l.user_id) || 'Usuário desconhecido',
          user_id: l.user_id,
          timestamp: l.created_at,
        })
      }
    }

    // ── Pós-vendas: criações ─────────────────────────────────────────────────
    if (!modulo || modulo === 'Pós-vendas') {
      let q = admin
        .from('pos_vendas')
        .select('id, lead_id, user_id, status_pos_venda, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

      if (userId) q = q.eq('user_id', userId)
      if (dataInicio) q = q.gte('created_at', `${dataInicio}T00:00:00`)
      if (dataFim) q = q.lte('created_at', `${dataFim}T23:59:59`)

      const { data: pvsData } = await q

      if (pvsData && pvsData.length > 0) {
        const leadIds = [...new Set(pvsData.map((pv: any) => pv.lead_id))]
        const { data: leadsData } = await admin
          .from('leads')
          .select('id, nome_cliente, nome_empresa')
          .in('id', leadIds)

        const leadsMap = new Map((leadsData || []).map((l: any) => [l.id, l]))

        for (const pv of pvsData) {
          const lead = leadsMap.get(pv.lead_id)
          const nomeCliente = lead?.nome_cliente || `Lead #${pv.lead_id}`
          const empresa = lead?.nome_empresa ? ` (${lead.nome_empresa})` : ''
          atividades.push({
            id: `posvendas-${pv.id}`,
            modulo: 'Pós-vendas',
            descricao: `Pós-venda aberto: ${nomeCliente}${empresa}`,
            usuario: usuariosMap.get(pv.user_id) || 'Usuário desconhecido',
            user_id: pv.user_id,
            timestamp: pv.created_at,
          })
        }
      }
    }

    // Ordena por timestamp decrescente e limita
    atividades.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // Monta lista de usuários únicos presentes nas atividades (para filtro)
    const usuariosUnicos = Array.from(
      new Map(
        atividades
          .filter((a) => a.user_id)
          .map((a) => [a.user_id, { id: a.user_id, nome: a.usuario }])
      ).values()
    ).sort((a, b) => a.nome.localeCompare(b.nome))

    return NextResponse.json({
      atividades: atividades.slice(0, 300),
      usuarios: usuariosUnicos,
    })
  } catch (error) {
    console.error('ERRO AO BUSCAR ATIVIDADES:', error)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
