/**
 * Migração: frete-dashboard → Ergotex One
 *
 * Lê os dados da origem e gera um arquivo SQL com os INSERTs.
 * Depois, basta rodar o SQL gerado no SQL Editor do Supabase destino.
 *
 * Uso:
 *   node scripts/migrar-fretes.mjs
 *   → Gera: scripts/migrar-fretes-data.sql
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const ORIGEM_URL = 'https://nydgrlmlfivabmlpeptr.supabase.co'
const ORIGEM_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55ZGdybG1sZml2YWJtbHBlcHRyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2Nzc1MSwiZXhwIjoyMDkxNTQzNzUxfQ.xFcy6cSU1VDXIT4xXtJdNBo27uuTuzPSx2IZaETbXcQ'

const origem = createClient(ORIGEM_URL, ORIGEM_KEY, { auth: { persistSession: false } })

function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

async function lerTodos(tabela) {
  const registros = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await origem.from(tabela).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`Erro ao ler ${tabela}: ${error.message}`)
    if (!data || data.length === 0) break
    registros.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return registros
}

;(async () => {
  console.log('Lendo dados da origem...')
  const linhas = []

  linhas.push('-- ================================================================')
  linhas.push('-- Dados migrados do frete-dashboard para Ergotex One')
  linhas.push('-- Execute este arquivo no SQL Editor do Supabase:')
  linhas.push('-- https://supabase.com/dashboard/project/wwtdwdzowatzndjufwah/sql/new')
  linhas.push('-- ================================================================')
  linhas.push('')

  // 1. Estados
  console.log('[1/5] Lendo estados...')
  const estados = await lerTodos('estados')
  linhas.push('-- 1. Estados')
  linhas.push('INSERT INTO frete_estados (id, nome, uf) VALUES')
  estados.forEach((r, i) => {
    const virgula = i < estados.length - 1 ? ',' : ';'
    linhas.push(`  (${esc(r.id)}, ${esc(r.nome)}, ${esc(r.uf)})${virgula}`)
  })
  linhas.push(`SELECT setval('frete_estados_id_seq', (SELECT MAX(id) FROM frete_estados));`)
  linhas.push('')

  // 2. Cidades
  console.log('[2/5] Lendo cidades...')
  const cidades = await lerTodos('cidades')
  linhas.push('-- 2. Cidades')
  linhas.push('INSERT INTO frete_cidades (id, nome, estado_id) VALUES')
  cidades.forEach((r, i) => {
    const virgula = i < cidades.length - 1 ? ',' : ';'
    linhas.push(`  (${esc(r.id)}, ${esc(r.nome)}, ${esc(r.estado_id)})${virgula}`)
  })
  linhas.push(`SELECT setval('frete_cidades_id_seq', (SELECT MAX(id) FROM frete_cidades));`)
  linhas.push('')

  // 3. Produtos
  console.log('[3/5] Lendo produtos...')
  const produtos = await lerTodos('produtos')
  linhas.push('-- 3. Produtos')
  linhas.push('INSERT INTO frete_produtos (id, nome, largura, comprimento, altura, peso) VALUES')
  produtos.forEach((r, i) => {
    const virgula = i < produtos.length - 1 ? ',' : ';'
    linhas.push(`  (${esc(r.id)}, ${esc(r.nome)}, ${esc(r.largura)}, ${esc(r.comprimento)}, ${esc(r.altura)}, ${esc(r.peso)})${virgula}`)
  })
  linhas.push(`SELECT setval('frete_produtos_id_seq', (SELECT MAX(id) FROM frete_produtos));`)
  linhas.push('')

  // 4. Transportadoras
  console.log('[4/5] Lendo transportadoras...')
  const transportadoras = await lerTodos('transportadoras')
  linhas.push('-- 4. Transportadoras')
  linhas.push('INSERT INTO frete_transportadoras (id, nome) VALUES')
  transportadoras.forEach((r, i) => {
    const virgula = i < transportadoras.length - 1 ? ',' : ';'
    linhas.push(`  (${esc(r.id)}, ${esc(r.nome)})${virgula}`)
  })
  linhas.push(`SELECT setval('frete_transportadoras_id_seq', (SELECT MAX(id) FROM frete_transportadoras));`)
  linhas.push('')

  // 5. Lançamentos
  console.log('[5/5] Lendo lançamentos...')
  const lancamentos = await lerTodos('lancamentos_frete')
  linhas.push('-- 5. Lançamentos')
  if (lancamentos.length > 0) {
    linhas.push('INSERT INTO frete_lancamentos (id, produto_id, transportadora_id, cidade_id, quantidade, valor_frete, prazo_entrega, data, created_at) VALUES')
    lancamentos.forEach((r, i) => {
      const virgula = i < lancamentos.length - 1 ? ',' : ';'
      const data = esc(r.data ?? r.created_at ?? new Date().toISOString())
      const created = esc(r.created_at ?? r.data ?? new Date().toISOString())
      linhas.push(`  (${esc(r.id)}, ${esc(r.produto_id)}, ${esc(r.transportadora_id)}, ${esc(r.cidade_id)}, ${esc(r.quantidade)}, ${esc(r.valor_frete)}, ${esc(r.prazo_entrega)}, ${data}, ${created})${virgula}`)
    })
    linhas.push(`SELECT setval('frete_lancamentos_id_seq', (SELECT MAX(id) FROM frete_lancamentos));`)
  } else {
    linhas.push('-- Nenhum lançamento encontrado na origem.')
  }

  const saida = 'scripts/migrar-fretes-data.sql'
  writeFileSync(saida, linhas.join('\n'), 'utf-8')

  console.log('')
  console.log('══════════════════════════════════════════════════════')
  console.log(`  Arquivo gerado: ${saida}`)
  console.log(`  Estados: ${estados.length}`)
  console.log(`  Cidades: ${cidades.length}`)
  console.log(`  Produtos: ${produtos.length}`)
  console.log(`  Transportadoras: ${transportadoras.length}`)
  console.log(`  Lançamentos: ${lancamentos.length}`)
  console.log('')
  console.log('  Próximo passo:')
  console.log('  Abra o arquivo gerado e execute no SQL Editor do Supabase:')
  console.log('  https://supabase.com/dashboard/project/wwtdwdzowatzndjufwah/sql/new')
  console.log('══════════════════════════════════════════════════════')
})().catch(e => {
  console.error('Erro:', e.message)
  process.exit(1)
})
