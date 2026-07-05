import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server-client'

// Recebe um lote de linhas do Tiny (objetos com as chaves = cabeçalhos da planilha)
// e faz upsert por tiny_id na tabela produtos_catalogo.

type Linha = Record<string, unknown>

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = Number(s)
  return isFinite(n) ? n : null
}

function mapear(l: Linha) {
  const g = (k: string) => l[k]
  return {
    tiny_id: txt(g('ID')),
    sku: txt(g('Código (SKU)')),
    descricao: txt(g('Descrição')),
    descricao_complementar: txt(g('Descrição complementar')),
    observacoes: txt(g('Observações')),
    unidade: txt(g('Unidade')),
    ncm: txt(g('Classificação fiscal')),
    origem: txt(g('Origem')),
    cest: txt(g('CEST')),
    gtin: txt(g('GTIN/EAN')),
    preco: num(g('Preço')),
    preco_custo: num(g('Preço de custo')),
    preco_promocional: num(g('Preço promocional')),
    markup: num(g('Markup')),
    situacao: txt(g('Situação')),
    estoque: num(g('Estoque')),
    estoque_min: num(g('Estoque mínimo')),
    estoque_max: num(g('Estoque máximo')),
    fornecedor: txt(g('Fornecedor')),
    cod_fornecedor: txt(g('Cód do Fornecedor')),
    localizacao: txt(g('Localização')),
    marca: txt(g('Marca')),
    peso_liquido: num(g('Peso líquido (Kg)')),
    peso_bruto: num(g('Peso bruto (Kg)')),
    formato_embalagem: txt(g('Formato embalagem')),
    largura_emb: num(g('Largura embalagem')),
    altura_emb: num(g('Altura embalagem')),
    comprimento_emb: num(g('Comprimento embalagem')),
    diametro_emb: num(g('Diâmetro embalagem')),
    unidade_por_caixa: num(g('Unidade por caixa')),
    tipo_produto: txt(g('Tipo do produto')),
    codigo_pai: txt(g('Código do pai')),
    categoria: txt(g('Categoria')),
    sob_encomenda: txt(g('Sob encomenda')),
    permitir_venda: txt(g('Permitir inclusão nas vendas')),
    dias_preparacao: txt(g('Dias para preparação')),
    url_imagem: txt(g('URL imagem 1')),
    raw: l,
    updated_at: new Date().toISOString(),
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const linhas: Linha[] = Array.isArray(body.produtos) ? body.produtos : []
    if (linhas.length === 0) return NextResponse.json({ inseridos: 0 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // mapeia e descarta linhas sem tiny_id
    const registros = linhas.map(mapear).filter((r) => r.tiny_id)

    if (registros.length === 0) return NextResponse.json({ inseridos: 0 })

    const { error } = await admin
      .from('produtos_catalogo')
      .upsert(registros, { onConflict: 'tiny_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ inseridos: registros.length })
  } catch (e) {
    console.error('ERRO import catálogo:', e)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
