-- ============================================================================
-- Ergotex CRM · Produção — Indicadores da estofaria de cadeiras
--
-- Cobre os 5 indicadores pedidos:
--   1. Volume de produção  (dia / mês / ano / modelo / cor do revestimento)
--   2. Curva ABC           (modelos por faturamento)
--   3. Controle de perda   (material e peça refugada, com motivo e custo)
--   4. Produtividade       (peças por hora e por dia de cada estofador)
--   5. Tempo de fabricação (da geração da OP até a finalização)
--
-- A peça central é producao_ordem_itens: hoje a OP é "uma coisa só" (campo
-- `produto` em texto livre, sem quantidade). Sem item não existe volume, e sem
-- volume não existe ABC, perda por modelo nem produtividade por peça.
--
-- Tudo é ADITIVO e idempotente. Executar no SQL Editor do Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CADASTRO · Revestimentos (o "cor" dos relatórios)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_revestimentos (
  id           SERIAL PRIMARY KEY,
  codigo       TEXT,                                  -- código do fornecedor
  nome         TEXT NOT NULL,                         -- ex: "Courino Preto Soft"
  material     TEXT NOT NULL DEFAULT 'tecido',        -- tecido | courino | couro | tela | outro
  cor          TEXT NOT NULL,                         -- ex: "Preto"
  fornecedor   TEXT,
  custo_metro  NUMERIC(12,4),
  insumo_id    INTEGER REFERENCES producao_insumos(id) ON DELETE SET NULL,
  -- insumo_id liga o revestimento ao estoque de matéria-prima quando ele
  -- também é controlado como insumo (baixa automática na perda de material)
  ativo        BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revestimentos_codigo
  ON producao_revestimentos(codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_revestimentos_cor ON producao_revestimentos(cor);

-- ---------------------------------------------------------------------------
-- 2. CADASTRO · Funcionários (estofadores)
--    `responsavel` nas ordens é TEXT livre — não dá para medir produtividade
--    por pessoa. Aqui a pessoa vira entidade com jornada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_funcionarios (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  funcao         TEXT NOT NULL DEFAULT 'Estofador',
  email          TEXT,                                -- liga ao login quando apontar no tablet
  jornada_horas  NUMERIC(5,2) NOT NULL DEFAULT 8,     -- jornada padrão diária
  ativo          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionarios_email
  ON producao_funcionarios(email) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. CADASTRO · Motivos de perda
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_motivos_perda (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  categoria  TEXT NOT NULL DEFAULT 'processo',
  -- categoria: material | processo | maquina | fornecedor | projeto
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO producao_motivos_perda (nome, categoria) VALUES
  ('Corte errado do revestimento',        'processo'),
  ('Costura fora do padrão',              'processo'),
  ('Medida errada no projeto',            'projeto'),
  ('Espuma com defeito',                  'material'),
  ('Estrutura empenada',                  'material'),
  ('Mancha ou sujeira no revestimento',   'processo'),
  ('Material com defeito do fornecedor',  'fornecedor'),
  ('Reprovado no controle de qualidade',  'processo'),
  ('Sobra de corte (retalho)',            'material')
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. ITENS DA ORDEM DE PRODUÇÃO  ← base de todos os indicadores
--    Uma OP passa a produzir N itens: modelo + revestimento + quantidade.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_ordem_itens (
  id              SERIAL PRIMARY KEY,
  ordem_id        INTEGER NOT NULL REFERENCES producao_ordens(id) ON DELETE CASCADE,
  pedido_item_id  INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL,

  produto_id      INTEGER REFERENCES producao_produtos(id),   -- o MODELO
  descricao       TEXT,                                       -- snapshot do nome (histórico)
  revestimento_id INTEGER REFERENCES producao_revestimentos(id),

  qtd_planejada   NUMERIC(12,3) NOT NULL DEFAULT 1,
  qtd_produzida   NUMERIC(12,3) NOT NULL DEFAULT 0,
  qtd_perdida     NUMERIC(12,3) NOT NULL DEFAULT 0,

  -- snapshots de valor: a Curva ABC por faturamento vira uma consulta só,
  -- e o ranking histórico não muda quando a tabela de preços é reajustada
  valor_unitario  NUMERIC(15,2) NOT NULL DEFAULT 0,
  custo_unitario  NUMERIC(15,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordem_itens_ordem   ON producao_ordem_itens(ordem_id);
CREATE INDEX IF NOT EXISTS idx_ordem_itens_produto ON producao_ordem_itens(produto_id);
CREATE INDEX IF NOT EXISTS idx_ordem_itens_revest  ON producao_ordem_itens(revestimento_id);
-- Evita duplicar o item ao regerar a OP a partir do pedido.
-- Precisa ser CONSTRAINT, não índice parcial: ON CONFLICT não infere índice com
-- WHERE (erro 42P10). E constraint única já aceita N nulos — em Postgres um NULL
-- nunca conflita com outro —, então itens sem pedido seguem livres.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ordem_itens_pedido_item') THEN
    DROP INDEX IF EXISTS uq_ordem_itens_pedido_item;
    ALTER TABLE producao_ordem_itens
      ADD CONSTRAINT uq_ordem_itens_pedido_item UNIQUE (pedido_item_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. APONTAMENTOS DE PRODUÇÃO (produtividade)
--    Uma tabela só atende as duas formas de apontar:
--      origem='lancamento' → encarregado lança no fim do dia (informa horas)
--      origem='cronometro' → estofador toca Iniciar/Finalizar no tablet
--    O cálculo de horas usa `horas` quando informado, senão fim - inicio.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_apontamentos (
  id             SERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES producao_funcionarios(id) ON DELETE RESTRICT,
  ordem_id       INTEGER REFERENCES producao_ordens(id) ON DELETE SET NULL,
  ordem_item_id  INTEGER REFERENCES producao_ordem_itens(id) ON DELETE SET NULL,
  etapa_id       INTEGER REFERENCES producao_etapas(id) ON DELETE SET NULL,

  data_ref       DATE NOT NULL DEFAULT CURRENT_DATE,   -- dia de produção (sempre preenchido)
  inicio         TIMESTAMPTZ,                          -- só no modo cronômetro
  fim            TIMESTAMPTZ,
  horas          NUMERIC(6,2),                         -- só no modo lançamento diário
  pecas          NUMERIC(12,3) NOT NULL DEFAULT 0,

  origem         TEXT NOT NULL DEFAULT 'lancamento',   -- lancamento | cronometro
  observacao     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_apont_funcionario ON producao_apontamentos(funcionario_id, data_ref);
CREATE INDEX IF NOT EXISTS idx_apont_data        ON producao_apontamentos(data_ref);
CREATE INDEX IF NOT EXISTS idx_apont_ordem       ON producao_apontamentos(ordem_id);
-- um cronômetro aberto por vez por funcionário
CREATE UNIQUE INDEX IF NOT EXISTS uq_apont_cronometro_aberto
  ON producao_apontamentos(funcionario_id) WHERE fim IS NULL AND inicio IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. PERDAS
--    tipo='insumo' → material estragado (m² de tecido, espuma...)
--    tipo='peca'   → cadeira acabada refugada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_perdas (
  id              SERIAL PRIMARY KEY,
  data_ref        DATE NOT NULL DEFAULT CURRENT_DATE,
  ordem_id        INTEGER REFERENCES producao_ordens(id) ON DELETE SET NULL,
  ordem_item_id   INTEGER REFERENCES producao_ordem_itens(id) ON DELETE SET NULL,
  etapa_id        INTEGER REFERENCES producao_etapas(id) ON DELETE SET NULL,
  funcionario_id  INTEGER REFERENCES producao_funcionarios(id) ON DELETE SET NULL,
  motivo_id       INTEGER REFERENCES producao_motivos_perda(id),

  tipo            TEXT NOT NULL DEFAULT 'insumo',      -- insumo | peca
  insumo_id       INTEGER REFERENCES producao_insumos(id) ON DELETE SET NULL,
  revestimento_id INTEGER REFERENCES producao_revestimentos(id) ON DELETE SET NULL,

  quantidade      NUMERIC(12,4) NOT NULL,
  unidade         TEXT,
  custo_estimado  NUMERIC(15,2) NOT NULL DEFAULT 0,
  recuperavel     BOOLEAN NOT NULL DEFAULT false,      -- retrabalho (true) x sucata (false)

  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_perdas_data   ON producao_perdas(data_ref);
CREATE INDEX IF NOT EXISTS idx_perdas_ordem  ON producao_perdas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_perdas_motivo ON producao_perdas(motivo_id);

-- ---------------------------------------------------------------------------
-- 7. TEMPO DE FABRICAÇÃO — carimbos com hora
--    data_inicio/data_conclusao são DATE: a resolução para em "dias" e não
--    dá para medir peças por hora nem separar fila de execução.
-- ---------------------------------------------------------------------------
ALTER TABLE producao_ordens
  ADD COLUMN IF NOT EXISTS iniciada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMPTZ;

ALTER TABLE producao_etapas
  ADD COLUMN IF NOT EXISTS iniciada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 8. BACKFILL — histórico existente entra nos relatórios
--    Datas antigas viram meio-dia de Brasília: sem hora real, meio-dia é o
--    chute que menos distorce uma média de lead time.
-- ---------------------------------------------------------------------------
UPDATE producao_etapas
   SET iniciada_em = (data_inicio + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo'
 WHERE iniciada_em IS NULL AND data_inicio IS NOT NULL;

UPDATE producao_etapas
   SET concluida_em = (data_conclusao + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo'
 WHERE concluida_em IS NULL AND data_conclusao IS NOT NULL;

-- início da OP = primeira etapa que começou
UPDATE producao_ordens o
   SET iniciada_em = sub.primeiro
  FROM (
    SELECT ordem_id, MIN(iniciada_em) AS primeiro
      FROM producao_etapas
     WHERE iniciada_em IS NOT NULL
     GROUP BY ordem_id
  ) sub
 WHERE sub.ordem_id = o.id AND o.iniciada_em IS NULL;

UPDATE producao_ordens
   SET concluida_em = (data_conclusao + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo'
 WHERE concluida_em IS NULL AND data_conclusao IS NOT NULL;

-- OPs concluídas sem data registrada: usa o updated_at (última mexida)
UPDATE producao_ordens
   SET concluida_em = updated_at
 WHERE concluida_em IS NULL AND status = 'CONCLUIDO';

-- 8b. Itens a partir dos pedidos já existentes
INSERT INTO producao_ordem_itens
  (ordem_id, pedido_item_id, produto_id, descricao, qtd_planejada, qtd_produzida, valor_unitario, custo_unitario)
SELECT o.id,
       pi.id,
       pi.produto_id,
       COALESCE(pi.descricao, pr.nome, o.produto),
       pi.quantidade,
       CASE WHEN o.status = 'CONCLUIDO' THEN pi.quantidade ELSE 0 END,
       pi.valor_unitario,
       COALESCE(pr.preco_custo, 0)
  FROM producao_ordens o
  JOIN pedido_itens pi ON pi.pedido_id = o.pedido_id
  LEFT JOIN producao_produtos pr ON pr.id = pi.produto_id
 WHERE o.pedido_id IS NOT NULL
ON CONFLICT (pedido_item_id) DO NOTHING;

-- 8c. OPs sem pedido: 1 item com o texto livre que já existia na ordem
INSERT INTO producao_ordem_itens
  (ordem_id, produto_id, descricao, qtd_planejada, qtd_produzida, valor_unitario, custo_unitario)
SELECT o.id,
       o.produto_id,
       COALESCE(pr.nome, o.produto, 'Sem descrição'),
       1,
       CASE WHEN o.status = 'CONCLUIDO' THEN 1 ELSE 0 END,
       COALESCE(pr.preco, 0),
       COALESCE(pr.preco_custo, 0)
  FROM producao_ordens o
  LEFT JOIN producao_produtos pr ON pr.id = o.produto_id
 WHERE NOT EXISTS (SELECT 1 FROM producao_ordem_itens i WHERE i.ordem_id = o.id);

-- ---------------------------------------------------------------------------
-- 9. RLS — mesmo padrão de producao_movimentos_produto
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'producao_revestimentos',
    'producao_funcionarios',
    'producao_motivos_perda',
    'producao_ordem_itens',
    'producao_apontamentos',
    'producao_perdas'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_autenticados', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t || '_autenticados', t
    );
  END LOOP;
END $$;

-- ============================================================================
-- Pronto. Os 5 indicadores saem de producao_ordem_itens + apontamentos + perdas.
-- ============================================================================
