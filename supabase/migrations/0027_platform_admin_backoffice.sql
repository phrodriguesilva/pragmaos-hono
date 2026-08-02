-- =========================================================================
-- 0027 — Platform admin (back-office) support
--
-- Adds a `is_platform_admin` flag to profiles so the PragmaOS owner can
-- access the /back-office panel — a cross-tenant admin dashboard for
-- managing all tenants, subscriptions, users, and revenue metrics.
--
-- This flag is NOT tenant-scoped: it grants access to ALL tenants' data
-- via the service-role Supabase client (bypasses RLS).
-- =========================================================================

-- 1. Add platform admin flag to profiles.
alter table profiles
  add column if not exists is_platform_admin boolean not null default false;

-- 2. Index for fast lookup.
create index if not exists idx_profiles_platform_admin
  on profiles(is_platform_admin) where is_platform_admin = true;

-- 3. RLS policy: platform admins can read all profiles (for the user list).
--    The service-role client already bypasses RLS, but this policy ensures
--    that if we ever query with a user JWT, platform admins can see across tenants.
drop policy if exists "profiles_select_platform_admin" on profiles;
create policy "profiles_select_platform_admin"
  on profiles for select
  using (is_platform_admin = true);

-- 4. Audit log table for back-office actions (impersonation, plan changes, etc.)
create table if not exists platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('impersonate','change_plan','suspend_tenant','reactivate_tenant','delete_tenant','update_tenant','create_tenant')),
  target_tenant_id uuid references tenants(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_audit_admin on platform_audit_logs(admin_id);
create index if not exists idx_platform_audit_tenant on platform_audit_logs(target_tenant_id);
create index if not exists idx_platform_audit_created on platform_audit_logs(created_at desc);

-- 5. RLS on platform_audit_logs — only platform admins can read.
alter table platform_audit_logs enable row level security;
drop policy if exists "platform_audit_select_admin" on platform_audit_logs;
create policy "platform_audit_select_admin"
  on platform_audit_logs for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );

-- 6. Enable RLS on platform_audit_logs for insert (service role bypasses, but be explicit).
drop policy if exists "platform_audit_insert_admin" on platform_audit_logs;
create policy "platform_audit_insert_admin"
  on platform_audit_logs for insert
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );

-- 7. Allow platform admins to read ALL tenants (cross-tenant).
drop policy if exists "tenants_select_platform_admin" on tenants;
create policy "tenants_select_platform_admin"
  on tenants for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );

-- 8. Allow platform admins to update tenants (change plan, suspend, etc.).
drop policy if exists "tenants_update_platform_admin" on tenants;
create policy "tenants_update_platform_admin"
  on tenants for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );

-- 9. Allow platform admins to read saas_invoices (cross-tenant).
drop policy if exists "saas_invoices_select_platform_admin" on saas_invoices;
create policy "saas_invoices_select_platform_admin"
  on saas_invoices for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );

-- 10. Allow platform admins to read commercial_leads.
drop policy if exists "commercial_leads_select_platform_admin" on commercial_leads;
create policy "commercial_leads_select_platform_admin"
  on commercial_leads for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );

-- 11. Allow platform admins to update commercial_leads (mark as contacted/converted).
drop policy if exists "commercial_leads_update_platform_admin" on commercial_leads;
create policy "commercial_leads_update_platform_admin"
  on commercial_leads for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin = true)
  );
