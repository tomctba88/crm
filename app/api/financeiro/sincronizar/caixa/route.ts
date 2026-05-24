import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { getTinyToken, tinyFetchTodas, dataTinyParaISO, isoParaDataTiny } from '@/lib/tiny/client'

export const maxDuration = 300

function str(v: unknown): string {
  return v ? String(v) : ''
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const token = await getTinyToken(supabase)

    const url = new URL(request.url)
    const hoje = new Date()
    const dataFinalISO = url.searchParams.get('dataFinal') ?? hoje.toISOString().slice(0, 10)
    const defaultIni = new Date(hoje); defaultIni.setDate(defaultIni.getDate() - 90)
    const dataInicialISO = url.searchParams.get('dataInicial') ?? defaultIni.toISOString().slice(0, 10)

    const dataInicial = isoParaDataTiny(dataInicialISO)
    const dataFinal = isoParaDataTiny(dataFinalISO)

    const itens = await tinyFetchTodas(
      token,
      'caixa.pesquisa',
      { dataInicial, dataFinal },
      'lancamento'
    )

    const records = itens
      .filter(i => !!str(i.id))
      .map(i => {
        const tipoRaw = str(i.tipo).toUpperCase()
        const tipo = tipoRaw === 'R' || tipoRaw === 'ENTRADA' || tipoRaw === 'RECEITA' ? 'entrada' : 'saida'
        const catObj = i.categoria as any
        const categoria = str(catObj?.nome ?? i.categoria)
        const categoriaId = str(catObj?.id ?? i.categoria_id)
        return {
          tiny_id: str(i.id),
          tipo,
          data_lancamento: dataTinyParaISO(str(i.data ?? i.data_lancamento)) ?? dataInicialISO,
          historico: str(i.historico ?? i.descricao),
          valor: Math.abs(Number(i.valor ?? 0)),
          categoria,
          categoria_id: categoriaId,
          conta_bancaria: str(i.conta_bancaria ?? i.contaBancaria),
          documento_referencia: str(i.numero_doc ?? i.numero ?? i.documento_referencia),
          origem: 'tiny',
          sincronizado_em: new Date().toISOString(),
        }
      })

    let sincronizados = 0
    let erros = 0
    let entradas = 0
    let saidas = 0

    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500)
      const { error } = await supabase
        .from('fin_caixa')
        .upsert(chunk, { onConflict: 'tiny_id' })
      if (error) erros += chunk.length
      else {
        sincronizados += chunk.length
        entradas += chunk.filter(r => r.tipo === 'entrada').length
        saidas += chunk.filter(r => r.tipo === 'saida').length
      }
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'caixa',
      status: erros > 0 ? (sincronizados > 0 ? 'parcial' : 'erro') : 'sucesso',
      mensagem: `${sincronizados} lançamentos do caixa sincronizados. ${erros} erros.`,
      detalhes: { sincronizados, entradas, saidas, erros, total_tiny: itens.length, periodo: { dataInicialISO, dataFinalISO } },
    })

    return NextResponse.json({ sincronizados, entradas, saidas, erros, periodo: { dataInicial: dataInicialISO, dataFinal: dataFinalISO } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
