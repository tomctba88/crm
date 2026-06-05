-- Captura o grupo de origem do Tiny no relatório "Vendas por Produto"
-- (linha de cabeçalho de grupo no XLS). Usado para classificar produtos
-- em segmentos de análise (Cadeiras x Móveis) na página de Análise de Produtos.
ALTER TABLE fin_vendas_produtos_import
  ADD COLUMN IF NOT EXISTS grupo text;

CREATE INDEX IF NOT EXISTS idx_vendas_produtos_grupo
  ON fin_vendas_produtos_import(grupo);
