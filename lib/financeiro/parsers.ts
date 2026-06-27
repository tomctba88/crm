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
// Colunas lidas pelo NOME do cabeçalho (a ordem varia entre exports do Tiny).
// Layouts já vistos:
//   Antigo:  Vencimento | Cliente | Histórico | Nº banco | Nº documento | Data emissão | Valor | Saldo | Recebido | Antecipada
//   Novo:    Cliente | Histórico | Categoria | Nº banco | Nº documento | Data de emissão | Vencimento | Valor | Saldo | Recebido | Antecipada
export function parseContasReceber(rows: unknown[][]): Array<{
  vencimento: string | null; cliente: string; historico: string
  numero_banco: string; numero_documento: string; data_emissao: string | null
  valor: number; saldo: number; recebido: number; antecipada: boolean; status: string
}> {
  if (!rows.length) return []
  const header = (rows[0] as unknown[]).map(h => String(h || '').trim().toLowerCase())
  const col = (...nomes: string[]) => header.findIndex(h => nomes.some(n => h.includes(n)))
  const iVenc = col('vencimento')
  const iCli = col('cliente')
  const iHist = col('histórico', 'historico')
  const iBanco = col('banco')
  const iDoc = col('documento')
  const iEmis = col('emissão', 'emissao')
  const iValor = col('valor')
  const iSaldo = col('saldo')
  const iReceb = col('recebido')
  const iAntec = col('antecipada')

  const at = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 7) continue
    const vencimento = parseDateBR(at(row, iVenc))
    if (!vencimento) continue
    const valor = parseNum(at(row, iValor))
    const saldo = parseNum(at(row, iSaldo))
    const recebido = parseNum(at(row, iReceb))
    const antecipada = String(at(row, iAntec) || '').trim().toLowerCase() === 'sim'
    let status = 'aberto'
    if (saldo === 0 && recebido > 0) status = 'recebido'
    else if (recebido > 0 && saldo > 0) status = 'parcial'
    results.push({
      vencimento,
      cliente: String(at(row, iCli) || '').trim(),
      historico: String(at(row, iHist) || '').trim(),
      numero_banco: String(at(row, iBanco) || '').trim(),
      numero_documento: String(at(row, iDoc) || '').trim(),
      data_emissao: parseDateBR(at(row, iEmis)),
      valor, saldo, recebido, antecipada, status,
    })
  }
  return results
}

