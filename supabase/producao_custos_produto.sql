-- ============================================================================
-- Ergotex CRM · Produção — Custos de produto, mão de obra e margem de lucro
-- Executar no SQL Editor do Supabase (após producao_fichas_estoque.sql)
-- ============================================================================

-- Custo unitário por item da ficha (override; se NULL usa o custo do estoque do insumo)
ALTER TABLE producao_ficha_tecnica
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(12,4);

-- Custo de mão de obra e margem de lucro desejada por produto
ALTER TABLE producao_produtos
  ADD COLUMN IF NOT EXISTS custo_mao_obra   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margem_lucro_pct NUMERIC(6,2)  NOT NULL DEFAULT 0;
