-- ================================================================
-- SCHEMA: Módulo de Fretes — Ergotex One
-- Execute este arquivo inteiro no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/wwtdwdzowatzndjufwah/sql
-- ================================================================

-- 1. Estados
CREATE TABLE IF NOT EXISTS frete_estados (
  id   serial  PRIMARY KEY,
  nome text    NOT NULL,
  uf   char(2) NOT NULL
);

-- 2. Cidades
CREATE TABLE IF NOT EXISTS frete_cidades (
  id        serial  PRIMARY KEY,
  nome      text    NOT NULL,
  estado_id integer REFERENCES frete_estados(id)
);

-- 3. Produtos
CREATE TABLE IF NOT EXISTS frete_produtos (
  id          serial  PRIMARY KEY,
  nome        text    NOT NULL,
  largura     numeric,
  comprimento numeric,
  altura      numeric,
  peso        numeric
);

-- 4. Transportadoras
CREATE TABLE IF NOT EXISTS frete_transportadoras (
  id   serial PRIMARY KEY,
  nome text   NOT NULL
);

-- 5. Lançamentos de frete
CREATE TABLE IF NOT EXISTS frete_lancamentos (
  id                serial      PRIMARY KEY,
  produto_id        integer     REFERENCES frete_produtos(id),
  transportadora_id integer     REFERENCES frete_transportadoras(id),
  cidade_id         integer     REFERENCES frete_cidades(id),
  quantidade        integer,
  valor_frete       numeric,
  prazo_entrega     integer,
  data              timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

-- ================================================================
-- RPC: Resultado consolidado por produto e estado
-- ================================================================
CREATE OR REPLACE FUNCTION frete_resultado_por_produto_estado(
  filtro_mes          integer DEFAULT NULL,
  filtro_ano          integer DEFAULT NULL,
  filtro_data_inicial date    DEFAULT NULL,
  filtro_data_final   date    DEFAULT NULL
)
RETURNS TABLE (
  produto             text,
  transportadora      text,
  estado              text,
  uf                  text,
  qtd_lancamentos     bigint,
  quantidade_media    numeric,
  cubagem_unitaria    numeric,
  cubagem_total_media numeric,
  peso_unitario       numeric,
  peso_total_medio    numeric,
  frete_medio         numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.nome::text                                                            AS produto,
    t.nome::text                                                            AS transportadora,
    e.nome::text                                                            AS estado,
    e.uf::text,
    COUNT(l.id)                                                             AS qtd_lancamentos,
    ROUND(AVG(l.quantidade), 2)                                             AS quantidade_media,
    ROUND((p.largura * p.comprimento * p.altura) / 1000000000.0, 6)        AS cubagem_unitaria,
    ROUND((p.largura * p.comprimento * p.altura) / 1000000000.0
          * AVG(l.quantidade), 4)                                           AS cubagem_total_media,
    ROUND(p.peso, 3)                                                        AS peso_unitario,
    ROUND(p.peso * AVG(l.quantidade), 3)                                    AS peso_total_medio,
    ROUND(AVG(l.valor_frete), 2)                                            AS frete_medio
  FROM frete_lancamentos l
  JOIN frete_produtos      p ON l.produto_id        = p.id
  JOIN frete_transportadoras t ON l.transportadora_id = t.id
  JOIN frete_cidades        c ON l.cidade_id         = c.id
  JOIN frete_estados        e ON c.estado_id          = e.id
  WHERE
    (filtro_mes          IS NULL OR EXTRACT(MONTH FROM l.data) = filtro_mes)
    AND (filtro_ano      IS NULL OR EXTRACT(YEAR  FROM l.data) = filtro_ano)
    AND (filtro_data_inicial IS NULL OR l.data::date >= filtro_data_inicial)
    AND (filtro_data_final   IS NULL OR l.data::date <= filtro_data_final)
  GROUP BY p.nome, t.nome, e.nome, e.uf, p.largura, p.comprimento, p.altura, p.peso
  ORDER BY p.nome, t.nome
$$;
