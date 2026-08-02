-- 0006_tribunal_integration_fields.sql
-- Add fields to support tribunal integrations (CNJ DataJud, PJe, e-SAJ).

-- proceedings: track sync state with external tribunal systems.
alter table proceedings add column if not exists external_id text;
alter table proceedings add column if not exists sync_status text default 'manual'
  check (sync_status in ('synced','pending','error','manual'));
alter table proceedings add column if not exists last_synced_at timestamptz;
alter table proceedings add column if not exists data_source text default 'manual'
  check (data_source in ('cnj','pje','esaj','manual'));

-- communications_log: track origin of communications (PJe, manual, etc).
alter table communications_log add column if not exists source text default 'manual';
alter table communications_log add column if not exists external_id text;
alter table communications_log add column if not exists metadata jsonb;

-- integrations table (ensure it exists in migrations — was created manually before).
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  type text not null,
  name text not null,
  config jsonb,
  active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_integrations_tenant_id on integrations(tenant_id);
create index if not exists idx_integrations_tenant_type on integrations(tenant_id, type);
create index if not exists idx_proceedings_sync_status on proceedings(sync_status);
