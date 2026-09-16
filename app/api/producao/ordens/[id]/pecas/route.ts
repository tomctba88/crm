import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'
import { bordasDoCodigo } from '@/lib/producao/marcenaria'

/**
 * Peças de uma ordem de marcenaria.
 *
 * A peça é o nível que a estofaria não tem: um móvel são N painéis cortados que
 * passam pelas etapas em lotes. Daqui saem aproveitamento de chapa, metros de
 * fita e a fila de fitagem.
 *
 * O POST aceita uma peça ou um lote (importação de planilha). O import de DXF
 * da pasta PROGRAMAÇÃO do Promob entra na 2ª rodada e vai gravar nesta mesma
 * tabela, preenchendo `furacao` e `posicao_chapa`.
 */

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function autenticar() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const STATUS_VALIDOS = ['PENDENTE', 'CORTADA', 'FITADA', 'ACABADA', 'MONTADA', 'REFUGADA']

type EntradaPeca = {
  codigo?: string | null
  nome?: string | null
  modulo?: string | null
  chapa_id?: number | string | null
  comprimento_mm?: number | string
  largura_mm?: number | string
  espessura_mm?: number | string | null
  quantidade?: number | string
  fita_id?: number | string | null
  codigo_fita?: string | null
  fita_c1?: boolean
  fita_c2?: boolean
  fita_l1?: boolean
  fita_l2?: boolean
  furos?: number | string
  posicao_chapa?: string | null
  ordem_item_id?: number | string | null
  observacao?: string | null
}

