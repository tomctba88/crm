const TINY_BASE_URL = 'https://api.tiny.com.br/api2'

export async function tinyRequest(
  token: string,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ token, formato: 'json', ...params })

  const response = await fetch(`${TINY_BASE_URL}/${endpoint}.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Tiny API HTTP error: ${response.status}`)
  }

  const data = await response.json().catch(() => {
    throw new Error('Resposta inválida da API do Tiny')
  })

  const retorno = data?.retorno as Record<string, unknown> | undefined
  if (!retorno) throw new Error('Resposta sem retorno da API do Tiny')

  if (retorno.status_processamento !== 3) {
    const erros = retorno.erros as Array<Record<string, string>> | undefined
    const msg = erros?.[0]?.erro || erros?.[0]?.mensagem || 'Erro na API do Tiny'
    throw new Error(msg)
  }

  return retorno
}

export async function getTinyToken(supabase: {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: boolean) => {
          maybeSingle: () => Promise<{ data: { token: string } | null }>
        }
      }
    }
  }
}): Promise<string> {
  const { data } = await supabase
    .from('integracoes_olist')
    .select('token')
    .eq('nome', 'olist_tiny')
    .eq('ativo', true)
    .maybeSingle()

  if (!data?.token) throw new Error('Token do Tiny não configurado ou integração inativa')
  return data.token
}

export async function tinyPaginado(
  token: string,
  endpoint: string,
  collectionKey: string,
  itemKey: string,
  extraParams: Record<string, string> = {}
): Promise<Record<string, unknown>[]> {
  const todos: Record<string, unknown>[] = []
  let pagina = 1

  while (true) {
    const retorno = await tinyRequest(token, endpoint, {
      pagina: String(pagina),
      ...extraParams,
    })

    const collection = retorno[collectionKey]
    const items = Array.isArray(collection) ? collection : []

    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>
      const nested = itemKey ? (item[itemKey] as Record<string, unknown>) : item
      if (nested) todos.push(nested)
    }

    const numPaginas = Number(retorno.numero_paginas ?? 1)
    if (pagina >= numPaginas || items.length === 0) break
    pagina++
  }

  return todos
}
