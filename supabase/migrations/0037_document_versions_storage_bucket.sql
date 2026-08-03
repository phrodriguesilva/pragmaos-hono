-- Migration 0037: Create document-versions storage bucket with RLS
-- The document-versions bucket is referenced in src/lib/document-versions.ts
-- but was never created in any migration.

insert into storage.buckets (id, name, public)
values ('document-versions', 'document-versions', false)
on conflict (id) do nothing;

-- RLS policies for document-versions bucket (same pattern as documents bucket).
alter table storage.objects enable row level security;

-- Allow authenticated users to read objects in their tenant's folder.
-- Folder structure: {tenantId}/{documentId}/v{versionNum}/{filename}
create policy "tenant_read_document_versions"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'document-versions'
    and (storage.foldername(name))[1] in (
      select tenants.id::text from tenants
      inner join profiles on profiles.tenant_id = tenants.id
      where profiles.id = auth.uid()
    )
  );

-- Allow authenticated users to upload to their tenant's folder.
create policy "tenant_write_document_versions"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'document-versions'
    and (storage.foldername(name))[1] in (
      select tenants.id::text from tenants
      inner join profiles on profiles.tenant_id = tenants.id
      where profiles.id = auth.uid()
    )
  );

-- Allow authenticated users to delete from their tenant's folder.
create policy "tenant_delete_document_versions"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'document-versions'
    and (storage.foldername(name))[1] in (
      select tenants.id::text from tenants
      inner join profiles on profiles.tenant_id = tenants.id
      where profiles.id = auth.uid()
    )
  );
