const TINY_BASE = 'https://api.tiny.com.br/api2'

export function dataTinyParaISO(dataTiny: string): string | null {
  if (!dataTiny || dataTiny.trim() === '' || dataTiny === '0000-00-00') return null
  const partes = dataTiny.trim().split('/')
  if (partes.length !== 3) return null
  const [dia, mes, ano] = partes
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
}

export function isoParaDataTiny(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export async function getTinyToken(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from('integracoes_olist')
    .select('token')
    .eq('nome', 'olist_tiny')
    .eq('ativo', true)
    .maybeSingle()
  if (error || !data?.token) {
    throw new Error('Token Tiny não configurado ou integração inativa. Configure em Financeiro > Integrações.')
  }
  return data.token
}

// POST com application/x-www-form-urlencoded — único método aceito pela API Tiny v2
export async function tinyFetch(
  token: string,
  endpoint: string,
  params: Record<string, string | number> = {},
  tentativa = 1
): Promise<any> {
  const body = new URLSearchParams({ token, formato: 'json' })
  Object.entries(params).forEach(([k, v]) => body.set(k, String(v)))

  const res = await fetch(`${TINY_BASE}/${endpoint}.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })

  if (res.status === 429 && tentativa < 4) {
    await new Promise(r => setTimeout(r, tentativa * 2000))
    return tinyFetch(token, endpoint, params, tentativa + 1)
  }

  if (!res.ok) throw new Error(`Tiny HTTP ${res.status} em ${endpoint}`)

  const json = await res.json().catch(() => { throw new Error(`Resposta inválida da API Tiny: ${endpoint}`) })
  const retorno = json?.retorno

  if (!retorno) throw new Error(`Sem retorno da API Tiny: ${endpoint}`)

  if (Number(retorno.status_processamento) !== 3) {
    const erros = retorno.erros as any
    const msg = (Array.isArray(erros) ? erros[0]?.erro : erros?.erro)
      || `Erro na API Tiny: ${endpoint}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  return retorno
}

export async function tinyFetchTodas(
  token: string,
  endpoint: string,
  params: Record<string, string | number> = {},
  chaveRegistros: string
): Promise<any[]> {
  const todos: any[] = []
  let pagina = 1
  let totalPaginas = 1

  do {
    let retorno: any
    try {
      retorno = await tinyFetch(token, endpoint, { ...params, pagina })
    } catch (e) {
      console.error(`tinyFetchTodas ${endpoint} pág ${pagina}:`, e)
      break
    }

    totalPaginas = Number(retorno?.numero_paginas ?? 1)

    const registros = retorno?.registros?.registro
    if (!registros) break

    const lista = Array.isArray(registros) ? registros : [registros]

    for (const item of lista) {
      const nested = item[chaveRegistros] ?? item
      if (nested) todos.push(nested)
    }

    pagina++
    if (pagina <= totalPaginas) await new Promise(r => setTimeout(r, 300))
  } while (pagina <= totalPaginas)

  return todos
}
