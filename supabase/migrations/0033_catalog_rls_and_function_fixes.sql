-- 0033_catalog_rls_and_function_fixes.sql
-- Enable RLS on shared catalog tables to prevent unauthorized modification.
-- Add SECURITY DEFINER to storage_tenant_id() for consistency with other RLS helper functions.

-- ============================================================
-- 1. consulta_types: enable RLS (read-only for authenticated)
-- ============================================================
alter table consulta_types enable row level security;

-- Allow all authenticated users to read catalog data.
create policy "consulta_types_select_all" on consulta_types
  for select to authenticated using (true);

-- No INSERT/UPDATE/DELETE policies = blocked for authenticated users.
-- Only service role (which bypasses RLS) can modify catalog data.

-- ============================================================
-- 2. storage_tenant_id(): add SECURITY DEFINER for consistency
-- ============================================================
create or replace function public.storage_tenant_id(path text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select split_part(path, '/', 1)::uuid;
$$;

-- ============================================================
-- 3. law_areas: explicitly deny modification (no policies = blocked)
--    RLS already enabled in 0022, SELECT policy already exists.
--    No action needed — missing INSERT/UPDATE/DELETE policies means
--    authenticated users cannot modify. This is the desired behavior.
-- ============================================================

-- ============================================================
-- 4. plans: explicitly deny modification (no policies = blocked)
--    RLS already enabled in 0025, SELECT policy already exists.
--    No action needed — missing INSERT/UPDATE/DELETE policies means
--    authenticated users cannot modify. This is the desired behavior.
-- ============================================================