/** Normaliza uma linha (do formulário ou da planilha) para o formato da tabela. */
function montarPeca(entrada: EntradaPeca, ordemId: number) {
  const comprimento = Number(entrada.comprimento_mm)
  const largura = Number(entrada.largura_mm)
  const nome = String(entrada.nome || '').trim()

  if (!nome) return { erro: 'Peça sem nome.' }
  if (!Number.isFinite(comprimento) || comprimento <= 0) {
    return { erro: `"${nome}": comprimento inválido.` }
  }
  if (!Number.isFinite(largura) || largura <= 0) {
    return { erro: `"${nome}": largura inválida.` }
  }

  // Quando vem código de fita (TL/1+/2+/SF), ele manda nas bandeiras. Sem código,
  // usa as bandeiras que vieram — é o caso de fitagem fora do padrão.
  const bordas = entrada.codigo_fita
    ? bordasDoCodigo(entrada.codigo_fita)
    : {
        c1: Boolean(entrada.fita_c1), c2: Boolean(entrada.fita_c2),
        l1: Boolean(entrada.fita_l1), l2: Boolean(entrada.fita_l2),
      }

  return {
    peca: {
      ordem_id: ordemId,
      ordem_item_id: entrada.ordem_item_id ? Number(entrada.ordem_item_id) : null,
      codigo: entrada.codigo?.toString().trim() || null,
      nome,
      modulo: entrada.modulo?.toString().trim() || null,
      chapa_id: entrada.chapa_id ? Number(entrada.chapa_id) : null,
      comprimento_mm: comprimento,
      largura_mm: largura,
      espessura_mm: entrada.espessura_mm ? Number(entrada.espessura_mm) : null,
      quantidade: Number(entrada.quantidade) || 1,
      fita_id: entrada.fita_id ? Number(entrada.fita_id) : null,
      fita_c1: bordas.c1,
      fita_c2: bordas.c2,
      fita_l1: bordas.l1,
      fita_l2: bordas.l2,
      codigo_fita: entrada.codigo_fita?.toString().trim().toUpperCase() || null,
      furos: Number(entrada.furos) || 0,
      posicao_chapa: entrada.posicao_chapa?.toString().trim() || null,
      observacao: entrada.observacao?.toString().trim() || null,
    },
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const { data, error } = await admin()
      .from('producao_pecas')
      .select('*, producao_chapas(nome,cor_padrao,espessura_mm), producao_fitas(nome,cor_padrao)')
      .eq('ordem_id', Number(id))
      .order('modulo', { nullsFirst: false })
      .order('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ pecas: data || [] })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const ordemId = Number(id)
    const body = await request.json()

    const entradas: EntradaPeca[] = Array.isArray(body.pecas) ? body.pecas : [body]
    if (entradas.length === 0) {
      return NextResponse.json({ error: 'Nenhuma peça enviada.' }, { status: 400 })
    }
    if (entradas.length > 2000) {
      return NextResponse.json({ error: 'Limite de 2000 peças por importação.' }, { status: 400 })
    }

    const montadas = []
    const erros: string[] = []
    for (const entrada of entradas) {
      const resultado = montarPeca(entrada, ordemId)
      if (resultado.erro) erros.push(resultado.erro)
      else montadas.push(resultado.peca)
    }

    // Numa importação, uma linha ruim não invalida as boas — relata e segue.
    if (montadas.length === 0) {
      return NextResponse.json(
        { error: erros[0] || 'Nenhuma peça válida.', erros },
        { status: 400 }
      )
    }

    const { data, error } = await admin()
      .from('producao_pecas')
      .insert(montadas)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({
      success: true,
      inseridas: data?.length || 0,
      ignoradas: erros.length,
      erros: erros.slice(0, 20),
    })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

const CAMPOS_EDITAVEIS = [
  'codigo', 'nome', 'modulo', 'chapa_id', 'ordem_item_id',
  'comprimento_mm', 'largura_mm', 'espessura_mm', 'quantidade',
  'fita_id', 'fita_c1', 'fita_c2', 'fita_l1', 'fita_l2',
  'furos', 'posicao_chapa', 'observacao',
] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const db = admin()
    const agora = new Date().toISOString()

    // Avanço de status em lote — é assim que a fila de fitagem anda
    if (Array.isArray(body.ids) && body.status) {
      const status = String(body.status).toUpperCase()
      if (!STATUS_VALIDOS.includes(status)) {
        return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
      }
      const { error } = await db
        .from('producao_pecas')
        .update({ status, updated_at: agora })
        .in('id', body.ids.map(Number))
        .eq('ordem_id', Number(id))

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, atualizadas: body.ids.length })
    }

    const pecaId = Number(body.id)
    if (!pecaId) return NextResponse.json({ error: 'Peça inválida.' }, { status: 400 })

    const atualizacao: Record<string, unknown> = { updated_at: agora }
    for (const campo of CAMPOS_EDITAVEIS) {
      if (campo in body) atualizacao[campo] = body[campo]
    }

    if ('status' in body) {
      const status = String(body.status).toUpperCase()
      if (!STATUS_VALIDOS.includes(status)) {
        return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
      }
      atualizacao.status = status
    }

    // Mexer numa borda invalida o código resumido: as bandeiras passam a mandar
    if (['fita_c1', 'fita_c2', 'fita_l1', 'fita_l2'].some((c) => c in body)) {
      atualizacao.codigo_fita = null
    }
    // E informar o código regrava as bandeiras
    if (body.codigo_fita) {
      const bordas = bordasDoCodigo(body.codigo_fita)
      atualizacao.codigo_fita = String(body.codigo_fita).toUpperCase()
      atualizacao.fita_c1 = bordas.c1
      atualizacao.fita_c2 = bordas.c2
      atualizacao.fita_l1 = bordas.l1
      atualizacao.fita_l2 = bordas.l2
    }

    const { error } = await db
      .from('producao_pecas')
      .update(atualizacao)
      .eq('id', pecaId)
      .eq('ordem_id', Number(id))

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await autenticar())) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { id } = await params
    const url = new URL(request.url)
    const pecaId = Number(url.searchParams.get('pecaId'))
    const todas = url.searchParams.get('todas') === '1'

    const db = admin()

    if (todas) {
      const { error } = await db.from('producao_pecas').delete().eq('ordem_id', Number(id))
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    if (!pecaId) return NextResponse.json({ error: 'Peça inválida.' }, { status: 400 })

    const { error } = await db
      .from('producao_pecas')
      .delete()
      .eq('id', pecaId)
      .eq('ordem_id', Number(id))

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
