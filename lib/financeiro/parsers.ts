/**
 * Parsers para relatórios XLS exportados do Tiny ERP.
 * Cada função recebe rows[][] (output do SheetJS) e retorna registros normalizados.
 */

export function parseDateBR(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

export function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const s = String(val).replace(',', '.').replace(/[^\d.-]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parsePct(val: unknown): number {
  if (!val) return 0
  const s = String(val).replace('%', '').replace(',', '.').trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parseClienteCNPJ(val: unknown): { cliente: string; cnpj: string } {
  const s = String(val || '').trim()
  const match = s.match(/^(.*?)\s*-\s*([\d.\/\-]+)\s*$/)
  if (match && match[2].length >= 11) return { cliente: match[1].trim(), cnpj: match[2].trim() }
  return { cliente: s, cnpj: '' }
}

// Detecta linhas de total/subtotal/resumo que não devem ser contadas como registro.
// Ex: "Total", "Totais", "Subtotal", ou um rótulo puramente numérico (linha de soma sem nome).
export function isLinhaTotal(rotulo: unknown): boolean {
  const s = String(rotulo || '').trim().toLowerCase()
  if (!s) return false
  if (s === 'total' || s === 'totais' || s === 'subtotal' || s === 'total geral' || s.startsWith('total ')) return true
  // Rótulo que é apenas um número (linha de soma sem texto) — ex: "157274.51"
  if (/^[\d.,]+$/.test(s)) return true
  return false
}

// ─── BALANCETE ────────────────────────────────────────────────────────────────
// Formatos aceitos:
//   Compacto: Tipo | Grupo | Categoria | Mai/26 | Total
//   Diário:   Tipo | Grupo | Categoria | Sex 1/5 | Sab 2/5 | ... | Dom 31/5 | Total
// O parser localiza a coluna "Total" dinamicamente.
export function parseBalancete(rows: unknown[][]): Array<{
  tipo: string; grupo: string; categoria: string; valor: number
}> {
  if (!rows.length) return []
  const header = (rows[0] as unknown[]).map(h => String(h || '').trim())
  // Localiza a coluna "Total" — pode ser índice 3 (compacto) ou 34 (diário)
  const totalIdx = header.findIndex(h => h.toLowerCase() === 'total')
  const valorIdx = totalIdx >= 0 ? totalIdx : 3
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 4) continue
    const tipo = String(row[0] || '').trim().toLowerCase()
    if (!tipo || tipo === 'tipo') continue
    const grupo = String(row[1] || '').trim()
    const categoria = String(row[2] || '').trim()
    if (!categoria || categoria.toLowerCase() === 'categoria') continue
    const valor = parseNum(row[valorIdx])
    if (valor === 0) continue
    results.push({ tipo: tipo === 'entrada' ? 'entrada' : 'saida', grupo, categoria, valor })
  }
  return results
}

// ─── FLUXO DE CAIXA ──────────────────────────────────────────────────────────
// Formato Tiny "Entradas e Saídas por Contato":
// Colunas: Contato | Data | Histórico | Categoria | Valor
// Transferências internas são excluídas automaticamente.
export function parseFluxoCaixa(rows: unknown[][]): Array<{
  tipo: string; grupo: string; categoria: string
  periodo_label: string; data_inicio: string | null; data_fim: string | null; valor: number
}> {
  if (!rows.length) return []
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 5) continue
    const historico = String(row[2] || '').trim()
    if (!historico) continue
    const histLower = historico.toLowerCase()
    if (histLower.startsWith('transferência entre contas') || histLower.startsWith('transferencia entre contas')) continue
    const valorRaw = parseNum(row[4])
    if (valorRaw === 0) continue
    const data = parseDateBR(row[1])
    if (!data) continue
    const grupo = String(row[0] || '').trim()
    const categoria = String(row[3] || '').trim() || 'Sem categoria'
    results.push({
      tipo: valorRaw > 0 ? 'receita' : 'despesa',
      grupo,
      categoria,
      periodo_label: historico.slice(0, 80),
      data_inicio: data,
      data_fim: data,
      valor: Math.abs(valorRaw),
    })
  }
  return results
}

