-- 0011_document_templates.sql
-- Create the document_templates table (referenced in code but missing from migrations).
-- Templates are reusable document patterns with {{variable}} placeholders.

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  doc_type text not null default 'outro' check (doc_type in ('peticao','procuracao','contrato','sentenca','acordao','declaracao','recibo','outro')),
  content text not null default '',
  variables text[] default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_document_templates_tenant on document_templates(tenant_id);
create index if not exists idx_document_templates_doc_type on document_templates(doc_type);

-- Enable RLS.
alter table document_templates enable row level security;

-- Policy: users can only see/manage templates in their own tenant.
create policy "Tenant isolation for document_templates"
  on document_templates for all
  using (tenant_id = (select auth.uid() is not null));
