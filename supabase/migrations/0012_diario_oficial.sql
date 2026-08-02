-- 0012_diario_oficial.sql
-- Tables for Diario Oficial search and monitoring.
-- Uses Querido Diario API (free) and optionally Digesto API (paid).

create table if not exists diario_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  query_term text not null,
  territory_id text,
  territory_name text,
  date_from date,
  date_to date,
  provider text not null default 'querido_diario' check (provider in ('querido_diario','digesto')),
  is_monitoring boolean not null default false,
  last_checked_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diario_searches_tenant on diario_searches(tenant_id);
create index if not exists idx_diario_searches_monitoring on diario_searches(tenant_id, is_monitoring);

create table if not exists diario_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  search_id uuid references diario_searches(id) on delete cascade,
  external_id text,
  title text,
  subtitle text,
  section text,
  edition text,
  publishing_date date,
  url text,
  txt_url text,
  excerpt text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_diario_results_tenant on diario_results(tenant_id);
create index if not exists idx_diario_results_search on diario_results(search_id);
create index if not exists idx_diario_results_date on diario_results(publishing_date desc);

alter table diario_searches enable row level security;
alter table diario_results enable row level security;
create policy "diario_searches_all" on diario_searches for all using (true) with check (true);
create policy "diario_results_all" on diario_results for all using (true) with check (true);
