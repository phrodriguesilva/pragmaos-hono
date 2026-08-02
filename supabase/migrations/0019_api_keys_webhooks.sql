-- Migration 0019: Public API keys and webhooks.
-- PragmaOS 2.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}'::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  url text not null,
  events text[] not null default '{}'::text[],
  secret text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  webhook_id uuid not null references webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  response_status integer,
  response_body text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_tenant on api_keys(tenant_id);
create index if not exists idx_api_keys_hash on api_keys(key_hash);
create index if not exists idx_webhooks_tenant on webhooks(tenant_id);
create index if not exists idx_webhook_deliveries_tenant on webhook_deliveries(tenant_id);
create index if not exists idx_webhook_deliveries_webhook on webhook_deliveries(webhook_id);

alter table api_keys enable row level security;
alter table webhooks enable row level security;
alter table webhook_deliveries enable row level security;

create policy "api_keys_tenant_select" on api_keys for select using (tenant_id = public.current_tenant_id());
create policy "api_keys_tenant_insert" on api_keys for insert with check (tenant_id = public.current_tenant_id());
create policy "api_keys_tenant_update" on api_keys for update using (tenant_id = public.current_tenant_id());
create policy "api_keys_tenant_delete" on api_keys for delete using (tenant_id = public.current_tenant_id());

create policy "webhooks_tenant_select" on webhooks for select using (tenant_id = public.current_tenant_id());
create policy "webhooks_tenant_insert" on webhooks for insert with check (tenant_id = public.current_tenant_id());
create policy "webhooks_tenant_update" on webhooks for update using (tenant_id = public.current_tenant_id());
create policy "webhooks_tenant_delete" on webhooks for delete using (tenant_id = public.current_tenant_id());

create policy "webhook_deliveries_tenant_select" on webhook_deliveries for select using (tenant_id = public.current_tenant_id());
create policy "webhook_deliveries_tenant_insert" on webhook_deliveries for insert with check (tenant_id = public.current_tenant_id());
create policy "webhook_deliveries_tenant_update" on webhook_deliveries for update using (tenant_id = public.current_tenant_id());
create policy "webhook_deliveries_tenant_delete" on webhook_deliveries for delete using (tenant_id = public.current_tenant_id());

create trigger trg_webhooks_updated_at before update on webhooks for each row execute function public.set_updated_at();
