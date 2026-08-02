-- =========================================================================
-- 0030 — Platform admin sem tenant (tenant_id nullable)
--
-- O superadmin (is_platform_admin = true) NAO deve pertencer a nenhum tenant.
-- Ele enxerga TODOS os tenants de forma macro no /back-office.
-- Antes, o tenant_id era NOT NULL, o que forçava o superadmin a ser
-- atrelado ao tenant de alguém — um erro grave de segurança.
--
-- Mudanças:
-- 1. Tornar profiles.tenant_id nullable
-- 2. Constraint: tenant_id NOT NULL OU is_platform_admin = true
-- 3. Unique constraint que lida com NULL tenant_id
-- 4. current_tenant_id() retorna NULL para platform admins
-- 5. RLS: platform admins não filtram por tenant (já têm policies próprias)
-- =========================================================================

-- 1. Tornar tenant_id nullable
alter table profiles alter column tenant_id drop not null;

-- 2. Constraint: ou tem tenant, ou é platform admin
-- (não pode ser tenantless sem ser platform admin)
drop constraint if exists profiles_tenant_or_admin_check;
alter table profiles
  add constraint profiles_tenant_or_admin_check
  check (tenant_id is not null or is_platform_admin = true);

-- 3. Unique constraint: (tenant_id, email)
-- O Postgres trata NULL como distinto, então (NULL, 'email@x.com') não
-- conflita com outro (NULL, 'email@x.com'). Mas para garantir unicidade
-- do email entre platform admins, usamos uma partial unique index.
drop constraint if exists profiles_tenant_id_email_key;
alter table profiles drop constraint if exists profiles_tenant_id_email_key;

-- Unique para tenant users (tenant_id não nulo)
create unique index if not exists profiles_tenant_email_unique
  on profiles(tenant_id, email)
  where tenant_id is not null;

-- Unique para platform admins (email único entre admins)
create unique index if not exists profiles_admin_email_unique
  on profiles(email)
  where tenant_id is null and is_platform_admin = true;

-- 4. current_tenant_id() retorna NULL para platform admins
-- (eles não têm tenant, usam service role que bypassa RLS)
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- 5. Atualizar RLS: profiles_tenant_isolation deve permitir platform admins
--    verem todos os profiles (já têm policy própria, mas a isolation policy
--    com current_tenant_id() NULL não bloquearia mesmo assim).
--    As policies existentes de platform_admin (0027) já cobrem isso.

-- 6. Remover o superadmin do tenant dele (se existir um platform admin
--    atrelado a um tenant, desvincular).
--    ATENÇÃO: Rodar manualmente com o email/id do superadmin:
--    update profiles set tenant_id = null where is_platform_admin = true;
--    (Não rodamos aqui automaticamente para evitar surpresas.)
