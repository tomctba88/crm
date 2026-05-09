-- Schema do módulo de Produção

-- Tipos de produto (configurável no cadastro)
create table if not exists public.producao_tipos_produto (
  id serial primary key,
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Processos/etapas padrão por tipo (templates editáveis no cadastro)
create table if not exists public.producao_processos (
  id serial primary key,
  tipo_produto_id integer not null references public.producao_tipos_produto(id) on delete cascade,
  nome text not null,
  sequencia integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ordens de produção (1 por pos_venda)
create table if not exists public.producao_ordens (
  id serial primary key,
  numero text not null unique,
  pos_venda_id integer not null references public.pos_vendas(id) on delete cascade,
  lead_id integer references public.leads(id),
  tipo_produto_id integer references public.producao_tipos_produto(id),
  status text not null default 'AGUARDANDO',
  produto text,
  responsavel text,
  data_prevista date,
  data_conclusao date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Etapas de cada ordem (copiadas dos processos padrão no momento da criação)
create table if not exists public.producao_etapas (
  id serial primary key,
  ordem_id integer not null references public.producao_ordens(id) on delete cascade,
  nome text not null,
  sequencia integer not null default 1,
  status text not null default 'PENDENTE',
  responsavel text,
  data_inicio date,
  data_conclusao date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dados padrão: tipos de produto
insert into public.producao_tipos_produto (nome) values
  ('Cadeira / Poltrona'),
  ('Sofá'),
  ('Estante / Armário'),
  ('Outros')
on conflict (nome) do nothing;

-- Processos padrão: Cadeira / Poltrona
insert into public.producao_processos (tipo_produto_id, nome, sequencia)
select id, p.nome, p.seq from public.producao_tipos_produto, (values
  ('Corte da madeira', 1),
  ('Lixamento', 2),
  ('Pintura / Verniz', 3),
  ('Montagem do assento', 4),
  ('Montagem estrutural', 5),
  ('Controle de qualidade', 6),
  ('Embalagem', 7)
) as p(nome, seq)
where producao_tipos_produto.nome = 'Cadeira / Poltrona'
on conflict do nothing;

-- Processos padrão: Sofá
insert into public.producao_processos (tipo_produto_id, nome, sequencia)
select id, p.nome, p.seq from public.producao_tipos_produto, (values
  ('Corte da madeira', 1),
  ('Montagem da estrutura', 2),
  ('Corte do tecido / couro', 3),
  ('Estofamento', 4),
  ('Acabamento', 5),
  ('Controle de qualidade', 6),
  ('Embalagem', 7)
) as p(nome, seq)
where producao_tipos_produto.nome = 'Sofá'
on conflict do nothing;

-- Processos padrão: Estante / Armário
insert into public.producao_processos (tipo_produto_id, nome, sequencia)
select id, p.nome, p.seq from public.producao_tipos_produto, (values
  ('Corte da chapa', 1),
  ('Furação', 2),
  ('Montagem', 3),
  ('Pintura / Laminação', 4),
  ('Controle de qualidade', 5),
  ('Embalagem', 6)
) as p(nome, seq)
where producao_tipos_produto.nome = 'Estante / Armário'
on conflict do nothing;

-- Processos padrão: Outros
insert into public.producao_processos (tipo_produto_id, nome, sequencia)
select id, p.nome, p.seq from public.producao_tipos_produto, (values
  ('Produção', 1),
  ('Controle de qualidade', 2),
  ('Embalagem', 3)
) as p(nome, seq)
where producao_tipos_produto.nome = 'Outros'
on conflict do nothing;
