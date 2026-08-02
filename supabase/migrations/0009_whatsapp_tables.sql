-- 0009_whatsapp_tables.sql
-- WhatsApp Business API compliant tables.
-- Critical for Meta compliance: message tracking, templates, webhooks, opt-out.

-- Messages with full tracking (delivery status, external ID, session, opt-out).
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid references clients(id),
  phone text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  template_name text,
  external_message_id text,
  conversation_session_id uuid,
  last_customer_message_at timestamptz,
  opt_out_status text default 'active' check (opt_out_status in ('active', 'opted_out')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_whatsapp_messages_tenant on whatsapp_messages(tenant_id);
create index if not exists idx_whatsapp_messages_client on whatsapp_messages(client_id);
create index if not exists idx_whatsapp_messages_phone on whatsapp_messages(phone);
create index if not exists idx_whatsapp_messages_session on whatsapp_messages(conversation_session_id);
create index if not exists idx_whatsapp_messages_status on whatsapp_messages(status);
create index if not exists idx_whatsapp_messages_opt_out on whatsapp_messages(opt_out_status);

-- Templates synced with Meta's Template Management API.
create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  category text not null check (category in ('marketing', 'utility', 'authentication')),
  language text not null default 'pt_BR',
  components jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'disabled')),
  external_template_id text,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_whatsapp_templates_tenant on whatsapp_templates(tenant_id);
create index if not exists idx_whatsapp_templates_status on whatsapp_templates(status);

-- Webhook event log for audit trail.
create table if not exists whatsapp_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  event_type text not null,
  payload jsonb not null,
  signature_hash text,
  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_webhooks_tenant on whatsapp_webhooks(tenant_id);
create index if not exists idx_whatsapp_webhooks_processed on whatsapp_webhooks(processed);
