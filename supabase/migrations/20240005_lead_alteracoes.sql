-- Histórico de alterações de leads (auditoria)
-- Registra cada gravação (criação/edição) com resumo do que mudou,
-- para exibição no rodapé do lead.
--
-- Rodar este script no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS lead_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  tipo text NOT NULL DEFAULT 'EDICAO', -- CRIACAO | EDICAO
  resumo text,
  alteracoes jsonb DEFAULT '[]'::jsonb, -- [{campo, label, de, para}]
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_alteracoes_lead
  ON lead_alteracoes(lead_id, created_at DESC);

-- A leitura no app é feita via API (service role). Mantemos RLS habilitado
-- e sem policies de acesso anônimo/autenticado direto por segurança.
ALTER TABLE lead_alteracoes ENABLE ROW LEVEL SECURITY;
