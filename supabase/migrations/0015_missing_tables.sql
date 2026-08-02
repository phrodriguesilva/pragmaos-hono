-- Migration 0015: Create all tables referenced in code but missing from migrations.
-- These tables already exist in the production Supabase instance (created manually).
-- This migration makes the schema reproducible from scratch.
-- All tenant-scoped tables get RLS enabled with tenant isolation policies.
-- PragmaOS 2 — full schema recovery.

-- ============================================================
-- 1. honorarios (fees / billables)
-- ============================================================
create table if not exists honorarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid references cases(id),
  client_id uuid not null references clients(id),
  description text not null,
  type text not null default 'fee',
  amount_cents bigint not null default 0,
  status text not null default 'pending',
  due_date timestamptz,
  paid_at timestamptz,
  installments integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. tasks
-- ============================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text not null,
  description text,
  case_id uuid references cases(id),
  client_id uuid references clients(id),
  assigned_to uuid references profiles(id),
  status text not null default 'todo',
  priority integer not null default 3,
  due_date timestamptz,
  checklist jsonb not null default '[]'::jsonb,
  time_spent_minutes integer not null default 0,
  billable boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 3. leads
-- ============================================================
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  phone text,
  whatsapp text,
  email text,
  origin text not null default 'manual',
  status text not null default 'new',
  area_of_interest text,
  notes text,
  assigned_to uuid references profiles(id),
  converted_client_id uuid references clients(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 4. workflows
-- ============================================================
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  description text,
  trigger_type text not null default 'manual',
  trigger_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 5. workflow_steps
-- ============================================================
create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  workflow_id uuid not null references workflows(id) on delete cascade,
  step_order integer not null default 0,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. workflow_executions
-- ============================================================
create table if not exists workflow_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  workflow_id uuid not null references workflows(id) on delete cascade,
  entity_type text not null default 'manual',
  entity_id uuid,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  steps_completed integer not null default 0,
  steps_total integer not null default 0
);

-- ============================================================
-- 7. companies
-- ============================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  cnpj text,
  email text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 8. company_representatives
-- ============================================================
create table if not exists company_representatives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  cpf text,
  email text,
  phone text,
  role text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 9. teams
-- ============================================================
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  description text,
  leader_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 10. team_members
-- ============================================================
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id),
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (tenant_id, team_id, user_id)
);

-- ============================================================
-- 11. time_entries
-- ============================================================
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  case_id uuid references cases(id),
  task_id uuid references tasks(id),
  description text not null,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer not null default 0,
  billable boolean not null default false,
  hourly_rate_cents integer,
  invoiced boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 12. case_parties
-- ============================================================
create table if not exists case_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id) on delete cascade,
  party_type text not null,
  name text not null,
  document text,
  role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 13. case_risk
-- ============================================================
create table if not exists case_risk (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null references cases(id) on delete cascade,
  win_probability integer,
  loss_probability integer,
  probable_value_cents bigint,
  provision_cents bigint,
  risk_notes text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, case_id)
);

-- ============================================================
-- 14. ai_conversations
-- ============================================================
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  case_id uuid references cases(id),
  title text not null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 15. ai_messages
-- ============================================================
create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null,
  content text not null,
  tokens_used integer,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 16. ai_summaries
-- ============================================================
create table if not exists ai_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  case_id uuid references cases(id),
  summary_type text not null,
  target_id uuid,
  summary_text text not null,
  model text,
  tokens_used integer,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 17. ai_interactions
-- ============================================================
create table if not exists ai_interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  case_id uuid references cases(id),
  interaction_type text not null,
  input_text text,
  output_text text,
  model text,
  tokens_used integer,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 18. jurisprudence_searches
-- ============================================================
create table if not exists jurisprudence_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  query text not null,
  results jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 19. ai_petitions
-- ============================================================
create table if not exists ai_petitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references profiles(id),
  case_id uuid references cases(id),
  petition_type text not null,
  input_data jsonb,
  generated_text text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 20. user_totp
