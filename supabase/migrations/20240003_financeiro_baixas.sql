-- Adiciona campos de baixa em contas_receber (data e valor real recebido do Tiny)
ALTER TABLE fin_contas_receber
ADD COLUMN IF NOT EXISTS data_recebimento date,
ADD COLUMN IF NOT EXISTS valor_recebido numeric(15,2) DEFAULT 0;

-- Adiciona campos de baixa em contas_pagar (data e valor real pago do Tiny)
ALTER TABLE fin_contas_pagar
ADD COLUMN IF NOT EXISTS data_pagamento date,
ADD COLUMN IF NOT EXISTS valor_pago numeric(15,2) DEFAULT 0;

-- Índices para buscas por data de baixa
CREATE INDEX IF NOT EXISTS idx_cr_recebimento ON fin_contas_receber(data_recebimento);
CREATE INDEX IF NOT EXISTS idx_cp_pagamento ON fin_contas_pagar(data_pagamento);
