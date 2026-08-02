-- 0010_storage_bucket.sql
-- Create Supabase Storage bucket for document/file uploads.
-- Files are organized by tenant_id folder for isolation.

-- Create the documents bucket (private — access via signed URLs or service role).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- RLS: allow authenticated users to manage objects in the documents bucket.
-- The service role key bypasses RLS, so server-side uploads work regardless.
-- These policies allow client-side uploads too (if needed in the future).
create policy "Allow authenticated uploads to documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "Allow authenticated reads from documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

create policy "Allow authenticated updates to documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents');

create policy "Allow authenticated deletes from documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');
