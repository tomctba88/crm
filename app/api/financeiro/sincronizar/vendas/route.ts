import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-client'
import { getTinyToken, tinyFetchTodas, tinyFetch, dataTinyParaISO } from '@/lib/tiny/client'
import { classificarSegmentoProduto } from '@/lib/tiny/categorias'

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

    let totalPedidos = 0
    let totalNFs = 0
    let totalItens = 0
    const erros: string[] = []

    // Buscar pedidos aprovados/em andamento
    const situacoesPedido = ['aprovado', 'faturado', 'preparando', 'enviado', 'entregue']
    const pedidosRaw = await tinyFetchTodas(
      token,
      'pedidos.pesquisa',
      { situacao: situacoesPedido.join(',') },
      'pedido'
    ).catch(e => { erros.push(`pedidos: ${e}`); return [] })

    for (const ped of pedidosRaw) {
      try {
        const tinyId = str(ped.id ?? ped.numero)
        if (!tinyId) continue

        const valorTotal = Number(ped.total_pedido ?? ped.totalPedido ?? ped.valor_total ?? 0)
        const valorDesconto = Number(ped.desconto ?? 0)
        const valorFrete = Number(ped.total_frete ?? ped.totalFrete ?? 0)
        const valorLiquido = valorTotal - valorDesconto

        // Buscar itens do pedido
        let itensPed: any[] = []
        try {
          const retorno = await tinyFetch(token, 'pedidos.obter', { id: tinyId })
          const pedidoDetalhe = retorno?.pedido ?? retorno
          const itensRaw = pedidoDetalhe?.itens?.item ?? pedidoDetalhe?.itens ?? []
          itensPed = Array.isArray(itensRaw) ? itensRaw : [itensRaw]
        } catch { /* sem itens */ }

        let valorEstofaria = 0
        let valorMarcenaria = 0
        const itensMapped = itensPed.map((it: any) => {
          const descricao = str(it.descricao ?? it.produto?.descricao ?? it.nome)
          const segmento = classificarSegmentoProduto(descricao)
          const qtd = Number(it.quantidade ?? 1)
          const unitario = Number(it.valor_unitario ?? it.valorUnitario ?? 0)
          const total = qtd * unitario
          const custoUnitario = Number(it.preco_custo ?? it.produto?.preco_custo ?? it.precoCusto ?? 0)
          const custoTotal = qtd * custoUnitario
          const margemValor = total - custoTotal
          const margemPct = total > 0 ? (margemValor / total) * 100 : 0
          if (segmento === 'estofaria') valorEstofaria += total
          if (segmento === 'marcenaria') valorMarcenaria += total
          return {
            tiny_produto_id: str(it.produto?.id ?? it.produto_id),
            codigo: str(it.codigo ?? it.produto?.codigo),
            descricao,
            unidade: str(it.unidade),
            quantidade: qtd,
            valor_unitario: unitario,
            valor_total: total,
            custo_unitario: custoUnitario,
            custo_total: custoTotal,
            segmento,
            margem_valor: margemValor,
            margem_percentual: margemPct,
          }
        })

        const vendaRecord = {
          tiny_id: tinyId,
          tipo_origem: 'pedido',
          numero: str(ped.numero),
          cliente: str(ped.nome_contato ?? ped.nome_cliente ?? ped.nomeContato),
          data_venda: dataTinyParaISO(str(ped.data ?? ped.data_pedido)),
          data_emissao: dataTinyParaISO(str(ped.data_emissao ?? ped.data)),
          valor_total: valorTotal,
          valor_desconto: valorDesconto,
          valor_frete: valorFrete,
          valor_liquido: valorLiquido,
          situacao: str(ped.situacao),
          valor_estofaria: valorEstofaria,
          valor_marcenaria: valorMarcenaria,
          origem: 'tiny',
          sincronizado_em: new Date().toISOString(),
        }

        const { data: vendaData, error: vendaErr } = await supabase
          .from('fin_vendas')
          .upsert(vendaRecord, { onConflict: 'tiny_id' })
          .select('id')
          .maybeSingle()

        if (vendaErr) { erros.push(`venda ${tinyId}: ${vendaErr.message}`); continue }
        if (!vendaData?.id) continue

        if (itensMapped.length > 0) {
          await supabase.from('fin_itens_venda').delete().eq('venda_id', vendaData.id)
          const itensComVenda = itensMapped.map(it => ({ ...it, venda_id: vendaData.id }))
          await supabase.from('fin_itens_venda').insert(itensComVenda)
          totalItens += itensComVenda.length
        }

        totalPedidos++
        await new Promise(r => setTimeout(r, 150))
      } catch (e) {
        erros.push(`pedido ${str(ped.id)}: ${e}`)
      }
    }

    // Notas Fiscais de saída
    const nfsRaw = await tinyFetchTodas(
      token,
      'nota.fiscal.pesquisa',
      { tipo: 'S' },
      'nota_fiscal'
    ).catch(e => { erros.push(`nfs: ${e}`); return [] })

    for (const nf of nfsRaw) {
      try {
        const tinyId = str(nf.id)
        if (!tinyId) continue

        const valorTotal = Number(nf.valor_total ?? nf.totalNota ?? 0)
        const valorDesconto = Number(nf.valor_desconto ?? 0)
        const valorFrete = Number(nf.valor_frete ?? 0)

        const nfRecord = {
          tiny_id: `nf-${tinyId}`,
          tipo_origem: 'nf',
          numero: str(nf.numero ?? nf.numero_nota),
          cliente: str(nf.nome_contato ?? nf.cliente?.nome),
          data_venda: dataTinyParaISO(str(nf.data_emissao ?? nf.dataEmissao)),
          data_emissao: dataTinyParaISO(str(nf.data_emissao ?? nf.dataEmissao)),
          valor_total: valorTotal,
          valor_desconto: valorDesconto,
          valor_frete: valorFrete,
          valor_liquido: valorTotal - valorDesconto,
          situacao: str(nf.situacao),
          valor_estofaria: 0,
          valor_marcenaria: 0,
          origem: 'tiny',
          sincronizado_em: new Date().toISOString(),
        }

        await supabase
          .from('fin_vendas')
          .upsert(nfRecord, { onConflict: 'tiny_id' })

        totalNFs++
      } catch (e) {
        erros.push(`nf ${str(nf.id)}: ${e}`)
      }
    }

    await supabase.from('logs_integracao').insert({
      integracao: 'tiny',
      recurso: 'vendas',
      status: erros.length > 0 ? 'parcial' : 'sucesso',
      mensagem: `${totalPedidos} pedidos, ${totalNFs} NFs, ${totalItens} itens sincronizados. ${erros.length} erros.`,
      detalhes: { totalPedidos, totalNFs, totalItens, erros: erros.slice(0, 20) },
    })

    return NextResponse.json({ pedidos: totalPedidos, notas_fiscais: totalNFs, itens: totalItens, erros: erros.slice(0, 10) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      { status: 500 }
    )
  }
}
