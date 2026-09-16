-- ============================================================================
-- Ergotex CRM · Produção — Marcenaria (fabricação de móveis)
--
-- Reaproveita toda a espinha da estofaria: OP, itens, etapas, apontamentos,
-- perdas e os relatórios de Volume, Curva ABC e Tempo de fabricação.
--
-- O que marcenaria tem e estofaria não tem:
--   1. A PEÇA. Uma cadeira é uma coisa que passa pelas etapas; um móvel são N
--      painéis cortados que passam em lotes e em momentos diferentes. É um
--      nível abaixo do item da OP — a mudança estrutural de verdade.
--   2. APROVEITAMENTO DE CHAPA. Aqui a maior "perda" é sobra de nesting, que é
--      inerente e não erro. Motivo+custo não mede isso; o que mede é
--      m² que viraram peça ÷ m² de chapa consumida.
--   3. MÁQUINA COMO RECURSO. CNC rende chapas/hora e coladeira metros/hora.
--      Só acabamento e montagem são peças/pessoa.
--   4. FITA DE BORDA em metro linear, dependendo de QUAIS das 4 bordas levam
--      fita (códigos do Promob: TL, 1+, 2+, SF).
--
-- Aditivo e idempotente. Rodar depois de 20240009. Executar no SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CADASTRO · Chapas (o "revestimento" da marcenaria)
--    Tem espessura e área — por isso não cabe em producao_revestimentos, que
--    custa por metro linear.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_chapas (
  id              SERIAL PRIMARY KEY,
  codigo          TEXT,
  nome            TEXT NOT NULL,                       -- ex: "Branco TX 18mm"
  material        TEXT NOT NULL DEFAULT 'MDF',         -- MDF | MDP | compensado | outro
  cor_padrao      TEXT NOT NULL,                       -- ex: "Branco TX"
  espessura_mm    NUMERIC(6,2) NOT NULL DEFAULT 18,
  comprimento_mm  NUMERIC(8,1) NOT NULL DEFAULT 2750,  -- chapa padrão do mercado
  largura_mm      NUMERIC(8,1) NOT NULL DEFAULT 1850,
  custo_chapa     NUMERIC(15,2),                       -- preço da chapa inteira
  fornecedor      TEXT,
  insumo_id       INTEGER REFERENCES producao_insumos(id) ON DELETE SET NULL,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chapas_codigo
  ON producao_chapas(codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chapas_cor ON producao_chapas(cor_padrao);

-- ---------------------------------------------------------------------------
-- 2. CADASTRO · Fitas de borda (consumo em METRO LINEAR)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_fitas (
  id            SERIAL PRIMARY KEY,
  codigo        TEXT,
  nome          TEXT NOT NULL,
  cor_padrao    TEXT NOT NULL,
  largura_mm    NUMERIC(6,2) NOT NULL DEFAULT 22,
  espessura_mm  NUMERIC(6,2) NOT NULL DEFAULT 0.45,
  custo_metro   NUMERIC(12,4),
  rolo_metros   NUMERIC(10,2),
  chapa_id      INTEGER REFERENCES producao_chapas(id) ON DELETE SET NULL,
  -- chapa_id = a chapa que essa fita combina; só para pré-selecionar na tela
  fornecedor    TEXT,
  insumo_id     INTEGER REFERENCES producao_insumos(id) ON DELETE SET NULL,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fitas_codigo
  ON producao_fitas(codigo) WHERE codigo IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. CADASTRO · Máquinas
--    capacidade_hora + unidade descrevem o rendimento esperado, para comparar
--    com o realizado nos apontamentos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_maquinas (
  id                  SERIAL PRIMARY KEY,
  nome                TEXT NOT NULL,
  tipo                TEXT NOT NULL DEFAULT 'cnc',
  -- tipo: cnc | coladeira | seccionadora | furadeira | lixadeira | outro
  capacidade_hora     NUMERIC(12,3),
  unidade_capacidade  TEXT NOT NULL DEFAULT 'chapas',   -- chapas | metros | pecas
  custo_hora          NUMERIC(12,2),
  ativo               BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. PEÇAS  ← o nível que estofaria não tem
--    Cada linha é um painel cortado. A fitagem é modelada POR BORDA (4 bandeiras
--    booleanas), não só pelo código: o código do Promob (TL/1+/2+/SF) preenche
--    as bandeiras, mas casos fora do padrão continuam representáveis.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_pecas (
  id              SERIAL PRIMARY KEY,
  ordem_id        INTEGER NOT NULL REFERENCES producao_ordens(id) ON DELETE CASCADE,
  ordem_item_id   INTEGER REFERENCES producao_ordem_itens(id) ON DELETE SET NULL,

  codigo          TEXT,                                 -- ex: LAT0001579 (Promob)
  nome            TEXT NOT NULL,                        -- ex: "Lateral Esquerda"
  modulo          TEXT,                                 -- módulo do móvel

  chapa_id        INTEGER REFERENCES producao_chapas(id) ON DELETE SET NULL,
  comprimento_mm  NUMERIC(8,1) NOT NULL,
  largura_mm      NUMERIC(8,1) NOT NULL,
  espessura_mm    NUMERIC(6,2),
  quantidade      NUMERIC(10,2) NOT NULL DEFAULT 1,

  -- fitagem: c1/c2 = bordas de comprimento (as 2 maiores)
  --          l1/l2 = bordas de largura (as 2 menores)
  fita_id         INTEGER REFERENCES producao_fitas(id) ON DELETE SET NULL,
  fita_c1         BOOLEAN NOT NULL DEFAULT false,
  fita_c2         BOOLEAN NOT NULL DEFAULT false,
  fita_l1         BOOLEAN NOT NULL DEFAULT false,
  fita_l2         BOOLEAN NOT NULL DEFAULT false,
  codigo_fita     TEXT,                                 -- TL | 1+ | 2+ | SF (origem)

  furos           INTEGER NOT NULL DEFAULT 0,
  furacao         JSONB,                                -- detalhe do DXF (2ª rodada)
  posicao_chapa   TEXT,                                 -- "1.A" da etiqueta do Promob

  status          TEXT NOT NULL DEFAULT 'PENDENTE',
  -- PENDENTE | CORTADA | FITADA | ACABADA | MONTADA | REFUGADA
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pecas_ordem  ON producao_pecas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_pecas_item   ON producao_pecas(ordem_item_id);
CREATE INDEX IF NOT EXISTS idx_pecas_chapa  ON producao_pecas(chapa_id);
CREATE INDEX IF NOT EXISTS idx_pecas_status ON producao_pecas(status);

-- ---------------------------------------------------------------------------
-- 5. CHAPAS CONSUMIDAS POR ORDEM  ← denominador do aproveitamento
--    Sem isto só dá para saber quanta chapa virou peça, não quanta foi gasta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producao_chapas_consumidas (
  id           SERIAL PRIMARY KEY,
  ordem_id     INTEGER NOT NULL REFERENCES producao_ordens(id) ON DELETE CASCADE,
  chapa_id     INTEGER NOT NULL REFERENCES producao_chapas(id) ON DELETE RESTRICT,
  quantidade   NUMERIC(10,2) NOT NULL DEFAULT 1,        -- nº de chapas inteiras
  custo_total  NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_ref     DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_chapas_cons_ordem ON producao_chapas_consumidas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_chapas_cons_data  ON producao_chapas_consumidas(data_ref);

-- ---------------------------------------------------------------------------
-- 6. APONTAMENTO GANHA MÁQUINA
--    CNC e coladeira apontam por máquina; acabamento e montagem por pessoa.
--    funcionario_id deixa de ser obrigatório, mas um dos dois tem que existir.
-- ---------------------------------------------------------------------------
ALTER TABLE producao_apontamentos
  ADD COLUMN IF NOT EXISTS maquina_id INTEGER REFERENCES producao_maquinas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metros     NUMERIC(12,3) NOT NULL DEFAULT 0,  -- coladeira
  ADD COLUMN IF NOT EXISTS chapas     NUMERIC(12,3) NOT NULL DEFAULT 0;  -- CNC

ALTER TABLE producao_apontamentos ALTER COLUMN funcionario_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_apont_recurso') THEN
    ALTER TABLE producao_apontamentos
      ADD CONSTRAINT ck_apont_recurso
      CHECK (funcionario_id IS NOT NULL OR maquina_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apont_maquina ON producao_apontamentos(maquina_id, data_ref);

-- O índice de "um cronômetro aberto por vez" era só por funcionário. Agora a
-- máquina também precisa do seu, senão duas OPs abrem cronômetro na mesma CNC.
CREATE UNIQUE INDEX IF NOT EXISTS uq_apont_cronometro_maquina
  ON producao_apontamentos(maquina_id) WHERE fim IS NULL AND inicio IS NOT NULL AND maquina_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. PERDAS GANHAM CHAPA E FITA
-- ---------------------------------------------------------------------------
ALTER TABLE producao_perdas
  ADD COLUMN IF NOT EXISTS chapa_id INTEGER REFERENCES producao_chapas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fita_id  INTEGER REFERENCES producao_fitas(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS peca_id  INTEGER REFERENCES producao_pecas(id)  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 8. TIPO DE PRODUTO E PROCESSOS DA MARCENARIA
-- ---------------------------------------------------------------------------
INSERT INTO producao_tipos_produto (nome) VALUES ('Móvel / Marcenaria')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO producao_processos (tipo_produto_id, nome, sequencia)
SELECT t.id, p.nome, p.seq
  FROM producao_tipos_produto t,
       (VALUES
         ('Corte CNC',            1),
         ('Coladeira de bordas',  2),
         ('Acabamento',           3),
         ('Montagem',             4),
         ('Conferência',          5),
         ('Embalagem',            6)
       ) AS p(nome, seq)
 WHERE t.nome = 'Móvel / Marcenaria'
   AND NOT EXISTS (
     SELECT 1 FROM producao_processos pp
      WHERE pp.tipo_produto_id = t.id AND pp.nome = p.nome
   );

-- Motivos de perda típicos de marcenaria
INSERT INTO producao_motivos_perda (nome, categoria) VALUES
  ('Erro de nesting / plano de corte',     'processo'),
  ('Chapa lascada no corte',               'processo'),
  ('Fita descolando',                      'processo'),
  ('Furação fora de posição',              'maquina'),
  ('Chapa empenada',                       'fornecedor'),
  ('Medida errada no projeto (Promob)',    'projeto'),
  ('Risco ou avaria no manuseio',          'processo')
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. RLS — mesmo padrão das demais tabelas de produção
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'producao_chapas',
    'producao_fitas',
    'producao_maquinas',
    'producao_pecas',
    'producao_chapas_consumidas'
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
-- Pronto. Marcenaria usa a mesma OP da estofaria, com peças, chapas, fitas e
-- máquinas por baixo. Import da pasta PROGRAMAÇÃO do Promob fica para a 2ª rodada
-- (producao_pecas.furacao e .posicao_chapa já esperam por ele).
-- ============================================================================
