-- PragmaOS MVP -- initial schema (Supabase / Postgres)
-- Adapted from the Go original migrations 0001-0004.
-- Multi-tenant: every tenant-scoped table has tenant_id FK + index.
-- RLS enabled on all tenant-scoped tables (policies in 0002).

-- 1. tenants (root entity, not tenant-scoped)
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null unique,
  plan text not null default 'free',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 2. profiles (linked to auth.users, tenant-scoped, RBAC)
-- Supabase convention: a profiles table keyed by auth.users.id.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  email text not null,
  full_name text not null,
  role text not null check (role in ('socio','advogado','estagiario','financeiro','recepcao')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, email)
);
create index if not exists idx_profiles_tenant_id on profiles(tenant_id);
create index if not exists idx_profiles_tenant_email on profiles(tenant_id, email);

-- 3. clients (tenant-scoped, LGPD-sensitive)
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  client_type text not null default 'PF' check (client_type in ('PF','PJ')),
  email text,
  cpf text,
  cnpj text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_clients_tenant_id on clients(tenant_id);
create index if not exists idx_clients_tenant_created on clients(tenant_id, created_at desc, id desc);

-- 4. cases (tenant-scoped)
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references clients(id),
  title text not null,
  case_number text,
  case_type text not null default 'Outro',
  tribunal text,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_cases_tenant_id on cases(tenant_id);
create index if not exists idx_cases_client_id on cases(client_id);
create index if not exists idx_cases_tenant_created on cases(tenant_id, created_at desc, id desc);

-- 5. proceedings (tenant-scoped, CNJ)
create table if not exists proceedings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id),
  cnj_number text not null,
  tribunal text,
  district text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_proceedings_tenant_id on proceedings(tenant_id);
create index if not exists idx_proceedings_case_id on proceedings(case_id);

-- 6. proceeding_movements (tenant-scoped, AI translation)
create table if not exists proceeding_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  proceeding_id uuid not null references proceedings(id),
  movement_text text not null,
  ai_translation text,
  movement_date timestamptz not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_movements_tenant_id on proceeding_movements(tenant_id);
create index if not exists idx_movements_proceeding_id on proceeding_movements(proceeding_id);

-- 7. deadlines (tenant-scoped)
create table if not exists deadlines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id),
  title text not null,
  due_date timestamptz not null,
  priority int not null default 3,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_deadlines_tenant_id on deadlines(tenant_id);
create index if not exists idx_deadlines_case_id on deadlines(case_id);
create index if not exists idx_deadlines_due_date on deadlines(due_date);

-- 8. hearings (tenant-scoped)
create table if not exists hearings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id),
  date timestamptz not null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_hearings_tenant_id on hearings(tenant_id);
create index if not exists idx_hearings_case_id on hearings(case_id);
create index if not exists idx_hearings_date on hearings(date);

-- 9. communications_log (tenant-scoped)
create table if not exists communications_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid references cases(id),
  client_id uuid references clients(id),
  channel text not null,
  direction text not null check (direction in ('inbound','outbound')),
  message_body text not null,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_comm_tenant_id on communications_log(tenant_id);
create index if not exists idx_comm_case_id on communications_log(case_id);
create index if not exists idx_comm_client_id on communications_log(client_id);

-- 10. case_summaries (AI-generated, one per case)
create table if not exists case_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id),
  summary_text text not null,
  generated_by uuid not null references profiles(id),
  generated_at timestamptz not null default now(),
  edited_by uuid references profiles(id),
  edited_at timestamptz,
  status text not null default 'draft'
);
create index if not exists idx_summaries_case on case_summaries(case_id);
create index if not exists idx_summaries_tenant on case_summaries(tenant_id);
create unique index if not exists idx_summaries_tenant_case on case_summaries(tenant_id, case_id);

-- 11. case_events (timeline)
create table if not exists case_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id),
  event_type text not null,
  description text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_events_case_created on case_events(case_id, created_at desc);
create index if not exists idx_events_tenant on case_events(tenant_id);

-- 12. case_assignments (user-case role mapping)
create table if not exists case_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id),
  user_id uuid not null references profiles(id),
  role text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_assignments_case on case_assignments(case_id);
create index if not exists idx_assignments_user on case_assignments(user_id);
create unique index if not exists idx_assignments_unique on case_assignments(tenant_id, case_id, user_id);

-- 13. audit_log (append-only)
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_tenant_id on audit_log(tenant_id);
create index if not exists idx_audit_entity on audit_log(entity_type, entity_id);
create index if not exists idx_audit_user_id on audit_log(user_id);

-- 14. invoices (financeiro)
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references clients(id),
  case_id uuid references cases(id),
  number text not null,
  amount_cents bigint not null,
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled')),
  issued_at timestamptz not null default now(),
  due_date timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_invoices_tenant_id on invoices(tenant_id);
create index if not exists idx_invoices_client_id on invoices(client_id);
create index if not exists idx_invoices_status on invoices(status);

-- 15. documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid references cases(id),
  client_id uuid references clients(id),
  title text not null,
  doc_type text not null default 'outro',
  storage_path text not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_documents_tenant_id on documents(tenant_id);
create index if not exists idx_documents_case_id on documents(case_id);

-- updated_at trigger helper
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers to all tables with updated_at
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'tenants','profiles','clients','cases','proceedings','proceeding_movements',
      'deadlines','hearings','communications_log','invoices','documents'
    ])
  loop
    execute format(
      'drop trigger if exists trg_%s_updated on %s; create trigger trg_%s_updated before update on %s for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end$$;