-- ============================================================
create table if not exists user_totp (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  user_id uuid not null references profiles(id) on delete cascade,
  secret text not null,
  enabled boolean not null default false,
  backup_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ============================================================
-- 21. auth_logs
-- ============================================================
create table if not exists auth_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  user_id uuid references profiles(id),
  email text,
  event_type text not null,
  ip_address text,
  user_agent text,
  success boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 22. password_resets
-- ============================================================
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  email text not null,
  token text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 23. client_sessions
-- ============================================================
create table if not exists client_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references clients(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 24. client_portal_access
-- ============================================================
create table if not exists client_portal_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references clients(id) on delete cascade,
  email text not null,
  password_hash text,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- ============================================================
-- 25. client_messages
-- ============================================================
create table if not exists client_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  client_id uuid not null references clients(id) on delete cascade,
  case_id uuid references cases(id),
  direction text not null default 'outbound',
  subject text,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 26. chat_channels
-- ============================================================
create table if not exists chat_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  case_id uuid references cases(id),
  type text not null default 'group',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 27. chat_channel_members
-- ============================================================
create table if not exists chat_channel_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  channel_id uuid not null references chat_channels(id) on delete cascade,
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, channel_id, user_id)
);

-- ============================================================
-- 28. chat_messages
-- ============================================================
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  channel_id uuid not null references chat_channels(id) on delete cascade,
  user_id uuid not null references profiles(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 29. roles
-- ============================================================
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

-- ============================================================
-- 30. role_permissions
-- ============================================================
create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  role_id uuid not null references roles(id) on delete cascade,
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_id, module)
);

-- ============================================================
-- 31. expenses
-- ============================================================
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid references cases(id),
  description text not null,
  amount_cents bigint not null default 0,
  status text not null default 'pending',
  category text,
  due_date timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 32. bank_accounts
-- ============================================================
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  bank text,
  agency text,
  account text,
  balance_cents bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 33. chart_of_accounts
