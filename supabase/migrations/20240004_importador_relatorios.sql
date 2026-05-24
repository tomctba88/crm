-- Controle de uploads (log de cada importação)
CREATE TABLE IF NOT EXISTS fin_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  mes int NOT NULL,
  ano int NOT NULL,
  nome_arquivo text,
  total_linhas int DEFAULT 0,
  importado_por uuid REFERENCES auth.users(id),
  importado_em timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_tipo_mes_ano ON fin_uploads(tipo, mes, ano);

-- Balancete mensal (DRE real do caixa)
CREATE TABLE IF NOT EXISTS fin_balancete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  tipo text NOT NULL,
  grupo text,
  categoria text NOT NULL,
  valor numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_balancete_periodo ON fin_balancete(ano, mes);
CREATE INDEX IF NOT EXISTS idx_balancete_categoria ON fin_balancete(categoria);

-- Fluxo de caixa semanal importado
CREATE TABLE IF NOT EXISTS fin_fluxo_caixa_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  tipo text NOT NULL,
  grupo text,
  categoria text NOT NULL,
  periodo_label text,
  data_inicio date,
  data_fim date,
  valor numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fluxo_import_periodo ON fin_fluxo_caixa_import(ano, mes);

-- Vendas mensais com margem (por cliente)
CREATE TABLE IF NOT EXISTS fin_vendas_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  cliente text NOT NULL,
  cnpj_cpf text,
  valor numeric(15,2) DEFAULT 0,
  frete numeric(15,2) DEFAULT 0,
  custo numeric(15,2) DEFAULT 0,
  valor_lucro numeric(15,2) DEFAULT 0,
  percentual_lucro numeric(8,4) DEFAULT 0,
  total numeric(15,2) DEFAULT 0,
  segmento text DEFAULT 'outros',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendas_import_periodo ON fin_vendas_import(ano, mes);

-- Contas a receber importadas do XLS
CREATE TABLE IF NOT EXISTS fin_cr_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  vencimento date,
  cliente text,
  historico text,
  numero_banco text,
  numero_documento text,
  data_emissao date,
  valor numeric(15,2) DEFAULT 0,
  saldo numeric(15,2) DEFAULT 0,
  recebido numeric(15,2) DEFAULT 0,
  antecipada boolean DEFAULT false,
  status text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_import_periodo ON fin_cr_import(ano, mes);

-- Contas a pagar importadas do XLS
CREATE TABLE IF NOT EXISTS fin_cp_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  vencimento date,
  fornecedor text,
  historico text,
  numero_documento text,
  data_emissao date,
  valor numeric(15,2) DEFAULT 0,
  saldo numeric(15,2) DEFAULT 0,
  pago numeric(15,2) DEFAULT 0,
  status text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_import_periodo ON fin_cp_import(ano, mes);
