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
// Formato completo (8 col): Cliente | Valor | Frete | Custo | Valor Lucro | % Lucro | Total
// Formato simples  (4 col): Cliente | Valor | Frete | Total
// O parser detecta o formato automaticamente pelo número de colunas.
export function parseVendas(rows: unknown[][]): Array<{
  cliente: string; cnpj_cpf: string; valor: number; frete: number
  custo: number; valor_lucro: number; percentual_lucro: number; total: number; segmento: string
}> {
  if (!rows.length) return []
  const header = (rows[0] as unknown[]).map(h => String(h || '').trim().toLowerCase())
  const temMargem = header.some(h => h.includes('custo') || h.includes('lucro'))
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 3) continue
    const clienteRaw = String(row[0] || '').trim()
    if (!clienteRaw || clienteRaw.toLowerCase() === 'cliente') continue
    const { cliente, cnpj } = parseClienteCNPJ(clienteRaw)
    if (temMargem) {
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
      // Formato simples: sem custo/margem
      results.push({
        cliente, cnpj_cpf: cnpj,
        valor: parseNum(row[1]),
        frete: parseNum(row[2]),
        custo: 0,
        valor_lucro: 0,
        percentual_lucro: 0,
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
