-- Schema do módulo financeiro (single-tenant, sem empresa_id)

create table if not exists public.integracoes_olist (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'olist_tiny',
  token text,
  ativo boolean not null default false,
  status text not null default 'nao_configurado',
  observacoes text,
  ultimo_sync_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nome)
);

-- Garante que o registro padrão existe
insert into public.integracoes_olist (nome)
values ('olist_tiny')
on conflict (nome) do nothing;

create table if not exists public.olist_clientes_raw (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.olist_pedidos_raw (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.olist_contas_receber_raw (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.olist_contas_pagar_raw (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.olist_notas_raw (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.logs_integracao (
  id uuid primary key default gen_random_uuid(),
  integracao text not null default 'tiny',
  recurso text,
  status text not null,
  mensagem text,
  detalhes jsonb,
  created_at timestamptz not null default now()
);
