-- Drop tabelas antigas se existirem (reconstrução limpa)
DROP TABLE IF EXISTS fin_fluxo_caixa CASCADE;
DROP TABLE IF EXISTS fin_itens_venda CASCADE;
DROP TABLE IF EXISTS fin_vendas CASCADE;
DROP TABLE IF EXISTS fin_snapshots_diarios CASCADE;

-- Recriar contas_receber com novo schema (apenas títulos em aberto)
DROP TABLE IF EXISTS fin_contas_receber CASCADE;
CREATE TABLE fin_contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE NOT NULL,
  numero_documento text,
  cliente text,
  historico text,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  data_vencimento date,
  data_emissao date,
  status text DEFAULT 'aberto',
  categoria text,
  categoria_id text,
  conta_bancaria text,
  numero_parcela int,
  numero_parcelas int,
  origem text DEFAULT 'tiny',
  sincronizado_em timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Recriar contas_pagar com novo schema (apenas títulos em aberto)
DROP TABLE IF EXISTS fin_contas_pagar CASCADE;
CREATE TABLE fin_contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE NOT NULL,
  numero_documento text,
  fornecedor text,
  historico text,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  data_vencimento date,
  data_emissao date,
  status text DEFAULT 'aberto',
  categoria text,
  categoria_id text,
  conta_bancaria text,
  numero_parcela int,
  numero_parcelas int,
  origem text DEFAULT 'tiny',
  sincronizado_em timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- CAIXA — baixas reais (fonte primária de recebimentos/pagamentos)
DROP TABLE IF EXISTS fin_caixa CASCADE;
CREATE TABLE fin_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE NOT NULL,
  tipo text NOT NULL,
  data_lancamento date NOT NULL,
  historico text,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  categoria text,
  categoria_id text,
  conta_bancaria text,
  documento_referencia text,
  origem text DEFAULT 'tiny',
  sincronizado_em timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- VENDAS (pedidos de venda + NFs emitidas)
DROP TABLE IF EXISTS fin_vendas CASCADE;
CREATE TABLE fin_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE NOT NULL,
  tipo_origem text NOT NULL,
  numero text,
  cliente text,
  data_venda date,
  data_emissao date,
  valor_total numeric(15,2) DEFAULT 0,
  valor_desconto numeric(15,2) DEFAULT 0,
  valor_frete numeric(15,2) DEFAULT 0,
  valor_liquido numeric(15,2) DEFAULT 0,
  situacao text,
  valor_estofaria numeric(15,2) DEFAULT 0,
  valor_marcenaria numeric(15,2) DEFAULT 0,
  origem text DEFAULT 'tiny',
  sincronizado_em timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ITENS DE VENDA (para CMV e margem por pedido)
DROP TABLE IF EXISTS fin_itens_venda CASCADE;
CREATE TABLE fin_itens_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid REFERENCES fin_vendas(id) ON DELETE CASCADE,
  tiny_produto_id text,
  codigo text,
  descricao text,
  unidade text,
  quantidade numeric(15,4) DEFAULT 0,
  valor_unitario numeric(15,2) DEFAULT 0,
  valor_total numeric(15,2) DEFAULT 0,
  custo_unitario numeric(15,2) DEFAULT 0,
  custo_total numeric(15,2) DEFAULT 0,
  segmento text,
  margem_valor numeric(15,2) DEFAULT 0,
  margem_percentual numeric(8,4) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON fin_contas_receber(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cr_status ON fin_contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_cr_categoria ON fin_contas_receber(categoria);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON fin_contas_pagar(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_status ON fin_contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_cp_categoria ON fin_contas_pagar(categoria);
CREATE INDEX IF NOT EXISTS idx_caixa_data ON fin_caixa(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_caixa_tipo ON fin_caixa(tipo);
CREATE INDEX IF NOT EXISTS idx_caixa_categoria ON fin_caixa(categoria);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON fin_vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_tipo ON fin_vendas(tipo_origem);
CREATE INDEX IF NOT EXISTS idx_itens_venda ON fin_itens_venda(venda_id);
CREATE INDEX IF NOT EXISTS idx_itens_segmento ON fin_itens_venda(segmento);
