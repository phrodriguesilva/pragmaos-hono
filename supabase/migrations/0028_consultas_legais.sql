-- =========================================================================
-- 0028 — Consultas Legais (JusFinder-equivalent module)
--
-- Implements a credit-based legal consultation system powered by BigDataCorp.
-- Mirrors Jusfy's JusFinder: 10 consultation types covering people, companies,
-- vehicles, credit restriction, and process search.
--
-- Architecture:
--   consulta_types  — catalog of available consultations (seeded)
--   consultas       — individual consultation records (tenant-scoped)
--   consulta_credits — monthly credit balance per tenant (included + purchased)
-- =========================================================================

-- 1. Catalog of consultation types.
create table if not exists consulta_types (
  id text primary key,
  label text not null,
  description text,
  input_type text not null check (input_type in ('cpf','cnpj','placa','cpf_cnpj')),
  icon text not null,
  credits_cost int not null default 1,
  category text not null check (category in ('pessoas','empresas','veiculos','credito','processos')),
  provider text not null default 'bigdata',
  bigdata_endpoint text not null,          -- e.g. 'pessoas', 'empresas', 'veiculos'
  bigdata_datasets text not null,          -- comma-separated dataset names
  enabled boolean not null default true,
  sort_order int not null default 0
);

-- 2. Individual consultation records.
create table if not exists consultas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type_id text not null references consulta_types(id),
  input_value text not null,               -- raw CPF/CNPJ/placa as entered
  input_type text not null,                -- 'cpf','cnpj','placa'
  input_label text,                        -- resolved name (for history display)
  status text not null default 'pending' check (status in ('pending','processing','completed','error','no_data')),
  result jsonb,                            -- raw API response
  error_message text,
  case_id uuid references cases(id) on delete set null,
  credits_used int not null default 1,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_consultas_tenant on consultas(tenant_id, created_at desc);
create index if not exists idx_consultas_user on consultas(user_id, created_at desc);
create index if not exists idx_consultas_type on consultas(type_id);
create index if not exists idx_consultas_case on consultas(case_id) where case_id is not null;
create index if not exists idx_consultas_input on consultas(tenant_id, input_value);

-- 3. Monthly credit balance per tenant.
create table if not exists consulta_credits (
  tenant_id uuid not null references tenants(id) on delete cascade,
  month date not null,                     -- first day of the month
  included_credits int not null default 0, -- credits included in the plan
  used_credits int not null default 0,     -- credits consumed this month
  purchased_credits int not null default 0,-- add-on credits bought
  primary key (tenant_id, month)
);

-- 4. Batch consultation jobs (for CSV upload — Phase 3).
create table if not exists consulta_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type_id text not null references consulta_types(id),
  file_name text not null,
  total_rows int not null default 0,
  processed_rows int not null default 0,
  status text not null default 'pending' check (status in ('pending','processing','completed','error','partial')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_consulta_batches_tenant on consulta_batches(tenant_id, created_at desc);

-- 5. RLS policies.
alter table consultas enable row level security;
alter table consulta_credits enable row level security;
alter table consulta_batches enable row level security;

-- consultas: tenant-scoped CRUD.
drop policy if exists "consultas_select_own" on consultas;
create policy "consultas_select_own" on consultas for select using (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists "consultas_insert_own" on consultas;
create policy "consultas_insert_own" on consultas for insert with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists "consultas_update_own" on consultas;
create policy "consultas_update_own" on consultas for update using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- consulta_credits: tenant-scoped.
drop policy if exists "consulta_credits_select_own" on consulta_credits;
create policy "consulta_credits_select_own" on consulta_credits for select using (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists "consulta_credits_upsert_own" on consulta_credits;
create policy "consulta_credits_upsert_own" on consulta_credits for insert with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists "consulta_credits_update_own" on consulta_credits;
create policy "consulta_credits_update_own" on consulta_credits for update using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- consulta_batches: tenant-scoped.
drop policy if exists "consulta_batches_select_own" on consulta_batches;
create policy "consulta_batches_select_own" on consulta_batches for select using (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists "consulta_batches_insert_own" on consulta_batches;
create policy "consulta_batches_insert_own" on consulta_batches for insert with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

drop policy if exists "consulta_batches_update_own" on consulta_batches;
create policy "consulta_batches_update_own" on consulta_batches for update using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- consulta_types: public read (catalog, no RLS needed — no tenant column).
-- No RLS on consulta_types since it's a shared catalog.

-- 6. Seed the consultation type catalog.
insert into consulta_types (id, label, description, input_type, icon, credits_cost, category, bigdata_endpoint, bigdata_datasets, sort_order) values
  -- Pessoas
  ('localizacao', 'Localizacao por CPF', 'Nome, enderecos, telefones e e-mails a partir do CPF', 'cpf', 'ph-map-pin', 2, 'pessoas', 'pessoas', 'basic_data,addresses,phones,emails', 1),
  ('situacao-cpf', 'Situacao Cadastral CPF', 'Status do CPF na Receita Federal + verificacao de obito', 'cpf', 'ph-id-card', 1, 'pessoas', 'pessoas', 'basic_data', 2),
  ('relacionamentos', 'Relacionamentos', 'Mapeia conexoes entre pessoas fisicas e juridicas', 'cpf_cnpj', 'ph-users-three', 2, 'pessoas', 'pessoas', 'relationships', 3),
  -- Empresas
  ('cnpj-completo', 'CNPJ Completo', 'Dados completos do CNPJ + quadro societario (QSA)', 'cnpj', 'ph-building', 1, 'empresas', 'empresas', 'basic_data,qsa', 4),
  ('grupo-economico', 'Grupo Economico', 'Identifica relacoes entre empresas de um mesmo grupo', 'cnpj', 'ph-buildings', 2, 'empresas', 'empresas', 'relationships', 5),
  -- Veiculos
  ('veiculos-por-doc', 'Veiculos por CPF/CNPJ', 'Todos os veiculos em nome de uma pessoa ou empresa', 'cpf_cnpj', 'ph-car', 1, 'veiculos', 'veiculos', 'vehicles_associated', 6),
  ('placa', 'Dados do Veiculo por Placa', 'Proprietario, RENAVAM, restricoes e historico', 'placa', 'ph-car-profile', 1, 'veiculos', 'veiculos', 'plate_history', 7),
  ('debitos-veiculares', 'Debitos Veiculares', 'Multas, IPVA e status de licenciamento por placa', 'placa', 'ph-traffic-cone', 1, 'veiculos', 'veiculos', 'vehicle_debits', 8),
  -- Credito
  ('restricao-credito', 'Restricao de Credito', 'Serasa/SPC e indicadores de risco financeiro', 'cpf_cnpj', 'ph-credit-card', 2, 'credito', 'pessoas', 'risk_financial,debt_collection', 9),
  -- Processos
  ('buscador-processual', 'Buscador Processual', 'Localiza processos judiciais por CPF/CNPJ', 'cpf_cnpj', 'ph-scales', 1, 'processos', 'pessoas', 'processes', 10)
on conflict (id) do update set
  label = excluded.label,
  description = excluded.description,
  input_type = excluded.input_type,
  icon = excluded.icon,
  credits_cost = excluded.credits_cost,
  category = excluded.category,
  bigdata_endpoint = excluded.bigdata_endpoint,
  bigdata_datasets = excluded.bigdata_datasets,
  sort_order = excluded.sort_order;