// ─── VENDAS ──────────────────────────────────────────────────────────────────
// 3 formatos aceitos (detecção automática pelo header):
//
// Detalhado (9 col): Pedido | Fonte de Receita | Cliente | Total Venda | Frete | Valor Vendido | Custo | Lucro | Margem
//   → Exportar do Tiny: Relatórios → Vendas → Relatório de Vendas (com Fonte de Receita)
//   → Popula segmento: Corporativo/Decor/Lojista
//
// Completo  (7 col): Cliente | Valor | Frete | Custo | Valor Lucro | % Lucro | Total
// Simples   (4 col): Cliente | Valor | Frete | Total
export function parseVendas(rows: unknown[][]): Array<{
  cliente: string; cnpj_cpf: string; valor: number; frete: number
  custo: number; valor_lucro: number; percentual_lucro: number; total: number; segmento: string
}> {
  if (!rows.length) return []
  const header = (rows[0] as unknown[]).map(h => String(h || '').trim().toLowerCase())
  const temFonte = header.some(h => h.includes('fonte'))
  const temMargem = !temFonte && header.some(h => h.includes('custo') || h.includes('lucro'))

  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 3) continue

    if (temFonte) {
      // Formato detalhado: Pedido | Fonte de Receita | Cliente | Total Venda | Frete | Valor Vendido | Custo | Lucro | Margem
      const clienteRaw = String(row[2] || '').trim()
      if (!clienteRaw || clienteRaw.toLowerCase() === 'cliente') continue
      if (isLinhaTotal(clienteRaw) || isLinhaTotal(row[1])) continue
      const { cliente, cnpj } = parseClienteCNPJ(clienteRaw)
      const fonteRaw = String(row[1] || '').trim().toLowerCase()
      const segmento = fonteRaw.includes('corpo') ? 'corporativo'
        : fonteRaw.includes('decor') ? 'decor'
        : fonteRaw.includes('lojist') ? 'lojista' : 'outros'
      const margemDecimal = parseNum(row[8])
      results.push({
        cliente, cnpj_cpf: cnpj,
        valor: parseNum(row[5]),
        frete: parseNum(row[4]),
        custo: parseNum(row[6]),
        valor_lucro: parseNum(row[7]),
        // margem vem como decimal (0.38) ou percentual (38) — normaliza para percentual
        percentual_lucro: margemDecimal > 0 && margemDecimal <= 1 ? margemDecimal * 100 : margemDecimal,
        total: parseNum(row[3]),
        segmento,
      })
    } else if (temMargem) {
      // Formato completo: Cliente | Valor | Frete | Custo | Valor Lucro | % Lucro | Total
      const clienteRaw = String(row[0] || '').trim()
      if (!clienteRaw || clienteRaw.toLowerCase() === 'cliente') continue
      if (isLinhaTotal(clienteRaw)) continue
      const { cliente, cnpj } = parseClienteCNPJ(clienteRaw)
      results.push({
        cliente, cnpj_cpf: cnpj,
        valor: parseNum(row[1]),
        frete: parseNum(row[2]),
        custo: parseNum(row[3]),
        valor_lucro: parseNum(row[4]),
        percentual_lucro: parsePct(row[5]),
        total: parseNum(row[6] ?? row[4]),
        segmento: 'outros',
      })
    } else {
      // Formato simples: Cliente | Valor | Frete | Total
      const clienteRaw = String(row[0] || '').trim()
      if (!clienteRaw || clienteRaw.toLowerCase() === 'cliente') continue
      if (isLinhaTotal(clienteRaw)) continue
      const { cliente, cnpj } = parseClienteCNPJ(clienteRaw)
      results.push({
        cliente, cnpj_cpf: cnpj,
        valor: parseNum(row[1]),
        frete: parseNum(row[2]),
        custo: 0, valor_lucro: 0, percentual_lucro: 0,
        total: parseNum(row[3]),
        segmento: 'outros',
      })
    }
  }
  return results
}

// ─── CONTAS A RECEBER ────────────────────────────────────────────────────────
// Colunas: Vencimento | Cliente | Histórico | Nº banco | Nº documento | Data emissão | Valor | Saldo | Recebido | Antecipada
export function parseContasReceber(rows: unknown[][]): Array<{
  vencimento: string | null; cliente: string; historico: string
  numero_banco: string; numero_documento: string; data_emissao: string | null
  valor: number; saldo: number; recebido: number; antecipada: boolean; status: string
}> {
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 7) continue
    const vencimento = parseDateBR(row[0])
    if (!vencimento) continue
    const valor = parseNum(row[6])
    const saldo = parseNum(row[7])
    const recebido = parseNum(row[8])
    const antecipada = String(row[9] || '').trim().toLowerCase() === 'sim'
    let status = 'aberto'
    if (saldo === 0 && recebido > 0) status = 'recebido'
    else if (recebido > 0 && saldo > 0) status = 'parcial'
    results.push({
      vencimento,
      cliente: String(row[1] || '').trim(),
      historico: String(row[2] || '').trim(),
      numero_banco: String(row[3] || '').trim(),
      numero_documento: String(row[4] || '').trim(),
      data_emissao: parseDateBR(row[5]),
      valor, saldo, recebido, antecipada, status,
    })
  }
  return results
}

// ─── CONTAS A PAGAR ──────────────────────────────────────────────────────────
// Colunas: Vencimento | Fornecedor | Histórico | Nº documento | Data emissão | Valor | Saldo | Pago
export function parseContasPagar(rows: unknown[][]): Array<{
  vencimento: string | null; fornecedor: string; historico: string
  numero_documento: string; data_emissao: string | null
  valor: number; saldo: number; pago: number; status: string
}> {
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 6) continue
    const vencimento = parseDateBR(row[0])
    if (!vencimento) continue
    const valor = parseNum(row[5])
    const saldo = parseNum(row[6])
    const pago = parseNum(row[7])
    let status = 'aberto'
    if (saldo === 0 && pago > 0) status = 'pago'
    else if (pago > 0 && saldo > 0) status = 'parcial'
    results.push({
      vencimento,
      fornecedor: String(row[1] || '').trim(),
      historico: String(row[2] || '').trim(),
      numero_documento: String(row[3] || '').trim(),
      data_emissao: parseDateBR(row[4]),
      valor, saldo, pago, status,
    })
  }
  return results
}

