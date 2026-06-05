-- SKU no cadastro de produtos de frete, para casar com os itens do Shopify
-- na cotação de frete em tempo real (Carrier Service API).
ALTER TABLE frete_produtos
  ADD COLUMN IF NOT EXISTS sku text;

CREATE INDEX IF NOT EXISTS idx_frete_produtos_sku ON frete_produtos(sku);
