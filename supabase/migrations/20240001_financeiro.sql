-- Contas a receber (vindas do Tiny)
CREATE TABLE IF NOT EXISTS fin_contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE,
  numero_documento text,
  cliente text,
  descricao text,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  valor_recebido numeric(15,2) DEFAULT 0,
  data_vencimento date,
  data_recebimento date,
  status text DEFAULT 'aberto', -- aberto | recebido | vencido | cancelado
  categoria text,
  conta_bancaria text,
  observacoes text,
  origem text DEFAULT 'tiny', -- tiny | manual
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contas a pagar (vindas do Tiny)
CREATE TABLE IF NOT EXISTS fin_contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE,
  numero_documento text,
  fornecedor text,
  descricao text,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  valor_pago numeric(15,2) DEFAULT 0,
  data_vencimento date,
  data_pagamento date,
  status text DEFAULT 'aberto', -- aberto | pago | vencido | cancelado
  categoria text,
  conta_bancaria text,
  observacoes text,
  origem text DEFAULT 'tiny',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Lançamentos de fluxo de caixa
CREATE TABLE IF NOT EXISTS fin_fluxo_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiny_id text UNIQUE,
  tipo text NOT NULL, -- entrada | saida
  descricao text,
  valor numeric(15,2) NOT NULL DEFAULT 0,
  data_lancamento date NOT NULL,
  categoria text,
  conta_bancaria text,
  documento_referencia text,
  origem text DEFAULT 'tiny',
  created_at timestamptz DEFAULT now()
);

-- Categorias financeiras
CREATE TABLE IF NOT EXISTS fin_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL, -- receita | despesa | ambos
  cor text DEFAULT '#1b4fd6',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Snapshot diário para dashboard (cache de KPIs)
CREATE TABLE IF NOT EXISTS fin_snapshots_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL UNIQUE,
  total_receber numeric(15,2) DEFAULT 0,
  total_pagar numeric(15,2) DEFAULT 0,
  recebido_mes numeric(15,2) DEFAULT 0,
  pago_mes numeric(15,2) DEFAULT 0,
  saldo_projetado numeric(15,2) DEFAULT 0,
  vencidos_receber numeric(15,2) DEFAULT 0,
  vencidos_pagar numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON fin_contas_receber(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cr_status ON fin_contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON fin_contas_pagar(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_status ON fin_contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_fc_data ON fin_fluxo_caixa(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_fc_tipo ON fin_fluxo_caixa(tipo);