// ─── RECEBIMENTOS ─────────────────────────────────────────────────────────────
// Colunas: Cliente | Juros | Taxas | Acréscimos | Descontos | Valor Original | Valor Recebido
export function parseRecebimentos(rows: unknown[][]): Array<{
  cliente: string; juros: number; taxas: number
  acrescimos: number; descontos: number; valor_original: number; valor_recebido: number
}> {
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 6) continue
    const cliente = String(row[0] || '').trim()
    if (!cliente || cliente.toLowerCase() === 'cliente') continue
    const valor_original = parseNum(row[5])
    const valor_recebido = parseNum(row[6])
    if (valor_original === 0 && valor_recebido === 0) continue
    results.push({
      cliente,
      juros: parseNum(row[1]),
      taxas: parseNum(row[2]),
      acrescimos: parseNum(row[3]),
      descontos: parseNum(row[4]),
      valor_original,
      valor_recebido,
    })
  }
  return results
}

// ─── VENDAS POR PRODUTO ───────────────────────────────────────────────────────
// Formato: Produto (grupo) | Produto | Código SKU | Quantidade | Valor | Frete | Custo | Valor Lucro | % Lucro | Total
// Linhas de grupo têm col[0] preenchido e col[1] vazio → ignorar.
// Linhas de produto têm col[0] vazio e col[1] preenchido → processar.
// Custo e Lucro podem ser "-" quando o produto não tem custo cadastrado.
export function parseVendasProdutos(rows: unknown[][]): Array<{
  produto: string; sku: string; quantidade: number; valor: number
  frete: number; custo: number; valor_lucro: number | null; percentual_lucro: number | null
  total: number; tem_custo: boolean
}> {
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 4) continue
    const col0 = String(row[0] || '').trim()
    const col1 = String(row[1] || '').trim()
    if (!col1) continue // linha de grupo ou vazia (col1 é o nome do produto no detalhe)
    if (col0 && !col1) continue // linha de grupo sem detalhe
    if (isLinhaTotal(col1)) continue // linha de total/subtotal
    // Linha de detalhe válida precisa ter SKU OU quantidade — senão é resumo
    const skuVal = String(row[2] || '').trim()
    const qtdVal = parseNum(row[3])
    if (!skuVal && qtdVal === 0) continue
    const custoRaw = String(row[6] || '').trim()
    const lucroRaw = String(row[7] || '').trim()
    const pctRaw   = String(row[8] || '').trim()
    const temCusto = custoRaw !== '-' && custoRaw !== '' && custoRaw !== '0' && parseNum(row[6]) > 0
    results.push({
      produto: col1,
      sku: String(row[2] || '').trim(),
      quantidade: parseInt(String(row[3] || '1')) || 1,
      valor: parseNum(row[4]),
      frete: parseNum(row[5]),
      custo: temCusto ? parseNum(row[6]) : 0,
      valor_lucro: lucroRaw === '-' ? null : parseNum(row[7]),
      percentual_lucro: pctRaw === '-' ? null : parsePct(row[8]),
      total: parseNum(row[9]),
      tem_custo: temCusto,
    })
  }
  return results
}

// ─── PEDIDOS / NFs ────────────────────────────────────────────────────────────
// Colunas: Data | Número | Valor total | Taxas | Tarifas | Valor líquido |
//          Forma de recebimento | Meio de recebimento | Detalhes | Nº parcelas | Prazo médio | Situação
export function parsePedidos(rows: unknown[][]): Array<{
  data_venda: string | null; numero: string; valor_total: number
  taxas: number; tarifas: number; valor_liquido: number
  forma_recebimento: string; meio_recebimento: string; detalhes: string
  num_parcelas: string; prazo_medio: number; situacao: string
}> {
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 6) continue
    const data_venda = parseDateBR(row[0])
    if (!data_venda) continue
    const valor_total = parseNum(row[2])
    if (valor_total === 0) continue
    const prazoRaw = String(row[10] || '').replace(',', '.')
    results.push({
      data_venda,
      numero: String(row[1] || '').trim(),
      valor_total,
      taxas: parseNum(row[3]),
      tarifas: parseNum(row[4]),
      valor_liquido: parseNum(row[5]),
      forma_recebimento: String(row[6] || '').trim(),
      meio_recebimento: String(row[7] || '').trim(),
      detalhes: String(row[8] || '').trim(),
      num_parcelas: String(row[9] || '').trim(),
      prazo_medio: parseFloat(prazoRaw) || 0,
      situacao: String(row[11] || '').trim(),
    })
  }
  return results
}
