-- ============================================================================
-- Ergotex CRM · Módulo Produção — Produtos, Fichas Técnicas e Estoque de Insumos
-- Executar no SQL Editor do Supabase
-- ============================================================================

-- 1. Insumos (matérias-primas)
CREATE TABLE IF NOT EXISTS producao_insumos (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  unidade     TEXT NOT NULL DEFAULT 'un',
  -- unidade: 'un' | 'm' | 'm²' | 'kg' | 'l' | 'cm' | 'par'
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Estoque atual de cada insumo
CREATE TABLE IF NOT EXISTS producao_estoque_insumos (
  id                  SERIAL PRIMARY KEY,
  insumo_id           INTEGER NOT NULL REFERENCES producao_insumos(id) ON DELETE CASCADE,
  quantidade_atual    NUMERIC(12,4) NOT NULL DEFAULT 0,
  ponto_reposicao     NUMERIC(12,4) NOT NULL DEFAULT 0,
  -- quando saldo < ponto_reposicao, aparece alerta
  custo_unitario      NUMERIC(12,4),
  -- custo médio por unidade (para futura análise de custo de produção)
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (insumo_id)
);

-- 3. Produtos fabricados (com dimensões padrão)
CREATE TABLE IF NOT EXISTS producao_produtos (
  id                    SERIAL PRIMARY KEY,
  nome                  TEXT NOT NULL,
  descricao             TEXT,
  tipo_produto_id       INTEGER REFERENCES producao_tipos_produto(id),
  -- dimensões padrão (null = produto sem dimensão variável)
  comprimento_padrao    NUMERIC(10,4),  -- em metros
  largura_padrao        NUMERIC(10,4),  -- em metros
  altura_padrao         NUMERIC(10,4),  -- em metros (informativo, não afeta cálculo por ora)
  tem_dimensao_variavel BOOLEAN NOT NULL DEFAULT false,
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Ficha técnica: insumos do produto com quantidade por unidade
CREATE TABLE IF NOT EXISTS producao_ficha_tecnica (
  id                SERIAL PRIMARY KEY,
  produto_id        INTEGER NOT NULL REFERENCES producao_produtos(id) ON DELETE CASCADE,
  insumo_id         INTEGER NOT NULL REFERENCES producao_insumos(id) ON DELETE RESTRICT,
  quantidade_padrao NUMERIC(12,4) NOT NULL,
  -- quantidade para as dimensões padrão do produto
  dimensao_afetada  TEXT NOT NULL DEFAULT 'fixo',
  -- 'comprimento' | 'largura' | 'area' | 'fixo'
  observacao        TEXT,
  UNIQUE (produto_id, insumo_id)
);

-- 5. Movimentos de estoque (log de entradas e saídas)
CREATE TABLE IF NOT EXISTS producao_movimentos_estoque (
  id          SERIAL PRIMARY KEY,
  insumo_id   INTEGER NOT NULL REFERENCES producao_insumos(id) ON DELETE RESTRICT,
  tipo        TEXT NOT NULL,
  -- 'entrada' | 'saida_producao' | 'saida_ajuste' | 'entrada_ajuste'
  quantidade  NUMERIC(12,4) NOT NULL,
  -- sempre positivo; tipo define se é entrada ou saída
  ordem_id    INTEGER REFERENCES producao_ordens(id),
  -- preenchido quando saída é por produção
  observacao  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  TEXT
  -- email do usuário que fez o movimento
);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_insumo ON producao_movimentos_estoque(insumo_id);
CREATE INDEX IF NOT EXISTS idx_mov_estoque_ordem  ON producao_movimentos_estoque(ordem_id);
CREATE INDEX IF NOT EXISTS idx_ficha_produto       ON producao_ficha_tecnica(produto_id);

-- 6. Adicionar colunas na tabela de ordens para guardar dimensões do pedido
ALTER TABLE producao_ordens
  ADD COLUMN IF NOT EXISTS produto_id           INTEGER REFERENCES producao_produtos(id),
  ADD COLUMN IF NOT EXISTS comprimento_pedido   NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS largura_pedido       NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS altura_pedido        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS materiais_calculados JSONB;
-- materiais_calculados: snapshot dos insumos com quantidades no momento da baixa
-- formato: [{ insumo_id, nome, unidade, quantidade_calculada }]
