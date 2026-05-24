import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { getTinyToken, tinyFetchTodas, dataTinyParaISO, isoParaDataTiny } from '@/lib/tiny/client'

export const maxDuration = 300

function str(v: unknown): string {
  return v ? String(v) : ''
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const token = await getTinyToken(supabase)

    const hoje = new Date()
    const dataFinalISO = hoje.toISOString().slice(0, 10)
    const ini90 = new Date(hoje); ini90.setDate(ini90.getDate() - 90)
    const dataInicialISO = ini90.toISOString().slice(0, 10)

    const itens = await tinyFetchTodas(
      token, 'caixa.pesquisa',
      { dataInicial: isoParaDataTiny(dataInicialISO), dataFinal: isoParaDataTiny(dataFinalISO) },
      'lancamento'
    )

    const records = itens.filter(i => !!str(i.id)).map(i => {
      const tipoRaw = str(i.tipo).toUpperCase()
      const tipo = tipoRaw === 'R' || tipoRaw === 'ENTRADA' ? 'entrada' : 'saida'
      const catObj = i.categoria as any
      return {
        tiny_id: str(i.id),
        tipo,
        data_lancamento: dataTinyParaISO(str(i.data ?? i.data_lancamento)) ?? dataInicialISO,
        historico: str(i.historico ?? i.descricao),
        valor: Math.abs(Number(i.valor ?? 0)),
        categoria: str(catObj?.nome ?? i.categoria),
        categoria_id: str(catObj?.id ?? i.categoria_id),
        conta_bancaria: str(i.conta_bancaria ?? i.contaBancaria),
        documento_referencia: str(i.numero_doc ?? i.numero),
        origem: 'tiny',
        sincronizado_em: new Date().toISOString(),
      }
    })

    let sincronizados = 0, erros = 0
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await supabase.from('fin_caixa').upsert(records.slice(i, i + 500), { onConflict: 'tiny_id' })
      if (error) erros += 500; else sincronizados += records.slice(i, i + 500).length
    }

    return NextResponse.json({ sincronizados, erros, total_tiny: itens.length, ultima_sync: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
