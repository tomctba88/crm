-- Adiciona a categoria (plano de contas) aos títulos de Contas a Pagar.
-- Usada para corrigir a classificação dos lançamentos do Fluxo de Caixa
-- (pagamentos "Pagamento de contas" que entram no balancete com categoria errada).
ALTER TABLE fin_cp_import ADD COLUMN IF NOT EXISTS categoria text;