-- ============================================================
create table if not exists chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  name text not null,
  type text not null,
  parent_id uuid references chart_of_accounts(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ============================================================
-- 34. cost_centers
-- ============================================================
create table if not exists cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  code text,
  parent_id uuid references cost_centers(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_honorarios_tenant on honorarios(tenant_id);
create index if not exists idx_honorarios_client on honorarios(client_id);
create index if not exists idx_honorarios_case on honorarios(case_id);
create index if not exists idx_honorarios_status on honorarios(status);

create index if not exists idx_tasks_tenant on tasks(tenant_id);
create index if not exists idx_tasks_case on tasks(case_id);
create index if not exists idx_tasks_assigned on tasks(assigned_to);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_due_date on tasks(due_date);

create index if not exists idx_leads_tenant on leads(tenant_id);
create index if not exists idx_leads_status on leads(status);

create index if not exists idx_workflows_tenant on workflows(tenant_id);
create index if not exists idx_workflows_active on workflows(active);

create index if not exists idx_workflow_steps_workflow on workflow_steps(workflow_id);
create index if not exists idx_workflow_steps_tenant on workflow_steps(tenant_id);

create index if not exists idx_workflow_executions_workflow on workflow_executions(workflow_id);
create index if not exists idx_workflow_executions_tenant on workflow_executions(tenant_id);
create index if not exists idx_workflow_executions_status on workflow_executions(status);

create index if not exists idx_companies_tenant on companies(tenant_id);

create index if not exists idx_company_reps_company on company_representatives(company_id);
create index if not exists idx_company_reps_tenant on company_representatives(tenant_id);

create index if not exists idx_teams_tenant on teams(tenant_id);

create index if not exists idx_team_members_team on team_members(team_id);
create index if not exists idx_team_members_tenant on team_members(tenant_id);
create index if not exists idx_team_members_user on team_members(user_id);

create index if not exists idx_time_entries_tenant on time_entries(tenant_id);
create index if not exists idx_time_entries_user on time_entries(user_id);
create index if not exists idx_time_entries_case on time_entries(case_id);
create index if not exists idx_time_entries_task on time_entries(task_id);

create index if not exists idx_case_parties_tenant on case_parties(tenant_id);
create index if not exists idx_case_parties_case on case_parties(case_id);

create index if not exists idx_case_risk_tenant on case_risk(tenant_id);
create index if not exists idx_case_risk_case on case_risk(case_id);

create index if not exists idx_ai_conversations_tenant on ai_conversations(tenant_id);
create index if not exists idx_ai_conversations_user on ai_conversations(user_id);

create index if not exists idx_ai_messages_tenant on ai_messages(tenant_id);
create index if not exists idx_ai_messages_conversation on ai_messages(conversation_id);

create index if not exists idx_ai_summaries_tenant on ai_summaries(tenant_id);
create index if not exists idx_ai_summaries_user on ai_summaries(user_id);

create index if not exists idx_ai_interactions_tenant on ai_interactions(tenant_id);
create index if not exists idx_ai_interactions_user on ai_interactions(user_id);

create index if not exists idx_jurisprudence_tenant on jurisprudence_searches(tenant_id);
create index if not exists idx_jurisprudence_user on jurisprudence_searches(user_id);

create index if not exists idx_ai_petitions_tenant on ai_petitions(tenant_id);
create index if not exists idx_ai_petitions_user on ai_petitions(user_id);

create index if not exists idx_user_totp_user on user_totp(user_id);

create index if not exists idx_auth_logs_tenant on auth_logs(tenant_id);
create index if not exists idx_auth_logs_user on auth_logs(user_id);
create index if not exists idx_auth_logs_email on auth_logs(email);
create index if not exists idx_auth_logs_created on auth_logs(created_at);

create index if not exists idx_password_resets_email on password_resets(email);
create index if not exists idx_password_resets_token on password_resets(token);
create index if not exists idx_password_resets_expires on password_resets(expires_at);

create index if not exists idx_client_sessions_tenant on client_sessions(tenant_id);
create index if not exists idx_client_sessions_client on client_sessions(client_id);
create index if not exists idx_client_sessions_token on client_sessions(token);

create index if not exists idx_client_portal_access_tenant on client_portal_access(tenant_id);
create index if not exists idx_client_portal_access_client on client_portal_access(client_id);

create index if not exists idx_client_messages_tenant on client_messages(tenant_id);
create index if not exists idx_client_messages_client on client_messages(client_id);
create index if not exists idx_client_messages_case on client_messages(case_id);
create index if not exists idx_client_messages_read on client_messages(read);

create index if not exists idx_chat_channels_tenant on chat_channels(tenant_id);
create index if not exists idx_chat_channels_case on chat_channels(case_id);

create index if not exists idx_chat_members_tenant on chat_channel_members(tenant_id);
create index if not exists idx_chat_members_channel on chat_channel_members(channel_id);
create index if not exists idx_chat_members_user on chat_channel_members(user_id);

create index if not exists idx_chat_messages_tenant on chat_messages(tenant_id);
create index if not exists idx_chat_messages_channel on chat_messages(channel_id);

create index if not exists idx_roles_tenant on roles(tenant_id);

create index if not exists idx_role_permissions_tenant on role_permissions(tenant_id);
create index if not exists idx_role_permissions_role on role_permissions(role_id);

create index if not exists idx_expenses_tenant on expenses(tenant_id);
create index if not exists idx_expenses_case on expenses(case_id);
create index if not exists idx_expenses_status on expenses(status);

create index if not exists idx_bank_accounts_tenant on bank_accounts(tenant_id);

create index if not exists idx_chart_of_accounts_tenant on chart_of_accounts(tenant_id);

create index if not exists idx_cost_centers_tenant on cost_centers(tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table honorarios enable row level security;
alter table tasks enable row level security;
alter table leads enable row level security;
alter table workflows enable row level security;
alter table workflow_steps enable row level security;
alter table workflow_executions enable row level security;
alter table companies enable row level security;
alter table company_representatives enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table time_entries enable row level security;
alter table case_parties enable row level security;
alter table case_risk enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table ai_summaries enable row level security;
alter table ai_interactions enable row level security;
alter table jurisprudence_searches enable row level security;
alter table ai_petitions enable row level security;
alter table user_totp enable row level security;
alter table auth_logs enable row level security;
alter table password_resets enable row level security;
alter table client_sessions enable row level security;
alter table client_portal_access enable row level security;
alter table client_messages enable row level security;
alter table chat_channels enable row level security;
alter table chat_channel_members enable row level security;
alter table chat_messages enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table expenses enable row level security;
alter table bank_accounts enable row level security;
alter table chart_of_accounts enable row level security;
alter table cost_centers enable row level security;

-- ============================================================
-- RLS POLICIES (tenant isolation via current_tenant_id())
-- ============================================================

create policy "honorarios_tenant_select" on honorarios for select using (tenant_id = public.current_tenant_id());
create policy "honorarios_tenant_insert" on honorarios for insert with check (tenant_id = public.current_tenant_id());
create policy "honorarios_tenant_update" on honorarios for update using (tenant_id = public.current_tenant_id());
create policy "honorarios_tenant_delete" on honorarios for delete using (tenant_id = public.current_tenant_id());

create policy "tasks_tenant_select" on tasks for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "tasks_tenant_insert" on tasks for insert with check (tenant_id = public.current_tenant_id());
create policy "tasks_tenant_update" on tasks for update using (tenant_id = public.current_tenant_id());
create policy "tasks_tenant_delete" on tasks for delete using (tenant_id = public.current_tenant_id());

create policy "leads_tenant_select" on leads for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "leads_tenant_insert" on leads for insert with check (tenant_id = public.current_tenant_id());
create policy "leads_tenant_update" on leads for update using (tenant_id = public.current_tenant_id());
create policy "leads_tenant_delete" on leads for delete using (tenant_id = public.current_tenant_id());

create policy "workflows_tenant_select" on workflows for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "workflows_tenant_insert" on workflows for insert with check (tenant_id = public.current_tenant_id());
create policy "workflows_tenant_update" on workflows for update using (tenant_id = public.current_tenant_id());
create policy "workflows_tenant_delete" on workflows for delete using (tenant_id = public.current_tenant_id());

create policy "workflow_steps_tenant_select" on workflow_steps for select using (tenant_id = public.current_tenant_id());
create policy "workflow_steps_tenant_insert" on workflow_steps for insert with check (tenant_id = public.current_tenant_id());
create policy "workflow_steps_tenant_update" on workflow_steps for update using (tenant_id = public.current_tenant_id());
create policy "workflow_steps_tenant_delete" on workflow_steps for delete using (tenant_id = public.current_tenant_id());

create policy "workflow_executions_tenant_select" on workflow_executions for select using (tenant_id = public.current_tenant_id());
create policy "workflow_executions_tenant_insert" on workflow_executions for insert with check (tenant_id = public.current_tenant_id());
create policy "workflow_executions_tenant_update" on workflow_executions for update using (tenant_id = public.current_tenant_id());
create policy "workflow_executions_tenant_delete" on workflow_executions for delete using (tenant_id = public.current_tenant_id());

create policy "companies_tenant_select" on companies for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "companies_tenant_insert" on companies for insert with check (tenant_id = public.current_tenant_id());
create policy "companies_tenant_update" on companies for update using (tenant_id = public.current_tenant_id());
create policy "companies_tenant_delete" on companies for delete using (tenant_id = public.current_tenant_id());

create policy "company_reps_tenant_select" on company_representatives for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "company_reps_tenant_insert" on company_representatives for insert with check (tenant_id = public.current_tenant_id());
create policy "company_reps_tenant_update" on company_representatives for update using (tenant_id = public.current_tenant_id());
create policy "company_reps_tenant_delete" on company_representatives for delete using (tenant_id = public.current_tenant_id());

create policy "teams_tenant_select" on teams for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "teams_tenant_insert" on teams for insert with check (tenant_id = public.current_tenant_id());
create policy "teams_tenant_update" on teams for update using (tenant_id = public.current_tenant_id());
create policy "teams_tenant_delete" on teams for delete using (tenant_id = public.current_tenant_id());

create policy "team_members_tenant_select" on team_members for select using (tenant_id = public.current_tenant_id());
create policy "team_members_tenant_insert" on team_members for insert with check (tenant_id = public.current_tenant_id());
create policy "team_members_tenant_update" on team_members for update using (tenant_id = public.current_tenant_id());
create policy "team_members_tenant_delete" on team_members for delete using (tenant_id = public.current_tenant_id());

create policy "time_entries_tenant_select" on time_entries for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "time_entries_tenant_insert" on time_entries for insert with check (tenant_id = public.current_tenant_id());
create policy "time_entries_tenant_update" on time_entries for update using (tenant_id = public.current_tenant_id());
create policy "time_entries_tenant_delete" on time_entries for delete using (tenant_id = public.current_tenant_id());

create policy "case_parties_tenant_select" on case_parties for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "case_parties_tenant_insert" on case_parties for insert with check (tenant_id = public.current_tenant_id());
create policy "case_parties_tenant_update" on case_parties for update using (tenant_id = public.current_tenant_id());
create policy "case_parties_tenant_delete" on case_parties for delete using (tenant_id = public.current_tenant_id());

create policy "case_risk_tenant_select" on case_risk for select using (tenant_id = public.current_tenant_id());
create policy "case_risk_tenant_insert" on case_risk for insert with check (tenant_id = public.current_tenant_id());
create policy "case_risk_tenant_update" on case_risk for update using (tenant_id = public.current_tenant_id());
create policy "case_risk_tenant_delete" on case_risk for delete using (tenant_id = public.current_tenant_id());

create policy "ai_conversations_tenant_select" on ai_conversations for select using (tenant_id = public.current_tenant_id());
create policy "ai_conversations_tenant_insert" on ai_conversations for insert with check (tenant_id = public.current_tenant_id());
create policy "ai_conversations_tenant_update" on ai_conversations for update using (tenant_id = public.current_tenant_id());
create policy "ai_conversations_tenant_delete" on ai_conversations for delete using (tenant_id = public.current_tenant_id());

create policy "ai_messages_tenant_select" on ai_messages for select using (tenant_id = public.current_tenant_id());
create policy "ai_messages_tenant_insert" on ai_messages for insert with check (tenant_id = public.current_tenant_id());
create policy "ai_messages_tenant_update" on ai_messages for update using (tenant_id = public.current_tenant_id());
create policy "ai_messages_tenant_delete" on ai_messages for delete using (tenant_id = public.current_tenant_id());

create policy "ai_summaries_tenant_select" on ai_summaries for select using (tenant_id = public.current_tenant_id());
create policy "ai_summaries_tenant_insert" on ai_summaries for insert with check (tenant_id = public.current_tenant_id());
create policy "ai_summaries_tenant_update" on ai_summaries for update using (tenant_id = public.current_tenant_id());
create policy "ai_summaries_tenant_delete" on ai_summaries for delete using (tenant_id = public.current_tenant_id());

create policy "ai_interactions_tenant_select" on ai_interactions for select using (tenant_id = public.current_tenant_id());
create policy "ai_interactions_tenant_insert" on ai_interactions for insert with check (tenant_id = public.current_tenant_id());
create policy "ai_interactions_tenant_update" on ai_interactions for update using (tenant_id = public.current_tenant_id());
create policy "ai_interactions_tenant_delete" on ai_interactions for delete using (tenant_id = public.current_tenant_id());

create policy "jurisprudence_tenant_select" on jurisprudence_searches for select using (tenant_id = public.current_tenant_id());
create policy "jurisprudence_tenant_insert" on jurisprudence_searches for insert with check (tenant_id = public.current_tenant_id());
create policy "jurisprudence_tenant_update" on jurisprudence_searches for update using (tenant_id = public.current_tenant_id());
create policy "jurisprudence_tenant_delete" on jurisprudence_searches for delete using (tenant_id = public.current_tenant_id());

create policy "ai_petitions_tenant_select" on ai_petitions for select using (tenant_id = public.current_tenant_id());
create policy "ai_petitions_tenant_insert" on ai_petitions for insert with check (tenant_id = public.current_tenant_id());
create policy "ai_petitions_tenant_update" on ai_petitions for update using (tenant_id = public.current_tenant_id());
create policy "ai_petitions_tenant_delete" on ai_petitions for delete using (tenant_id = public.current_tenant_id());

create policy "user_totp_tenant_select" on user_totp for select using (tenant_id = public.current_tenant_id());
create policy "user_totp_tenant_insert" on user_totp for insert with check (tenant_id = public.current_tenant_id());
create policy "user_totp_tenant_update" on user_totp for update using (tenant_id = public.current_tenant_id());
create policy "user_totp_tenant_delete" on user_totp for delete using (tenant_id = public.current_tenant_id());

-- auth_logs and password_resets: allow insert without tenant (pre-auth events)
create policy "auth_logs_tenant_select" on auth_logs for select using (tenant_id = public.current_tenant_id() or tenant_id is null);
create policy "auth_logs_tenant_insert" on auth_logs for insert with check (true);
create policy "auth_logs_tenant_update" on auth_logs for update using (tenant_id = public.current_tenant_id());
create policy "auth_logs_tenant_delete" on auth_logs for delete using (tenant_id = public.current_tenant_id());

create policy "password_resets_tenant_select" on password_resets for select using (tenant_id = public.current_tenant_id() or tenant_id is null);
create policy "password_resets_tenant_insert" on password_resets for insert with check (true);
create policy "password_resets_tenant_update" on password_resets for update using (tenant_id = public.current_tenant_id() or tenant_id is null);
create policy "password_resets_tenant_delete" on password_resets for delete using (tenant_id = public.current_tenant_id() or tenant_id is null);

create policy "client_sessions_tenant_select" on client_sessions for select using (tenant_id = public.current_tenant_id());
create policy "client_sessions_tenant_insert" on client_sessions for insert with check (tenant_id = public.current_tenant_id());
create policy "client_sessions_tenant_update" on client_sessions for update using (tenant_id = public.current_tenant_id());
create policy "client_sessions_tenant_delete" on client_sessions for delete using (tenant_id = public.current_tenant_id());

create policy "client_portal_access_tenant_select" on client_portal_access for select using (tenant_id = public.current_tenant_id());
create policy "client_portal_access_tenant_insert" on client_portal_access for insert with check (tenant_id = public.current_tenant_id());
create policy "client_portal_access_tenant_update" on client_portal_access for update using (tenant_id = public.current_tenant_id());
create policy "client_portal_access_tenant_delete" on client_portal_access for delete using (tenant_id = public.current_tenant_id());

create policy "client_messages_tenant_select" on client_messages for select using (tenant_id = public.current_tenant_id());
create policy "client_messages_tenant_insert" on client_messages for insert with check (tenant_id = public.current_tenant_id());
create policy "client_messages_tenant_update" on client_messages for update using (tenant_id = public.current_tenant_id());
create policy "client_messages_tenant_delete" on client_messages for delete using (tenant_id = public.current_tenant_id());

create policy "chat_channels_tenant_select" on chat_channels for select using (tenant_id = public.current_tenant_id());
create policy "chat_channels_tenant_insert" on chat_channels for insert with check (tenant_id = public.current_tenant_id());
create policy "chat_channels_tenant_update" on chat_channels for update using (tenant_id = public.current_tenant_id());
create policy "chat_channels_tenant_delete" on chat_channels for delete using (tenant_id = public.current_tenant_id());

create policy "chat_members_tenant_select" on chat_channel_members for select using (tenant_id = public.current_tenant_id());
create policy "chat_members_tenant_insert" on chat_channel_members for insert with check (tenant_id = public.current_tenant_id());
create policy "chat_members_tenant_update" on chat_channel_members for update using (tenant_id = public.current_tenant_id());
create policy "chat_members_tenant_delete" on chat_channel_members for delete using (tenant_id = public.current_tenant_id());

create policy "chat_messages_tenant_select" on chat_messages for select using (tenant_id = public.current_tenant_id());
create policy "chat_messages_tenant_insert" on chat_messages for insert with check (tenant_id = public.current_tenant_id());
create policy "chat_messages_tenant_update" on chat_messages for update using (tenant_id = public.current_tenant_id());
create policy "chat_messages_tenant_delete" on chat_messages for delete using (tenant_id = public.current_tenant_id());

create policy "roles_tenant_select" on roles for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "roles_tenant_insert" on roles for insert with check (tenant_id = public.current_tenant_id());
create policy "roles_tenant_update" on roles for update using (tenant_id = public.current_tenant_id());
create policy "roles_tenant_delete" on roles for delete using (tenant_id = public.current_tenant_id());

create policy "role_permissions_tenant_select" on role_permissions for select using (tenant_id = public.current_tenant_id());
create policy "role_permissions_tenant_insert" on role_permissions for insert with check (tenant_id = public.current_tenant_id());
create policy "role_permissions_tenant_update" on role_permissions for update using (tenant_id = public.current_tenant_id());
create policy "role_permissions_tenant_delete" on role_permissions for delete using (tenant_id = public.current_tenant_id());

create policy "expenses_tenant_select" on expenses for select using (tenant_id = public.current_tenant_id());
create policy "expenses_tenant_insert" on expenses for insert with check (tenant_id = public.current_tenant_id());
create policy "expenses_tenant_update" on expenses for update using (tenant_id = public.current_tenant_id());
create policy "expenses_tenant_delete" on expenses for delete using (tenant_id = public.current_tenant_id());

create policy "bank_accounts_tenant_select" on bank_accounts for select using (tenant_id = public.current_tenant_id());
create policy "bank_accounts_tenant_insert" on bank_accounts for insert with check (tenant_id = public.current_tenant_id());
create policy "bank_accounts_tenant_update" on bank_accounts for update using (tenant_id = public.current_tenant_id());
create policy "bank_accounts_tenant_delete" on bank_accounts for delete using (tenant_id = public.current_tenant_id());

create policy "chart_of_accounts_tenant_select" on chart_of_accounts for select using (tenant_id = public.current_tenant_id());
create policy "chart_of_accounts_tenant_insert" on chart_of_accounts for insert with check (tenant_id = public.current_tenant_id());
create policy "chart_of_accounts_tenant_update" on chart_of_accounts for update using (tenant_id = public.current_tenant_id());
create policy "chart_of_accounts_tenant_delete" on chart_of_accounts for delete using (tenant_id = public.current_tenant_id());

create policy "cost_centers_tenant_select" on cost_centers for select using (tenant_id = public.current_tenant_id() and deleted_at is null);
create policy "cost_centers_tenant_insert" on cost_centers for insert with check (tenant_id = public.current_tenant_id());
create policy "cost_centers_tenant_update" on cost_centers for update using (tenant_id = public.current_tenant_id());
create policy "cost_centers_tenant_delete" on cost_centers for delete using (tenant_id = public.current_tenant_id());

-- ============================================================
-- UPDATED_AT TRIGGERS (for tables with updated_at)
-- Uses the existing public.set_updated_at() function from migration 0001.
-- ============================================================
create trigger trg_honorarios_updated_at before update on honorarios for each row execute function public.set_updated_at();
create trigger trg_tasks_updated_at before update on tasks for each row execute function public.set_updated_at();
create trigger trg_leads_updated_at before update on leads for each row execute function public.set_updated_at();
create trigger trg_workflows_updated_at before update on workflows for each row execute function public.set_updated_at();
create trigger trg_companies_updated_at before update on companies for each row execute function public.set_updated_at();
create trigger trg_teams_updated_at before update on teams for each row execute function public.set_updated_at();
create trigger trg_time_entries_updated_at before update on time_entries for each row execute function public.set_updated_at();
create trigger trg_case_parties_updated_at before update on case_parties for each row execute function public.set_updated_at();
create trigger trg_case_risk_updated_at before update on case_risk for each row execute function public.set_updated_at();
create trigger trg_ai_conversations_updated_at before update on ai_conversations for each row execute function public.set_updated_at();
create trigger trg_user_totp_updated_at before update on user_totp for each row execute function public.set_updated_at();
create trigger trg_client_portal_access_updated_at before update on client_portal_access for each row execute function public.set_updated_at();
create trigger trg_roles_updated_at before update on roles for each row execute function public.set_updated_at();
create trigger trg_expenses_updated_at before update on expenses for each row execute function public.set_updated_at();
create trigger trg_bank_accounts_updated_at before update on bank_accounts for each row execute function public.set_updated_at();

-- ============================================================
-- UNIQUE CONSTRAINTS (data integrity — missing on existing tables)
-- ============================================================
create unique index if not exists idx_proceedings_tenant_cnj on proceedings(tenant_id, cnj_number) where cnj_number is not null;
create unique index if not exists idx_invoices_tenant_number on invoices(tenant_id, number) where number is not null;
create unique index if not exists idx_clients_tenant_cpf on clients(tenant_id, cpf) where cpf is not null;
create unique index if not exists idx_clients_tenant_cnpj on clients(tenant_id, cnpj) where cnpj is not null;
create unique index if not exists idx_email_accounts_tenant_email on email_accounts(tenant_id, email);
create unique index if not exists idx_companies_tenant_cnpj on companies(tenant_id, cnpj) where cnpj is not null;
