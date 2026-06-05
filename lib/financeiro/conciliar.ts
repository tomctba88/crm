/**
 * Conciliação de categorias: cruza lançamentos de despesa do Fluxo de Caixa com os
 * títulos de Contas a Pagar (que têm a categoria correta do plano de contas) para
 * propor a categoria certa de cada lançamento.
 *
 * Casamento por VALOR (pago, fallback valor), refinado por contato==fornecedor e pelo
 * nº de documento extraído do histórico. Quando todos os candidatos compartilham a
 * mesma categoria, a proposta é considerada inequívoca ('unico').
 */

export type FluxoDespesa = {
  id: string | number
  grupo: string // contato no fluxo
  categoria: string
  periodo_label: string
  valor: number
}

export type CpTitulo = {
  fornecedor: string
  categoria: string
  numero_documento: string
  historico: string
  valor: number
  pago: number
}

export type Proposta = {
  id: string | number
  de: string // categoria atual
  para: string // categoria proposta
  valor: number
  historico: string
  contato: string
  status: 'unico' | 'ambiguo' | 'sem'
  mudou: boolean // para !== de (só relevante quando 'unico')
  opcoes: string[] // categorias candidatas quando 'ambiguo'
}

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100
const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const extrairDoc = (hist: string): string | null => {
  const m = String(hist || '').match(/n[ºo°]?\s*(\d{3,})/i)
  return m ? m[1] : null
}

export function conciliarCategorias(fluxo: FluxoDespesa[], cp: CpTitulo[]): Proposta[] {
  // Index dos títulos por valor (pago, fallback valor original).
  const porValor = new Map<number, CpTitulo[]>()
  for (const c of cp) {
    const v = round2(c.pago > 0 ? c.pago : c.valor)
    if (v <= 0) continue
    const arr = porValor.get(v)
    if (arr) arr.push(c)
    else porValor.set(v, [c])
  }

  return fluxo.map(f => {
    const de = f.categoria || 'Sem categoria'
    const base: Omit<Proposta, 'status' | 'para' | 'mudou' | 'opcoes'> = {
      id: f.id, de, valor: f.valor, historico: f.periodo_label, contato: f.grupo,
    }
    let cands = porValor.get(round2(f.valor)) ?? []

    // Refina por contato == fornecedor (quando o fluxo tem contato).
    const contato = norm(f.grupo)
    if (contato) {
      const byForn = cands.filter(c => norm(c.fornecedor) === contato)
      if (byForn.length) cands = byForn
    }
    // Refina por nº de documento presente no histórico.
    const doc = extrairDoc(f.periodo_label)
    if (doc) {
      const byDoc = cands.filter(c => c.historico.includes(doc) || c.numero_documento.includes(doc))
      if (byDoc.length) cands = byDoc
    }

    if (!cands.length) {
      return { ...base, status: 'sem', para: de, mudou: false, opcoes: [] }
    }
    const cats = [...new Set(cands.map(c => c.categoria || 'Sem categoria'))]
    if (cats.length === 1) {
      const para = cats[0]
      return { ...base, status: 'unico', para, mudou: para !== de, opcoes: [] }
    }
    return { ...base, status: 'ambiguo', para: de, mudou: false, opcoes: cats.sort((a, b) => a.localeCompare(b)) }
  })
}
