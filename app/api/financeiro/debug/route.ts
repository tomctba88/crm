import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { tinyRequest, tinyPaginado } from '@/lib/tiny/api'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: integracao } = await supabase
      .from('integracoes_olist').select('token, ativo').eq('nome', 'olist_tiny').maybeSingle()

    if (!integracao?.token) return NextResponse.json({ error: 'Token não encontrado.' }, { status: 400 })

    const hoje = new Date()
    const ini = new Date(); ini.setFullYear(hoje.getFullYear() - 3)
    const fim = new Date(); fim.setFullYear(hoje.getFullYear() + 2)
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR')

    const bodyFiltrado = new URLSearchParams({
      token: integracao.token, formato: 'json', pagina: '1',
      data_ini_vencimento: fmt(ini), data_fim_vencimento: fmt(fim),
    })

    const [resCR, resCP] = await Promise.all([
      fetch('https://api.tiny.com.br/api2/contas.receber.pesquisa.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyFiltrado.toString(),
        cache: 'no-store',
      }).then(r => r.json()).catch(e => ({ fetch_error: String(e) })),
      fetch('https://api.tiny.com.br/api2/contas.pagar.pesquisa.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyFiltrado.toString(),
        cache: 'no-store',
      }).then(r => r.json()).catch(e => ({ fetch_error: String(e) })),
    ])

    // Verificar quantos registros existem nas tabelas
    const [{ count: countCR }, { count: countCP }, { count: countFC }] = await Promise.all([
      supabase.from('fin_contas_receber').select('*', { count: 'exact', head: true }),
      supabase.from('fin_contas_pagar').select('*', { count: 'exact', head: true }),
      supabase.from('fin_fluxo_caixa').select('*', { count: 'exact', head: true }),
    ])

    // Verificar últimos logs (com detalhes para ver total_tiny)
    const { data: logs } = await supabase
      .from('logs_integracao')
      .select('recurso,status,mensagem,detalhes,created_at')
      .in('recurso', ['contas_receber', 'contas_pagar', 'fluxo_caixa'])
      .order('created_at', { ascending: false })
      .limit(6)

    // Inspecionar estrutura real da resposta Tiny
    let tinyRetorno: Record<string, unknown> | null = null
    let tinyErro: string | null = null
    let chaveAutoDetectada: string | null = null
    let primeiroItem: unknown = null
    let totalItensNaPagina = 0

    try {
      tinyRetorno = await tinyRequest(integracao.token, 'contas.receber.pesquisa', {
        pagina: '1',
        data_ini_vencimento: bodyFiltrado.get('data_ini_vencimento') ?? '',
        data_fim_vencimento: bodyFiltrado.get('data_fim_vencimento') ?? '',
      })

      // Auto-detectar a chave da coleção
      const arrayKey = Object.keys(tinyRetorno).find(k => Array.isArray(tinyRetorno![k]) && k !== 'erros')
      if (arrayKey) {
        chaveAutoDetectada = arrayKey
        const col = tinyRetorno[arrayKey] as unknown[]
        totalItensNaPagina = col.length
        const rawFirst = col[0] as Record<string, unknown>
        primeiroItem = rawFirst
      }
    } catch (e) {
      tinyErro = String(e)
    }

    // Buscar detalhe de uma conta recebida para ver se tem data_ocorrencia
    let detalheReceber: unknown = null
    let detalheErro: string | null = null
    try {
      const primId = '781832716' // id do primeiro item recebido que vimos no debug
      const det = await tinyRequest(integracao.token, 'contas.receber.obter', { id: primId })
      detalheReceber = det
    } catch (e) {
      detalheErro = String(e)
    }

    // Testar tinyPaginado para contas.pagar (só página 1)
    let pagarCount = -1
    let pagarErro: string | null = null
    let pagarPrimeiro: unknown = null
    try {
      const ini2 = new Date(); ini2.setFullYear(ini2.getFullYear() - 3)
      const fim2 = new Date(); fim2.setFullYear(fim2.getFullYear() + 2)
      const dd = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
      const itens = await tinyPaginado(
        integracao.token, 'contas.pagar.pesquisa', 'contas', 'conta',
        { data_ini_vencimento: dd(ini2), data_fim_vencimento: dd(fim2) }, 1
      )
      pagarCount = itens.length
      pagarPrimeiro = itens[0] ?? null
    } catch (e) {
      pagarErro = String(e)
    }

    return NextResponse.json({
      tabelas: { fin_contas_receber: countCR, fin_contas_pagar: countCP, fin_fluxo_caixa: countFC },
      ultimos_logs: logs,
      tiny_status_cr: resCR?.retorno?.status_processamento,
      tiny_total_paginas_cr: resCR?.retorno?.numero_paginas,
      token_ativo: integracao.ativo,
      tinyRequest_erro: tinyErro,
      tinyRequest_chave_auto: chaveAutoDetectada,
      tinyRequest_itens_na_pagina1: totalItensNaPagina,
      tinyRequest_primeiro_item: primeiroItem,
      contas_pagar_count_pagina1: pagarCount,
      contas_pagar_primeiro: pagarPrimeiro,
      contas_pagar_erro: pagarErro,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
