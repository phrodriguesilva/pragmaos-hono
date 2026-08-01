-- RLS policies for PragmaOS MVP.
-- Every tenant-scoped table enforces isolation by tenant_id.
-- The app uses the service role key (bypasses RLS) and filters by tenant_id
-- from the session user. RLS is a defense-in-depth layer.

-- Helper: a function returning the tenant_id of the current authenticated user.
-- Placed in public schema (no permission to create in auth schema via MCP).
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- Enable RLS on all tenant-scoped tables.
alter table profiles enable row level security;
alter table clients enable row level security;
alter table cases enable row level security;
alter table proceedings enable row level security;
alter table proceeding_movements enable row level security;
alter table deadlines enable row level security;
alter table hearings enable row level security;
alter table communications_log enable row level security;
alter table case_summaries enable row level security;
alter table case_events enable row level security;
alter table case_assignments enable row level security;
alter table audit_log enable row level security;
alter table invoices enable row level security;
alter table documents enable row level security;

-- profiles: a user can see only profiles in their own tenant.
create policy "profiles_tenant_isolation_select" on profiles
  for select using (tenant_id = public.current_tenant_id());
create policy "profiles_tenant_isolation_modify" on profiles
  for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- Generic policy template applied to every tenant-scoped table:
-- select/insert/update/delete only where tenant_id matches the user's tenant.
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'clients','cases','proceedings','proceeding_movements','deadlines',
      'hearings','communications_log','case_summaries','case_events',
      'case_assignments','audit_log','invoices','documents'
    ])
  loop
    execute format('create policy "%1$s_tenant_select" on %1$I for select using (tenant_id = public.current_tenant_id());', tbl);
    execute format('create policy "%1$s_tenant_insert" on %1$I for insert with check (tenant_id = public.current_tenant_id());', tbl);
    execute format('create policy "%1$s_tenant_update" on %1$I for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());', tbl);
    execute format('create policy "%1$s_tenant_delete" on %1$I for delete using (tenant_id = public.current_tenant_id());', tbl);
  end loop;
end$$;
