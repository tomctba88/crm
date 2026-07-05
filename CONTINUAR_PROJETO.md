# Continuar o projeto — Ergotex "Gabster-like"

> Arquivo de retomada. Abra o Claude Code na pasta do projeto e cole o **PROMPT PRONTO** do final.

## Visão geral
Transformar o `ergotex-crm` num sistema estilo **Gabster** (marcenaria/móveis), com os módulos
conversando entre si por uma **espinha central: o Pedido**.
Fluxo: **CRM (lead→pipeline) → fecha → Vendas (monta itens+frete) → Produção → Frete → Financeiro.**

## Stack
Next.js 16 + React 19 + Supabase (Postgres) + Tailwind. Deploy automático no **Vercel** a cada push na `main`.
Migrações SQL rodadas manualmente no **SQL Editor do Supabase**.

## Regras do usuário (IMPORTANTES)
1. **Responder sempre em português.**
2. **Commit + push na `main` após cada mudança** (dispara deploy no Vercel).
3. **Só ADICIONAR melhorias — nunca alterar o que já existe, nem cálculos existentes, especialmente do CRM.**
   (Exceção autorizada: a área de Produtos/Produção foi reformulada a pedido do usuário.)
4. Tudo aditivo/nullable no banco para não quebrar nada.

## O que JÁ foi feito (com commits)
- **Fase 1 — Espinha Pedido** (`pedidos_espinha.sql` já rodado): tabelas `pedidos` + `pedido_itens`,
  `pedido_id` em `producao_ordens`/`pos_vendas`, backfill, tela `/pedidos` e `/pedidos/[id]`
  (cliente, itens c/ desconto, frete, prazo, totais, produção vinculada).
- **Fase 2 — Pedido automático do CRM** (`pedido_auto_from_posvenda.sql` já rodado): gatilhos no banco —
  ao fechar no pipeline, cria `pos_venda` → cria `pedido` (VENDIDO) e a OP herda `pedido_id`. Sem tocar no CRM.
- **Produtos (base = planilha do Tiny)** — reformulado dentro do módulo **Produção**:
  - Etapa 1 (`produtos_reforma.sql` já rodado): estendeu `producao_produtos` com todos os campos do Tiny + estoque;
    criou `producao_movimentos_produto`. Vendas repontado p/ `producao_produtos`.
  - Etapa 2 (sem SQL novo): importador de planilha `.xls` na aba **Produção→Produtos** (upsert por `tiny_id`, com progresso),
    formulário completo com todas as abas (Geral/Preços/Estoque/Fiscal/Fornecedor/Embalagem/Imagens/SEO),
    cadastro manual `/producao/produtos/novo`, edição `/producao/produtos/[id]`. Ficha técnica mantida.
    "Catálogo" separado (ideia descartada) foi removido.

### Migrações SQL já rodadas no Supabase
`pedidos_espinha.sql`, `pedido_auto_from_posvenda.sql`, `produtos_reforma.sql`.
(Existe `produtos_catalogo.sql` no repo — **NÃO usar**, abordagem abandonada.)

## Estado / dados de referência
- `pos_vendas` NÃO tem coluna `vendedor` nem `valor_orcamento` → usar `responsavel` e `leads.valor_orcamento`.
- `producao_produtos` no banco NÃO tinha `sku` originalmente (só passou a ter na reforma).
- Planilha do Tiny: 22 arquivos .xls (Excel binário), **12.925 produtos, 65 colunas**, aba "Produtos".
  Pasta local: `C:\Users\Tom\Downloads\produtos`.
- Promob (marcenaria): a pasta **PROGRAMAÇÃO** é o importável (DXF de peça = contorno + furação; DXF nesting;
  Etiquetas.pdf; PreviewCorte.pdf). O `.promob` é ZIP paramétrico, não utilizável.
  Fita de borda (códigos do Tiny/Promob): **TL**=todos os lados, **1+**=1 lado maior, **2+**=2 lados maiores, **SF**=sem fita.

## PENDÊNCIAS (próximos passos)
### Etapa 3 — Estoque (entradas/saídas)
Tela para lançar **entradas e saídas** de estoque de **produtos** (`producao_movimentos_produto`) e **insumos**
(`producao_movimentos_estoque`), com saldo atual. Provavelmente na aba **Produção→Estoque**.

### Etapa 4 — Baixa automática pedido → produção
Ao **enviar um pedido para produção**, dar baixa automática:
- **saída dos PRODUTOS** do pedido (quantidade vendida) em `producao_movimentos_produto`;
- **saída dos INSUMOS** conforme a **ficha técnica** de cada produto (qtd ficha × qtd produto) em `producao_movimentos_estoque`.
Base existente: `app/api/producao/ordens/[id]/baixar-estoque/route.ts` e `lib/producao/calcular-materiais.ts`.

### Fases futuras (marcenaria — "coração Gabster")
- **Import da pasta PROGRAMAÇÃO do Promob** → cria `producao_pecas` (dimensões, espessura, furação) por ordem.
- **Etiquetas com QR** por peça + **página de scan** (`/peca/<token>`) mostrando peça, cliente, prazo, status
  (via peça→OP→pedido→cliente). Permitir avançar status ao bipar.
- **Controle de fitagem de bordas** (4 bordas por peça; painel "fila de fitagem").
- **Automação Frete + Financeiro** a partir do pedido.

## Arquivos-chave
- Espinha: `supabase/pedidos_espinha.sql`, `app/(protected)/pedidos/*`, `components/pedidos/*`, `app/api/pedidos/*`, `lib/pedidos/preco-produto.ts`
- Gatilhos: `supabase/pedido_auto_from_posvenda.sql`
- Produtos: `supabase/produtos_reforma.sql`, `lib/produtos/mapear.ts`, `app/api/producao/produtos/*`, `app/(protected)/producao/produtos/*`, `components/produtos/produto-form.tsx`, `components/producao/produtos-manager.tsx`
- Nav é data-driven pela tabela `modulos` (admin vê tudo).

---

## PROMPT PRONTO (colar no início da próxima sessão)
```
Estamos continuando o projeto "Ergotex Gabster-like". Leia o arquivo CONTINUAR_PROJETO.md
na raiz e as memórias do projeto para retomar o contexto.

Regras: responder em português; commit+push na main após cada mudança (deploy Vercel);
só ADICIONAR, sem alterar o que já existe nem cálculos do CRM; migrações em SQL para eu rodar
no Supabase; ao final me dar o arquivo SQL em C:\Users\Tom\Downloads para copiar.

Já concluímos: Fase 1 (espinha Pedido), Fase 2 (pedido automático ao fechar no CRM) e a reforma
de Produtos (cadastro no formato da planilha do Tiny dentro de Produção, com importador e form completo).
Antes de codar, confirme comigo se importei os 12.925 produtos com sucesso.

Próximo passo que quero: [ESCOLHA] Etapa 3 (estoque entradas/saídas) OU Etapa 4 (baixa automática
pedido→produção: baixa produtos + insumos pela ficha) OU o import de DXF do Promob + etiquetas com QR.
Faça um plano curto antes de implementar.
```