// ─── CONTAS A PAGAR ──────────────────────────────────────────────────────────
// Colunas detectadas pelo NOME do cabeçalho (a ordem varia entre exports do Tiny).
// Layouts já vistos:
//   Antigo:  Vencimento | Fornecedor | Histórico | Nº documento | Data emissão | Valor | Saldo | Pago
//   Novo:    Fornecedor | Histórico | Categoria | Nº documento | Data de emissão | Vencimento | Valor | Saldo | Pago
export function parseContasPagar(rows: unknown[][]): Array<{
  vencimento: string | null; fornecedor: string; historico: string; categoria: string
  numero_documento: string; data_emissao: string | null
  valor: number; saldo: number; pago: number; status: string
}> {
  if (!rows.length) return []
  const header = (rows[0] as unknown[]).map(h => String(h || '').trim().toLowerCase())
  const col = (...nomes: string[]) => header.findIndex(h => nomes.some(n => h.includes(n)))
  // Posições por nome; -1 quando a coluna não existe no export.
  const iVenc = col('vencimento')
  const iForn = col('fornecedor')
  const iHist = col('histórico', 'historico')
  const iCat = col('categoria')
  const iDoc = col('documento')
  const iEmis = col('emissão', 'emissao')
  const iValor = col('valor')
  const iSaldo = col('saldo')
  const iPago = col('pago')

  const at = (row: unknown[], i: number) => (i >= 0 ? row[i] : '')
  const results = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length < 4) continue
    const fornecedor = String(at(row, iForn) || '').trim()
    const vencimento = parseDateBR(at(row, iVenc))
    // Linha válida precisa ter ao menos fornecedor ou vencimento (ignora cabeçalho/totais).
    if (!fornecedor && !vencimento) continue
    if (fornecedor.toLowerCase() === 'fornecedor' || isLinhaTotal(fornecedor)) continue
    const valor = parseNum(at(row, iValor))
    const saldo = parseNum(at(row, iSaldo))
    const pago = parseNum(at(row, iPago))
    let status = 'aberto'
    if (saldo === 0 && pago > 0) status = 'pago'
    else if (pago > 0 && saldo > 0) status = 'parcial'
    results.push({
      vencimento,
      fornecedor,
      historico: String(at(row, iHist) || '').trim(),
      categoria: String(at(row, iCat) || '').trim(),
      numero_documento: String(at(row, iDoc) || '').trim(),
      data_emissao: parseDateBR(at(row, iEmis)),
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
// O Tiny exporta este relatório em dois layouts:
//   A) Produto | Código (SKU) | Quantidade | Valor | Frete | Custo | Valor Lucro | % Lucro | Total
//   B) (Grupo) | Produto | Código (SKU) | Quantidade | Valor | ...  (com coluna de grupo à esquerda)
// Por isso lemos as colunas pelo NOME do cabeçalho, não por posição fixa.
// Custo e Lucro podem ser "-" quando o produto não tem custo cadastrado.
// Valor/Custo/Lucro já são o total da linha (não unitários).
export function parseVendasProdutos(rows: unknown[][]): Array<{
  produto: string; sku: string; quantidade: number; valor: number
  frete: number; custo: number; valor_lucro: number | null; percentual_lucro: number | null
  total: number; tem_custo: boolean; grupo: string | null
}> {
  if (!rows.length) return []

  const norm = (s: unknown) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Localiza a linha de cabeçalho (a que tem "Produto" e "Valor")
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const h = (rows[i] || []).map(norm)
    if (h.includes('produto') && h.some(c => c === 'valor')) { headerIdx = i; break }
  }
  const header = (rows[headerIdx] || []).map(norm)
  const acha = (pred: (h: string) => boolean) => header.findIndex(pred)

  const idxProduto = acha(h => h === 'produto')
  const idxSku     = acha(h => h.includes('sku') || h.includes('codigo'))
  const idxQtd     = acha(h => h.includes('quantidade') || h === 'qtd')
  const idxValor   = acha(h => h === 'valor')
  const idxFrete   = acha(h => h.includes('frete'))
  const idxCusto   = acha(h => h === 'custo' || (h.includes('custo') && !h.includes('%')))
  const idxLucro   = acha(h => h.includes('lucro') && !h.includes('%'))
  const idxPct     = acha(h => h.includes('%'))
  const idxTotal   = acha(h => h === 'total')
  // Coluna de grupo (layout B): qualquer coluna à esquerda do Produto
  const idxGrupo   = idxProduto > 0 ? idxProduto - 1 : -1

  if (idxProduto < 0 || idxValor < 0) return [] // cabeçalho não reconhecido

  const cel = (row: unknown[], i: number) => (i >= 0 ? String(row[i] ?? '').trim() : '')

  const results = []
  let grupoAtual: string | null = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const produto = cel(row, idxProduto)
    const grupoCel = cel(row, idxGrupo)

    // Layout B: linha que é só cabeçalho de grupo (grupo preenchido, produto vazio)
    if (!produto) {
      if (grupoCel && !isLinhaTotal(grupoCel)) grupoAtual = grupoCel
      continue
    }
    if (isLinhaTotal(produto)) continue

    const custoRaw = cel(row, idxCusto)
    const lucroRaw = cel(row, idxLucro)
    const pctRaw   = cel(row, idxPct)
    const temCusto = custoRaw !== '-' && custoRaw !== '' && custoRaw !== '0' && parseNum(custoRaw) > 0
    results.push({
      produto,
      sku: cel(row, idxSku),
      quantidade: parseInt(cel(row, idxQtd) || '1') || 1,
      valor: parseNum(cel(row, idxValor)),
      frete: parseNum(cel(row, idxFrete)),
      custo: temCusto ? parseNum(custoRaw) : 0,
      valor_lucro: lucroRaw === '-' || lucroRaw === '' ? null : parseNum(lucroRaw),
      percentual_lucro: pctRaw === '-' || pctRaw === '' ? null : parsePct(pctRaw),
      total: parseNum(cel(row, idxTotal)),
      tem_custo: temCusto,
      grupo: grupoAtual,
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
