-- 0008_signature_tables.sql
-- Signature requests and webhook tracking for ClickSign/DocuSign integrations.

create table if not exists signature_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text not null,
  signer_name text,
  signer_email text not null,
  provider text not null default 'internal' check (provider in ('internal','clicksign','docusign','govbr','icp_brasil')),
  status text not null default 'pending' check (status in ('pending','sent','viewed','signed','rejected','expired','cancelled')),
  case_id uuid references cases(id),
  client_id uuid references clients(id),
  document_id uuid references documents(id),
  document_name text,
  message text,
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  -- External integration tracking.
  external_envelope_id text,
  external_document_id text,
  signing_url text,
  webhook_data jsonb,
  sync_status text default 'manual' check (sync_status in ('synced','pending','error','manual')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_signature_requests_tenant on signature_requests(tenant_id);
create index if not exists idx_signature_requests_status on signature_requests(status);
create index if not exists idx_signature_requests_case on signature_requests(case_id);
create index if not exists idx_signature_requests_client on signature_requests(client_id);
create index if not exists idx_signature_requests_external on signature_requests(external_envelope_id);

-- Webhook event log for signature providers.
create table if not exists signature_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  provider text not null,
  event_type text not null,
  envelope_id text,
  payload jsonb,
  signature_hash text,
  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_signature_webhooks_tenant on signature_webhooks(tenant_id);
create index if not exists idx_signature_webhooks_envelope on signature_webhooks(envelope_id);
