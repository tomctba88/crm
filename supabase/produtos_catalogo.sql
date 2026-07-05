-- ============================================================================
-- Ergotex CRM · Catálogo de Produtos (importado do Tiny)
-- Executar no SQL Editor do Supabase. Aditivo — tabela nova.
-- Guarda os campos úteis em colunas dedicadas + a linha original inteira em raw (JSONB),
-- para não perder NENHUMA informação da planilha. Upsert por tiny_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS produtos_catalogo (
  id                     SERIAL PRIMARY KEY,
  tiny_id                TEXT UNIQUE,            -- coluna "ID" do Tiny
  sku                    TEXT,                   -- Código (SKU)
  descricao              TEXT,
  descricao_complementar TEXT,
  observacoes            TEXT,
  unidade                TEXT,
  ncm                    TEXT,                   -- Classificação fiscal
  origem                 TEXT,
  cest                   TEXT,
  gtin                   TEXT,                   -- GTIN/EAN

  preco                  NUMERIC(15,2),
  preco_custo            NUMERIC(15,2),
  preco_promocional      NUMERIC(15,2),
  markup                 NUMERIC(15,4),

  situacao               TEXT,                   -- Ativo/Inativo
  estoque                NUMERIC(15,3),
  estoque_min            NUMERIC(15,3),
  estoque_max            NUMERIC(15,3),

  fornecedor             TEXT,
  cod_fornecedor         TEXT,
  localizacao            TEXT,
  marca                  TEXT,

  peso_liquido           NUMERIC(12,4),
  peso_bruto             NUMERIC(12,4),
  formato_embalagem      TEXT,
  largura_emb            NUMERIC(12,3),
  altura_emb             NUMERIC(12,3),
  comprimento_emb        NUMERIC(12,3),
  diametro_emb           NUMERIC(12,3),
  unidade_por_caixa      NUMERIC(12,3),

  tipo_produto           TEXT,                   -- S=Simples, V=Variação, K=Kit...
  codigo_pai             TEXT,                   -- p/ variações
  categoria              TEXT,
  sob_encomenda          TEXT,
  permitir_venda         TEXT,                   -- "Permitir inclusão nas vendas"
  dias_preparacao        TEXT,
  url_imagem             TEXT,                   -- URL imagem 1

  raw                    JSONB,                  -- linha original completa (todas as 65 colunas)
  importado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_sku       ON produtos_catalogo(sku);
CREATE INDEX IF NOT EXISTS idx_catalogo_categoria ON produtos_catalogo(categoria);
CREATE INDEX IF NOT EXISTS idx_catalogo_situacao  ON produtos_catalogo(situacao);

-- RLS (mesmo padrão dos demais: autenticado lê/escreve)
ALTER TABLE produtos_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produtos_catalogo_autenticados ON produtos_catalogo;
CREATE POLICY produtos_catalogo_autenticados ON produtos_catalogo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vendas: o item do pedido pode referenciar um produto do catálogo do Tiny
ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS catalogo_id INTEGER REFERENCES produtos_catalogo(id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_catalogo ON pedido_itens(catalogo_id);

-- ============================================================================
-- LIGAÇÃO COM A PRODUÇÃO
-- Um produto fabricado (ficha técnica em producao_produtos) referencia o seu
-- item no catálogo base. Assim o catálogo (o que se vende) conversa com a
-- Produção (como se fabrica) — e, via pedido, com todo o sistema.
-- ============================================================================
ALTER TABLE producao_produtos ADD COLUMN IF NOT EXISTS catalogo_id INTEGER REFERENCES produtos_catalogo(id);
CREATE INDEX IF NOT EXISTS idx_producao_produtos_catalogo ON producao_produtos(catalogo_id);

-- Auto-vínculo por SKU. Idempotente: rode/re-rode DEPOIS de importar o catálogo.
UPDATE producao_produtos p
SET catalogo_id = c.id
FROM produtos_catalogo c
WHERE p.sku IS NOT NULL AND c.sku = p.sku AND p.catalogo_id IS NULL;

-- Menu: adiciona "Catálogo" na navegação (data-driven)
INSERT INTO modulos (nome, slug, url, icone, ordem, ativo)
SELECT 'Catálogo', 'catalogo', '/catalogo', 'box',
       COALESCE((SELECT MAX(ordem) FROM modulos), 0) + 1, true
WHERE NOT EXISTS (SELECT 1 FROM modulos WHERE slug = 'catalogo');

-- ============================================================================
-- Pronto. Rode o import na tela /catalogo (upload dos .xls do Tiny).
-- ============================================================================
