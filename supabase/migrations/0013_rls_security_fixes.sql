-- 0013_rls_security_fixes.sql
-- Security audit fixes:
-- 1. Enable RLS on 8 tables that were missing it (0006-0009)
-- 2. Fix broken document_templates policy (0011)
-- 3. Fix diario_* policies that used `using (true)` (0012)
-- 4. Fix storage bucket policies to isolate by tenant_id (0010)

-- ============================================================
-- 1. Enable RLS on tables from migrations 0006-0009
-- ============================================================

alter table integrations enable row level security;
alter table email_accounts enable row level security;
alter table email_messages enable row level security;
alter table signature_requests enable row level security;
alter table signature_webhooks enable row level security;
alter table whatsapp_messages enable row level security;
alter table whatsapp_templates enable row level security;
alter table whatsapp_webhooks enable row level security;

-- integrations: tenant isolation
create policy "integrations_tenant_isolation" on integrations
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- email_accounts: tenant isolation
create policy "email_accounts_tenant_isolation" on email_accounts
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- email_messages: tenant isolation
create policy "email_messages_tenant_isolation" on email_messages
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- signature_requests: tenant isolation
create policy "signature_requests_tenant_isolation" on signature_requests
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- signature_webhooks: tenant isolation
create policy "signature_webhooks_tenant_isolation" on signature_webhooks
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- whatsapp_messages: tenant isolation
create policy "whatsapp_messages_tenant_isolation" on whatsapp_messages
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- whatsapp_templates: tenant isolation
create policy "whatsapp_templates_tenant_isolation" on whatsapp_templates
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- whatsapp_webhooks: tenant isolation
create policy "whatsapp_webhooks_tenant_isolation" on whatsapp_webhooks
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ============================================================
-- 2. Fix broken document_templates policy (0011)
-- Old: tenant_id = (select auth.uid() is not null) — compares UUID with boolean, always wrong
-- ============================================================

drop policy if exists "Tenant isolation for document_templates" on document_templates;

create policy "document_templates_tenant_isolation" on document_templates
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ============================================================
-- 3. Fix diario_* policies that used `using (true)` (0012)
-- ============================================================

drop policy if exists "diario_searches_all" on diario_searches;
drop policy if exists "diario_results_all" on diario_results;

create policy "diario_searches_tenant_isolation" on diario_searches
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "diario_results_tenant_isolation" on diario_results
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ============================================================
-- 4. Fix storage bucket policies to isolate by tenant_id (0010)
-- Files are stored with path: {tenant_id}/{filename}
-- ============================================================

drop policy if exists "Allow authenticated uploads to documents" on storage.objects;
drop policy if exists "Allow authenticated reads from documents" on storage.objects;
drop policy if exists "Allow authenticated updates to documents" on storage.objects;
drop policy if exists "Allow authenticated deletes from documents" on storage.objects;

-- Extract tenant_id from the file path (first folder segment).
-- Storage paths look like: documents/{tenant_id}/{filename}
create or replace function public.storage_tenant_id(path text)
returns uuid
language sql
stable
as $$
  -- Path format: {tenant_id}/{filename} — split on first '/'
  select split_part(path, '/', 1)::uuid;
$$;

create policy "documents_bucket_tenant_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.storage_tenant_id(name) = public.current_tenant_id()
  );

create policy "documents_bucket_tenant_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.storage_tenant_id(name) = public.current_tenant_id()
  );

create policy "documents_bucket_tenant_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and public.storage_tenant_id(name) = public.current_tenant_id()
  )
  with check (
    bucket_id = 'documents'
    and public.storage_tenant_id(name) = public.current_tenant_id()
  );

create policy "documents_bucket_tenant_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.storage_tenant_id(name) = public.current_tenant_id()
  );
