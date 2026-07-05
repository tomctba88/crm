-- ============================================================================
-- Ergotex CRM · Reforma dos Produtos (Etapa 1 — base)
-- O cadastro de produtos passa a ter o formato da planilha do Tiny, DENTRO do
-- módulo Produção (tabela producao_produtos estendida). Ficha técnica e vínculos
-- existentes são preservados (sem migração). Aditivo e idempotente.
-- Executar no SQL Editor do Supabase.
-- ============================================================================

-- 1. Campos do Tiny em producao_produtos (todos nullable/aditivos) ------------
ALTER TABLE producao_produtos
  ADD COLUMN IF NOT EXISTS tiny_id                TEXT,
  ADD COLUMN IF NOT EXISTS sku                    TEXT,
  ADD COLUMN IF NOT EXISTS descricao_complementar TEXT,
  ADD COLUMN IF NOT EXISTS observacoes            TEXT,
  ADD COLUMN IF NOT EXISTS unidade                TEXT,
  ADD COLUMN IF NOT EXISTS ncm                    TEXT,
  ADD COLUMN IF NOT EXISTS origem                 TEXT,
  ADD COLUMN IF NOT EXISTS cest                   TEXT,
  ADD COLUMN IF NOT EXISTS gtin                   TEXT,
  ADD COLUMN IF NOT EXISTS preco                  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS preco_custo            NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS preco_promocional      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS markup                 NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS situacao               TEXT,
  ADD COLUMN IF NOT EXISTS estoque                NUMERIC(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_min            NUMERIC(15,3),
  ADD COLUMN IF NOT EXISTS estoque_max            NUMERIC(15,3),
  ADD COLUMN IF NOT EXISTS fornecedor             TEXT,
  ADD COLUMN IF NOT EXISTS cod_fornecedor         TEXT,
  ADD COLUMN IF NOT EXISTS localizacao            TEXT,
  ADD COLUMN IF NOT EXISTS marca                  TEXT,
  ADD COLUMN IF NOT EXISTS peso_liquido           NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS peso_bruto             NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS formato_embalagem      TEXT,
  ADD COLUMN IF NOT EXISTS largura_emb            NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS altura_emb             NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS comprimento_emb        NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS diametro_emb           NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS unidade_por_caixa      NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS tipo_tiny              TEXT,   -- Tipo do produto (S/V/K) do Tiny
  ADD COLUMN IF NOT EXISTS codigo_pai             TEXT,
  ADD COLUMN IF NOT EXISTS categoria              TEXT,
  ADD COLUMN IF NOT EXISTS sob_encomenda          TEXT,
  ADD COLUMN IF NOT EXISTS permitir_venda         TEXT,
  ADD COLUMN IF NOT EXISTS dias_preparacao        TEXT,
  ADD COLUMN IF NOT EXISTS url_imagem             TEXT,
  ADD COLUMN IF NOT EXISTS raw                    JSONB;

-- tiny_id único (permite reimportar a planilha sem duplicar; ignora nulos)
CREATE UNIQUE INDEX IF NOT EXISTS uq_producao_produtos_tiny ON producao_produtos(tiny_id) WHERE tiny_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_producao_produtos_sku ON producao_produtos(sku);

-- 2. Movimentações de estoque de PRODUTO (entradas e saídas) ------------------
CREATE TABLE IF NOT EXISTS producao_movimentos_produto (
  id          SERIAL PRIMARY KEY,
  produto_id  INTEGER NOT NULL REFERENCES producao_produtos(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  -- 'entrada' | 'saida_venda' | 'saida_producao' | 'entrada_ajuste' | 'saida_ajuste'
  quantidade  NUMERIC(15,3) NOT NULL,   -- sempre positivo; o tipo define entrada/saída
  ordem_id    INTEGER REFERENCES producao_ordens(id),
  pedido_id   INTEGER REFERENCES pedidos(id),
  observacao  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mov_produto_produto ON producao_movimentos_produto(produto_id);
CREATE INDEX IF NOT EXISTS idx_mov_produto_ordem   ON producao_movimentos_produto(ordem_id);

ALTER TABLE producao_movimentos_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mov_produto_autenticados ON producao_movimentos_produto;
CREATE POLICY mov_produto_autenticados ON producao_movimentos_produto
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- Pronto. producao_produtos agora tem o formato do Tiny + estoque.
-- Próximo: importar a planilha nesta tabela e telas de estoque/baixa.
-- ============================================================================
