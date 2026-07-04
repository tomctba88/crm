-- ============================================================================
-- Ergotex CRM · Produção — Código SKU para insumos e produtos fabricados
-- Executar no SQL Editor do Supabase (após os scripts anteriores)
-- ============================================================================

ALTER TABLE producao_insumos  ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE producao_produtos ADD COLUMN IF NOT EXISTS sku TEXT;

-- SKU único por tabela (ignora nulos)
CREATE UNIQUE INDEX IF NOT EXISTS uq_insumos_sku  ON producao_insumos(sku)  WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_sku ON producao_produtos(sku) WHERE sku IS NOT NULL;
