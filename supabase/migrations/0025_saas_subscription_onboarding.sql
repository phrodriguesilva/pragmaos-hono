-- 0025_saas_subscription_onboarding.sql
-- SaaS subscription lifecycle, onboarding, commercial leads, plan catalog.
-- Fixes: tenants.cnpj was NOT NULL UNIQUE but self-service signup doesn't collect CNPJ
--        (onboarding collects it later). Also adds the missing columns that
--        tenant-provisioning.ts already tries to insert (status, max_users, trial_ends_at).

-- =========================================================================
-- 1. Fix tenants.cnpj — make nullable (collected during onboarding, not signup)
-- =========================================================================
alter table tenants alter column cnpj drop not null;
-- Drop the unique constraint if it exists (cnpj may be empty/duplicated across
-- trial tenants; uniqueness is enforced at onboarding completion instead).
-- Constraint must be dropped before the backing index.
alter table tenants drop constraint if exists tenants_cnpj_key;
drop index if exists tenants_cnpj_key;

-- =========================================================================
-- 2. Subscription / trial columns on tenants
--    The provisioning code already inserts status, max_users, trial_ends_at —
--    these columns must exist or every signup fails.
-- =========================================================================
alter table tenants
  add column if not exists status text not null default 'active' check (status in ('active','trialing','past_due','canceled','suspended','deleted')),
  add column if not exists max_users int not null default 3,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_step int not null default 0,
  -- SaaS billing (Asaas)
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled','suspended','none')),
  add column if not exists subscription_plan text not null default 'trial',
  add column if not exists current_period_end timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text;

-- Backfill: existing tenants get 'none' subscription status unless on trial.
update tenants set subscription_status = 'none' where subscription_status is null;

-- =========================================================================
-- 3. Plan catalog (shared, platform-level — not tenant-scoped)
--    Single source of truth for pricing, limits and feature flags.
-- =========================================================================
create table if not exists plans (
  id text primary key,                       -- 'trial','starter','pro','enterprise'
  name text not null,
  tagline text,
  price_monthly_cents int not null default 0,
  price_yearly_cents int not null default 0,
  max_users int not null default 3,
  max_cases int,                             -- null = unlimited
  has_ai boolean not null default true,
  has_whatsapp boolean not null default false,
  has_public_site boolean not null default false,
  has_api boolean not null default false,
  has_integrations boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into plans (id, name, tagline, price_monthly_cents, price_yearly_cents, max_users, max_cases, has_ai, has_whatsapp, has_public_site, has_api, has_integrations, sort_order) values
  ('trial',      'Trial',      '14 dias gratis, sem cartao',          0,     0,     3,   25,   true,  false, false, false, false, 0),
  ('starter',    'Starter',    'Para escritorios iniciantes',         19900, 199000, 10,  500,  true,  false, true,  false, false, 1),
  ('pro',        'Pro',        'Para escritorios em crescimento',     49900, 499000, 50,  null, true,  true,  true,  true,  true,  2),
  ('enterprise', 'Enterprise', 'Sob consulta — fale com o comercial', 0,     0,     999, null, true,  true,  true,  true,  true,  3)
on conflict (id) do nothing;

-- =========================================================================
-- 4. SaaS invoices (billing for the PragmaOS subscription itself)
--    Separate from the tenant's client billing (invoices table).
-- =========================================================================
create table if not exists saas_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_id text not null references plans(id),
  number text not null,
  amount_cents int not null,
  status text not null default 'open' check (status in ('open','paid','overdue','canceled','refunded')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  due_date date,
  paid_at timestamptz,
  asaas_payment_id text,
  asaas_invoice_url text,
  pix_qr_code text,
  pix_copy_paste text,
  boleto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create index if not exists idx_saas_invoices_tenant on saas_invoices(tenant_id);
create index if not exists idx_saas_invoices_status on saas_invoices(status);

-- =========================================================================
-- 5. Commercial leads (B2B contacts from the marketing landing page)
-- =========================================================================
create table if not exists commercial_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company text,
  role text,                                 -- e.g. 'Socio', 'Gerente', 'CEO'
  team_size text,                            -- e.g. '1-5','6-20','21-50','50+'
  message text,
  source text not null default 'landing_page',
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','lost')),
  interested_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commercial_leads_status on commercial_leads(status);
create index if not exists idx_commercial_leads_created on commercial_leads(created_at desc);

-- =========================================================================
-- 6. Onboarding state (key-value per tenant, tracks wizard progress)
-- =========================================================================
create table if not exists onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  step text not null,                        -- 'company','areas','team','branding','done'
  completed boolean not null default false,
  data jsonb,                                -- snapshot of what was filled
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, step)
);

create index if not exists idx_onboarding_steps_tenant on onboarding_steps(tenant_id);

-- =========================================================================
-- 7. RLS policies
-- =========================================================================

-- plans: readable by all authenticated (catalog)
alter table plans enable row level security;
create policy "plans_select_all" on plans
  for select to authenticated using (true);

-- saas_invoices: tenant-scoped (socio/admin only)
alter table saas_invoices enable row level security;
create policy "saas_invoices_select_own" on saas_invoices
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "saas_invoices_modify_own" on saas_invoices
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin','financeiro')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin','financeiro')));

-- commercial_leads: platform-level (no tenant scoping) — only service role accesses it.
-- RLS enabled with no policies = blocked for authenticated clients; service role bypasses.
alter table commercial_leads enable row level security;

-- onboarding_steps: tenant-scoped
alter table onboarding_steps enable row level security;
create policy "onboarding_steps_select_own" on onboarding_steps
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "onboarding_steps_modify_own" on onboarding_steps
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- 8. Updated_at triggers
-- =========================================================================
drop trigger if exists trg_saas_invoices_updated on saas_invoices;
create trigger trg_saas_invoices_updated
  before update on saas_invoices
  for each row execute function update_updated_at();

drop trigger if exists trg_commercial_leads_updated on commercial_leads;
create trigger trg_commercial_leads_updated
  before update on commercial_leads
  for each row execute function update_updated_at();
