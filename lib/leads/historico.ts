/**
 * Registro de alterações de leads (auditoria)
 *
 * Grava na tabela `lead_alteracoes` um resumo do que foi criado/alterado em cada
 * gravação de lead, para exibição no rodapé do lead.
 *
 * Migration: supabase/migrations/20240005_lead_alteracoes.sql
 *
 * As gravações são "best-effort": qualquer erro (ex.: tabela ainda não criada)
 * é apenas logado e NUNCA quebra o fluxo de salvar o lead.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

// Campos monitorados e seus rótulos legíveis (na ordem de exibição)
const CAMPOS_LABEL: Record<string, string> = {
  data_contato: 'Data do contato',
  tipo_contato: 'Tipo de contato',
  vendedor: 'Vendedor',
  nome_cliente: 'Cliente',
  nome_empresa: 'Empresa',
  telefone: 'Telefone',
  uf: 'UF',
  produto_interesse: 'Produto',
  valor_orcamento: 'Valor do orçamento',
  valor_frete: 'Valor do frete',
  status: 'Status',
  data_retorno: 'Data de retorno',
  data_fechamento: 'Data de fechamento',
  data_cancelamento: 'Data de cancelamento',
  data_finalizacao: 'Data de finalização',
  observacoes: 'Observações',
}

const CAMPOS_DATA = new Set([
  'data_contato',
  'data_retorno',
  'data_fechamento',
  'data_cancelamento',
  'data_finalizacao',
])

const CAMPOS_VALOR = new Set(['valor_orcamento', 'valor_frete'])

function normalizarComparacao(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number') return String(valor)
  return String(valor).trim()
}

function formatarExibicao(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '(vazio)'

  if (CAMPOS_DATA.has(campo)) {
    const iso = String(valor).slice(0, 10)
    const [ano, mes, dia] = iso.split('-')
    if (ano && mes && dia) return `${dia}/${mes}/${ano}`
    return String(valor)
  }

  if (CAMPOS_VALOR.has(campo)) {
    const num = Number(valor)
    if (!Number.isNaN(num)) {
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }
  }

  return String(valor)
}

export type AlteracaoCampo = { campo: string; label: string; de: string; para: string }

/**
 * Compara o estado anterior e o novo, montando a lista de campos alterados.
 */
export function calcularAlteracoes(
  anterior: Record<string, unknown> | null,
  novo: Record<string, unknown>
): AlteracaoCampo[] {
  const alteracoes: AlteracaoCampo[] = []

  for (const campo of Object.keys(CAMPOS_LABEL)) {
    // Só considera campos efetivamente presentes no payload novo
    if (!(campo in novo)) continue

    const valorAnterior = anterior ? anterior[campo] : undefined
    const valorNovo = novo[campo]

    if (normalizarComparacao(valorAnterior) === normalizarComparacao(valorNovo)) {
      continue
    }

    alteracoes.push({
      campo,
      label: CAMPOS_LABEL[campo],
      de: formatarExibicao(campo, valorAnterior),
      para: formatarExibicao(campo, valorNovo),
    })
  }

  return alteracoes
}

function montarResumo(tipo: 'CRIACAO' | 'EDICAO', alteracoes: AlteracaoCampo[]): string {
  if (tipo === 'CRIACAO') return 'Lead cadastrado'
  if (alteracoes.length === 0) return 'Lead salvo (sem alterações de campos)'
  return alteracoes.map((a) => `${a.label}: ${a.de} → ${a.para}`).join('; ')
}

/**
 * Registra uma entrada de auditoria para o lead. Best-effort: nunca lança.
 */
export async function registrarAlteracaoLead(params: {
  admin: Admin
  leadId: number
  userId: string | null
  tipo: 'CRIACAO' | 'EDICAO'
  anterior: Record<string, unknown> | null
  novo: Record<string, unknown>
}): Promise<void> {
  try {
    const { admin, leadId, userId, tipo, anterior, novo } = params

    const alteracoes = tipo === 'CRIACAO' ? [] : calcularAlteracoes(anterior, novo)

    // Em edição, se nada mudou, não registra nada
    if (tipo === 'EDICAO' && alteracoes.length === 0) return

    await admin.from('lead_alteracoes').insert({
      lead_id: leadId,
      user_id: userId,
      tipo,
      resumo: montarResumo(tipo, alteracoes),
      alteracoes,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Falha ao registrar histórico do lead (ignorada):', error)
  }
}
