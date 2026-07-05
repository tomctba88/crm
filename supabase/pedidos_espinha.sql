-- ============================================================================
-- Ergotex CRM · Espinha "Pedido" — hub que liga CRM → Vendas → Produção → Frete → Financeiro
-- Fase 1. Executar no SQL Editor do Supabase.
-- Tudo é ADITIVO e nullable: não altera nem quebra o que já existe.
-- ============================================================================

-- 1. PEDIDOS (o hub central) -------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  numero          TEXT UNIQUE,                 -- ex: PED-2026-0001 (gerado no app)
  cliente_id      INTEGER REFERENCES clientes(id),
  lead_id         INTEGER REFERENCES leads(id),        -- origem no CRM
  pos_venda_id    INTEGER REFERENCES pos_vendas(id),   -- vínculo com pós-venda existente
  vendedor        TEXT,

  status_global   TEXT NOT NULL DEFAULT 'RASCUNHO',
  -- RASCUNHO | VENDIDO | EM_PRODUCAO | PRONTO | EM_ENTREGA | ENTREGUE | CANCELADO

  -- dados de entrega (o módulo de Fretes usa uf/cidade para calcular)
  uf              TEXT,
  cidade          TEXT,
  prazo_entrega   DATE,

  -- valores (preenchidos em Vendas)
  valor_produtos  NUMERIC(15,2) NOT NULL DEFAULT 0,   -- soma dos itens
  valor_frete     NUMERIC(15,2) NOT NULL DEFAULT 0,   -- vem do módulo de Fretes
  valor_desconto  NUMERIC(15,2) NOT NULL DEFAULT 0,   -- desconto total do pedido
  valor_total     NUMERIC(15,2) NOT NULL DEFAULT 0,   -- produtos - desconto + frete

  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente   ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_lead      ON pedidos(lead_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_pos_venda ON pedidos(pos_venda_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status    ON pedidos(status_global);

-- 2. ITENS DO PEDIDO (montados pelo vendedor em Vendas) ----------------------
CREATE TABLE IF NOT EXISTS pedido_itens (
  id              SERIAL PRIMARY KEY,
  pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id      INTEGER REFERENCES producao_produtos(id),  -- produto cadastrado na Produção
  descricao       TEXT,                        -- snapshot do nome (histórico)
  quantidade      NUMERIC(12,4) NOT NULL DEFAULT 1,

  valor_tabela    NUMERIC(15,2) NOT NULL DEFAULT 0,  -- preço puxado da ficha técnica
  valor_unitario  NUMERIC(15,2) NOT NULL DEFAULT 0,  -- preço negociado (após desconto)
  desconto_pct    NUMERIC(6,2)  NOT NULL DEFAULT 0,  -- % de desconto aplicado no item
  subtotal        NUMERIC(15,2) NOT NULL DEFAULT 0,  -- valor_unitario * quantidade

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido  ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_produto ON pedido_itens(produto_id);

-- 3. LIGAR OS MÓDULOS EXISTENTES AO PEDIDO (nullable = não quebra nada) -------
ALTER TABLE producao_ordens ADD COLUMN IF NOT EXISTS pedido_id INTEGER REFERENCES pedidos(id);
ALTER TABLE pos_vendas      ADD COLUMN IF NOT EXISTS pedido_id INTEGER REFERENCES pedidos(id);

CREATE INDEX IF NOT EXISTS idx_prod_ordens_pedido ON producao_ordens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pos_vendas_pedido  ON pos_vendas(pedido_id);

-- 4. RLS (mesmo padrão de clientes: qualquer autenticado lê/escreve) ---------
ALTER TABLE pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedidos_autenticados ON pedidos;
CREATE POLICY pedidos_autenticados ON pedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pedido_itens_autenticados ON pedido_itens;
CREATE POLICY pedido_itens_autenticados ON pedido_itens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. BACKFILL — cria 1 pedido para cada pós-venda existente (histórico)
--    Rode apenas UMA vez. Reexecuções não duplicam (checa pos_venda_id).
-- ============================================================================
INSERT INTO pedidos (numero, lead_id, pos_venda_id, vendedor, status_global,
                     prazo_entrega, valor_produtos, valor_total, created_at)
SELECT
  'PED-' || to_char(COALESCE(pv.data_inicio, NOW())::date, 'YYYY') || '-' || lpad(pv.id::text, 4, '0'),
  pv.lead_id,
  pv.id,
  pv.vendedor,
  CASE
    WHEN pv.data_entrega IS NOT NULL THEN 'ENTREGUE'
    ELSE 'EM_PRODUCAO'
  END,
  pv.data_prevista_entrega,
  COALESCE(pv.valor_orcamento, 0),
  COALESCE(pv.valor_orcamento, 0),
  COALESCE(pv.data_inicio, NOW())
FROM pos_vendas pv
WHERE NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.pos_venda_id = pv.id);

-- 5.1 amarra a pós-venda ao pedido recém-criado
UPDATE pos_vendas pv
SET pedido_id = p.id
FROM pedidos p
WHERE p.pos_venda_id = pv.id AND pv.pedido_id IS NULL;

-- 5.2 amarra as ordens de produção ao pedido (via pos_venda_id que a OP já tem)
UPDATE producao_ordens o
SET pedido_id = p.id
FROM pedidos p
WHERE p.pos_venda_id = o.pos_venda_id AND o.pedido_id IS NULL;

-- ============================================================================
-- 6. MENU — adiciona o módulo "Pedidos" na navegação (tabela modulos)
--    Data-driven: não altera código. Admin já enxerga; para não-admins,
--    conceda em usuarios_modulos como nos demais módulos.
-- ============================================================================
INSERT INTO modulos (nome, slug, url, icone, ordem, ativo)
SELECT 'Pedidos', 'pedidos', '/pedidos', 'clipboard',
       COALESCE((SELECT MAX(ordem) FROM modulos), 0) + 1, true
WHERE NOT EXISTS (SELECT 1 FROM modulos WHERE slug = 'pedidos');

-- ============================================================================
-- Pronto. Nada acima remove ou altera colunas existentes.
-- Próximo passo (após revisão): telas de Vendas e Ficha do Pedido.
-- ============================================================================
