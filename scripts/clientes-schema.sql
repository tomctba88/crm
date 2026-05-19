-- Tabela de clientes cadastrados
create table if not exists public.clientes (
  id         serial primary key,
  nome_cliente text not null,
  nome_empresa text,
  telefone   text,
  uf         text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: qualquer usuário autenticado pode ler/escrever
alter table public.clientes enable row level security;

create policy "clientes_autenticados"
  on public.clientes
  for all
  to authenticated
  using (true)
  with check (true);
