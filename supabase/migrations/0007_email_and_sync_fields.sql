-- 0007_email_and_sync_fields.sql
-- Email module tables + sync tracking fields for calendar/contacts/documents.

-- Email accounts (OAuth-connected Gmail/Outlook accounts).
create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  provider text not null check (provider in ('gmail', 'outlook', 'imap', 'smtp')),
  email text not null,
  display_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_email_accounts_tenant on email_accounts(tenant_id);
create index if not exists idx_email_accounts_user on email_accounts(user_id);

-- Email messages (sent and received).
create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  account_id uuid references email_accounts(id),
  from_email text not null,
  to_email text not null,
  cc text,
  bcc text,
  subject text,
  body text,
  direction text not null check (direction in ('inbound', 'outbound')),
  read boolean not null default false,
  starred boolean not null default false,
  received_at timestamptz,
  sent_at timestamptz,
  case_id uuid references cases(id),
  client_id uuid references clients(id),
  external_id text,
  thread_id text,
  has_attachments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_email_messages_tenant on email_messages(tenant_id);
create index if not exists idx_email_messages_account on email_messages(account_id);
create index if not exists idx_email_messages_direction on email_messages(direction);
create index if not exists idx_email_messages_case on email_messages(case_id);

-- Sync tracking fields for hearings (calendar sync).
alter table hearings add column if not exists external_id text;
alter table hearings add column if not exists sync_status text default 'manual'
  check (sync_status in ('synced','pending','error','manual'));
alter table hearings add column if not exists last_synced_at timestamptz;
alter table hearings add column if not exists calendar_provider text default 'none'
  check (calendar_provider in ('google','outlook','none'));

-- Sync tracking fields for deadlines (calendar sync).
alter table deadlines add column if not exists external_id text;
alter table deadlines add column if not exists sync_status text default 'manual'
  check (sync_status in ('synced','pending','error','manual'));
alter table deadlines add column if not exists last_synced_at timestamptz;
alter table deadlines add column if not exists calendar_provider text default 'none'
  check (calendar_provider in ('google','outlook','none'));

-- Sync tracking fields for clients (contacts sync).
alter table clients add column if not exists external_id text;
alter table clients add column if not exists sync_status text default 'manual'
  check (sync_status in ('synced','pending','error','manual'));
alter table clients add column if not exists last_synced_at timestamptz;
alter table clients add column if not exists contact_provider text default 'none'
  check (contact_provider in ('google','outlook','none'));

-- Sync tracking fields for documents (cloud storage sync).
alter table documents add column if not exists external_id text;
alter table documents add column if not exists sync_status text default 'manual'
  check (sync_status in ('synced','pending','error','manual'));
alter table documents add column if not exists last_synced_at timestamptz;
alter table documents add column if not exists storage_provider text default 'none'
  check (storage_provider in ('google_drive','onedrive','supabase','none'));

-- OAuth token storage on integrations table (for storing per-tenant OAuth tokens).
alter table integrations add column if not exists access_token text;
alter table integrations add column if not exists refresh_token text;
alter table integrations add column if not exists token_expires_at timestamptz;
alter table integrations add column if not exists connected_email text;
