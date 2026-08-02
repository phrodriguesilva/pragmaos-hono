-- 0021_tenant_pix_settings.sql
-- Add PIX key and merchant city to tenants table for per-tenant BR Code generation.
-- Previously the PIX key was hardcoded to "pragmaos@pragmaos.com.br" in billing.tsx.

alter table tenants
  add column if not exists pix_key text,
  add column if not exists pix_merchant_name text,
  add column if not exists pix_merchant_city text;

comment on column tenants.pix_key is 'Chave PIX do escritorio para recebimento de faturas (CPF, CNPJ, email, telefone ou chave aleatoria).';
comment on column tenants.pix_merchant_name is 'Nome do recebedor para o BR Code PIX (max 25 chars).';
comment on column tenants.pix_merchant_city is 'Cidade do recebedor para o BR Code PIX (max 15 chars).';

-- Enable RLS on tenants (was the only table without RLS).
alter table tenants enable row level security;

-- Users can read their own tenant's data.
create policy "tenants_select_own" on tenants
  for select to authenticated
  using (
    id in (select tenant_id from profiles where id = auth.uid())
  );

-- Only socios can update tenant settings.
create policy "tenants_update_own" on tenants
  for update to authenticated
  using (
    id in (
      select tenant_id from profiles
      where id = auth.uid() and role = 'socio'
    )
  );
