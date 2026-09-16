import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

/**
 * Apontamentos de produção — a base do indicador de produtividade.
 *
 * Duas formas de apontar, uma tabela só:
 *   origem='lancamento' → o encarregado informa horas + peças do dia
 *   origem='cronometro' → o estofador toca Iniciar (POST) e Finalizar (PATCH)
 *
 * `pecas` aqui é o que a PESSOA concluiu na etapa dela, não a cadeira pronta da
 * OP (essa é qtd_produzida do item). São medidas diferentes de propósito: um
 * estofador pode fechar 12 assentos num dia sem que saia uma OP inteira.
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

export async function POST(request: Request) {
  try {
    const user = await autenticar()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const funcionarioId = body.funcionario_id ? Number(body.funcionario_id) : null
    const maquinaId = body.maquina_id ? Number(body.maquina_id) : null

    // Marcenaria aponta por máquina (CNC, coladeira); estofaria por pessoa.
    // Acabamento e montagem apontam pelos dois. Um dos dois é obrigatório.
    if (!funcionarioId && !maquinaId) {
      return NextResponse.json(
        { error: 'Informe o funcionário ou a máquina.' },
        { status: 400 }
      )
    }

    const origem = body.origem === 'cronometro' ? 'cronometro' : 'lancamento'
    const db = admin()

    const registro: Record<string, unknown> = {
      funcionario_id: funcionarioId,
      maquina_id: maquinaId,
      ordem_id: body.ordem_id ? Number(body.ordem_id) : null,
      ordem_item_id: body.ordem_item_id ? Number(body.ordem_item_id) : null,
      etapa_id: body.etapa_id ? Number(body.etapa_id) : null,
      origem,
      observacao: body.observacao || null,
      created_by: user.email,
    }

    if (origem === 'cronometro') {
      // já existe cronômetro aberto? os índices únicos barram, mas a mensagem
      // fica melhor aqui — e o recurso ocupado precisa ser nomeado
      for (const [coluna, id, rotulo] of [
        ['funcionario_id', funcionarioId, 'Este funcionário'],
        ['maquina_id', maquinaId, 'Esta máquina'],
      ] as const) {
        if (!id) continue
        const { data: aberto } = await db
          .from('producao_apontamentos')
          .select('id')
          .eq(coluna, id)
          .is('fim', null)
          .not('inicio', 'is', null)
          .maybeSingle()

        if (aberto) {
          return NextResponse.json(
            { error: `${rotulo} já tem um apontamento em andamento. Finalize antes de iniciar outro.` },
            { status: 409 }
          )
        }
      }

      const agora = new Date()
      registro.inicio = agora.toISOString()
      registro.data_ref = agora.toISOString().slice(0, 10)
    } else {
      const horas = Number(body.horas)
      const pecas = Number(body.pecas) || 0
      const metros = Number(body.metros) || 0
      const chapas = Number(body.chapas) || 0

      if (!Number.isFinite(horas) || horas <= 0) {
        return NextResponse.json({ error: 'Informe as horas trabalhadas.' }, { status: 400 })
      }
      if (horas > 24) {
        return NextResponse.json({ error: 'Horas não pode passar de 24 em um dia.' }, { status: 400 })
      }
      if ([pecas, metros, chapas].some((v) => v < 0)) {
        return NextResponse.json({ error: 'Quantidade não pode ser negativa.' }, { status: 400 })
      }
      // Cada etapa rende na sua própria unidade: peças (montagem), metros
      // (coladeira) ou chapas (CNC). Ao menos uma precisa vir preenchida.
      if (pecas === 0 && metros === 0 && chapas === 0) {
        return NextResponse.json(
          { error: 'Informe a produção: peças, metros de fita ou chapas.' },
          { status: 400 }
        )
      }

      registro.horas = horas
      registro.data_ref = body.data_ref || new Date().toISOString().slice(0, 10)
    }

    // valem para os dois modos: no cronômetro entram zerados e são preenchidos
    // ao finalizar; no lançamento vêm do formulário
    registro.pecas = Number(body.pecas) || 0
    registro.metros = Number(body.metros) || 0
    registro.chapas = Number(body.chapas) || 0

    const { data, error } = await db
      .from('producao_apontamentos')
      .insert(registro)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, apontamento: data })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** Finaliza um cronômetro aberto, informando quantas peças saíram. */
export async function PATCH(request: Request) {
  try {
    const user = await autenticar()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const id = Number(body.id)
    const pecas = Number(body.pecas) || 0
    const metros = Number(body.metros) || 0
    const chapas = Number(body.chapas) || 0

    if (!id) return NextResponse.json({ error: 'Apontamento inválido.' }, { status: 400 })
    if ([pecas, metros, chapas].some((v) => v < 0)) {
      return NextResponse.json({ error: 'Quantidade não pode ser negativa.' }, { status: 400 })
    }
    if (pecas === 0 && metros === 0 && chapas === 0) {
      return NextResponse.json(
        { error: 'Informe a produção: peças, metros de fita ou chapas.' },
        { status: 400 }
      )
    }

    const db = admin()
    const { data: atual } = await db
      .from('producao_apontamentos')
      .select('id, inicio, fim')
      .eq('id', id)
      .maybeSingle()

    if (!atual) return NextResponse.json({ error: 'Apontamento não encontrado.' }, { status: 404 })
    if (atual.fim) return NextResponse.json({ error: 'Este apontamento já foi finalizado.' }, { status: 409 })

    const { error } = await db
      .from('producao_apontamentos')
      .update({
        fim: new Date().toISOString(),
        pecas,
        metros,
        chapas,
        observacao: body.observacao ?? undefined,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await autenticar()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'Apontamento inválido.' }, { status: 400 })

    const { error } = await admin().from('producao_apontamentos').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
