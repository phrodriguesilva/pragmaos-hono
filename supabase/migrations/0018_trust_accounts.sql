-- Migration 0018: Client trust accounts (conta corrente do cliente).
-- Required by OAB for segregation of client funds (adiantamentos, custas).
-- PragmaOS 2.

create table if not exists trust_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references clients(id) on delete cascade,
  balance_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_id)
);

create table if not exists trust_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  trust_account_id uuid not null references trust_accounts(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'transfer')),
  amount_cents bigint not null,
  description text,
  case_id uuid references cases(id) on delete set null,
  reference_date timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trust_accounts_tenant on trust_accounts(tenant_id);
create index if not exists idx_trust_accounts_client on trust_accounts(client_id);
create index if not exists idx_trust_transactions_tenant on trust_transactions(tenant_id);
create index if not exists idx_trust_transactions_account on trust_transactions(trust_account_id);
create index if not exists idx_trust_transactions_case on trust_transactions(case_id);

alter table trust_accounts enable row level security;
alter table trust_transactions enable row level security;

create policy "trust_accounts_tenant_select" on trust_accounts for select using (tenant_id = public.current_tenant_id());
create policy "trust_accounts_tenant_insert" on trust_accounts for insert with check (tenant_id = public.current_tenant_id());
create policy "trust_accounts_tenant_update" on trust_accounts for update using (tenant_id = public.current_tenant_id());
create policy "trust_accounts_tenant_delete" on trust_accounts for delete using (tenant_id = public.current_tenant_id());

create policy "trust_transactions_tenant_select" on trust_transactions for select using (tenant_id = public.current_tenant_id());
create policy "trust_transactions_tenant_insert" on trust_transactions for insert with check (tenant_id = public.current_tenant_id());
create policy "trust_transactions_tenant_update" on trust_transactions for update using (tenant_id = public.current_tenant_id());
create policy "trust_transactions_tenant_delete" on trust_transactions for delete using (tenant_id = public.current_tenant_id());

create trigger trg_trust_accounts_updated_at before update on trust_accounts for each row execute function public.set_updated_at();
