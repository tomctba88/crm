-- ============================================================================
-- Ergotex CRM · Fase 2 — Gerar Pedido automaticamente quando o CRM fecha o negócio
-- Executar no SQL Editor do Supabase (depois de pedidos_espinha.sql).
--
-- COMO FUNCIONA (sem tocar em nenhum código do CRM):
--   O pipeline, ao mover um lead para FECHADO/PEDIDO, já cria uma linha em
--   pos_vendas. Este GATILHO dispara nesse instante e cria o pedido vinculado,
--   pronto para o vendedor completar em /pedidos (itens + frete).
-- Tudo aditivo: só cria uma função e um trigger novos.
-- ============================================================================

CREATE OR REPLACE FUNCTION cria_pedido_da_posvenda()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_id  integer;
  v_vendedor text;
  v_valor    numeric(15,2);
  v_pedido_id integer;
BEGIN
  -- se por algum motivo já veio com pedido vinculado, não faz nada
  IF NEW.pedido_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- puxa dados do lead SOMENTE se ele existir (evita violar a FK de lead_id)
  SELECT l.id, l.vendedor, l.valor_orcamento
    INTO v_lead_id, v_vendedor, v_valor
  FROM leads l
  WHERE l.id = NEW.lead_id;

  -- cria o pedido (status VENDIDO: negócio fechado, aguardando o vendedor montar os itens)
  INSERT INTO pedidos (numero, lead_id, pos_venda_id, vendedor, status_global,
                       prazo_entrega, valor_produtos, valor_total, created_at)
  VALUES (
    'PED-' || to_char(COALESCE(NEW.data_inicio, NOW())::date, 'YYYY') || '-' || lpad(NEW.id::text, 4, '0'),
    v_lead_id,
    NEW.id,
    COALESCE(NEW.responsavel, v_vendedor),
    'VENDIDO',
    NEW.data_prevista_entrega,
    COALESCE(v_valor, 0),
    COALESCE(v_valor, 0),
    COALESCE(NEW.created_at, NOW())
  )
  RETURNING id INTO v_pedido_id;

  -- amarra a pós-venda ao pedido recém-criado
  UPDATE pos_vendas SET pedido_id = v_pedido_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_da_posvenda ON pos_vendas;
CREATE TRIGGER trg_pedido_da_posvenda
  AFTER INSERT ON pos_vendas
  FOR EACH ROW
  EXECUTE FUNCTION cria_pedido_da_posvenda();

-- ============================================================================
-- Gatilho 2 — a Ordem de Produção (criada logo após a pós-venda pelo CRM)
-- herda o pedido_id da sua pós-venda, para aparecer na Ficha do Pedido.
-- ============================================================================
CREATE OR REPLACE FUNCTION liga_ordem_ao_pedido()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pedido_id IS NULL AND NEW.pos_venda_id IS NOT NULL THEN
    SELECT pedido_id INTO NEW.pedido_id FROM pos_vendas WHERE id = NEW.pos_venda_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ordem_ao_pedido ON producao_ordens;
CREATE TRIGGER trg_ordem_ao_pedido
  BEFORE INSERT ON producao_ordens
  FOR EACH ROW
  EXECUTE FUNCTION liga_ordem_ao_pedido();

-- ============================================================================
-- Pronto. A partir de agora, todo negócio fechado no CRM gera um Pedido
-- automaticamente (com a Ordem de Produção já vinculada), que aparece em
-- /pedidos para o vendedor completar.
-- ============================================================================
