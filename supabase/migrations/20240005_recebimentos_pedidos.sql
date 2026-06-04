-- Recebimentos mensais por cliente (o que foi efetivamente recebido)
CREATE TABLE IF NOT EXISTS fin_recebimentos_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  cliente text NOT NULL,
  juros numeric(15,2) DEFAULT 0,
  taxas numeric(15,2) DEFAULT 0,
  acrescimos numeric(15,2) DEFAULT 0,
  descontos numeric(15,2) DEFAULT 0,
  valor_original numeric(15,2) DEFAULT 0,
  valor_recebido numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recebimentos_import_periodo ON fin_recebimentos_import(ano, mes);

-- Pedidos / NFs com forma de pagamento e status
CREATE TABLE IF NOT EXISTS fin_pedidos_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes int NOT NULL,
  ano int NOT NULL,
  data_venda date,
  numero text,
  valor_total numeric(15,2) DEFAULT 0,
  taxas numeric(15,2) DEFAULT 0,
  tarifas numeric(15,2) DEFAULT 0,
  valor_liquido numeric(15,2) DEFAULT 0,
  forma_recebimento text,
  meio_recebimento text,
  detalhes text,
  num_parcelas text,
  prazo_medio numeric(8,2) DEFAULT 0,
  situacao text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_import_periodo ON fin_pedidos_import(ano, mes);
