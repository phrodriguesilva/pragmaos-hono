-- =========================================================================
-- 0031 — RLS security fixes (P0)
--
-- 1. profiles: bloquear escalada de privilégio
--    A policy profiles_tenant_isolation_modify (for all) permitia que
--    qualquer usuário do tenant fizesse UPDATE em qualquer coluna,
--    incluindo is_platform_admin, role, tenant_id.
--    Solução: trigger BEFORE UPDATE que bloqueia alteração dessas colunas.
--
-- 2. consultas: trocar current_setting('app.tenant_id') por current_tenant_id()
--    O GUC current_setting é controlável pelo cliente se o app usar
--    set_config() com valor do body. current_tenant_id() é seguro.
--
-- 3. notify_tenant/notify_user: revogar EXECUTE PUBLIC + set search_path
--    security definer sem restrição de execução permite que qualquer
--    usuário autenticado insira notificações em qualquer tenant.
-- =========================================================================

-- ============================================================
-- 1. profiles — bloquear escalada de privilégio
-- ============================================================

-- Trigger function: impede alteração de is_platform_admin, role, tenant_id
-- por usuários não-platform-admin. Apenas o service role (que bypassa RLS)
-- ou um platform admin via back-office pode alterar esses campos.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_is_socio boolean;
begin
  -- Se o usuário autenticado NÃO é platform admin, bloqueia alteração
  -- de colunas sensíveis.
  if auth.uid() is not null then
    select is_platform_admin, (role = 'socio')
      into v_is_admin, v_is_socio
    from public.profiles
    where id = auth.uid();

    if not coalesce(v_is_admin, false) then
      -- Bloqueia tentativa de escalar privilégio
      if NEW.is_platform_admin is distinct from OLD.is_platform_admin then
        raise exception 'Não autorizado: is_platform_admin não pode ser alterado';
      end if;
      if NEW.tenant_id is distinct from OLD.tenant_id then
        raise exception 'Não autorizado: tenant_id não pode ser alterado';
      end if;
      -- Role só pode ser alterado por sócios
      if NEW.role is distinct from OLD.role and not coalesce(v_is_socio, false) then
        raise exception 'Não autorizado: role só pode ser alterado por sócios';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on profiles;
create trigger trg_protect_profile_privileges
  before update on profiles
  for each row
  execute function public.protect_profile_privileges();

-- ============================================================
-- 2. consultas — trocar current_setting por current_tenant_id()
-- ============================================================

drop policy if exists "consultas_select_own" on consultas;
drop policy if exists "consultas_insert_own" on consultas;
drop policy if exists "consultas_update_own" on consultas;
create policy "consultas_select_own" on consultas
  for select using (tenant_id = public.current_tenant_id());
create policy "consultas_insert_own" on consultas
  for insert with check (tenant_id = public.current_tenant_id());
create policy "consultas_update_own" on consultas
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists "consulta_credits_select_own" on consulta_credits;
drop policy if exists "consulta_credits_upsert_own" on consulta_credits;
drop policy if exists "consulta_credits_update_own" on consulta_credits;
create policy "consulta_credits_select_own" on consulta_credits
  for select using (tenant_id = public.current_tenant_id());
create policy "consulta_credits_upsert_own" on consulta_credits
  for insert with check (tenant_id = public.current_tenant_id());
create policy "consulta_credits_update_own" on consulta_credits
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists "consulta_batches_select_own" on consulta_batches;
drop policy if exists "consulta_batches_insert_own" on consulta_batches;
drop policy if exists "consulta_batches_update_own" on consulta_batches;
create policy "consulta_batches_select_own" on consulta_batches
  for select using (tenant_id = public.current_tenant_id());
create policy "consulta_batches_insert_own" on consulta_batches
  for insert with check (tenant_id = public.current_tenant_id());
create policy "consulta_batches_update_own" on consulta_batches
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ============================================================
-- 3. notify_tenant/notify_user — restringir execução
--    Wrapped in DO IF EXISTS because these functions may not exist
--    if migration 0017 was not applied. This makes 0031 idempotent.
-- ============================================================

DO $$
BEGIN
  -- notify_tenant
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_tenant' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.notify_tenant(uuid, text, text, text, text) FROM public;
    CREATE OR REPLACE FUNCTION public.notify_tenant(
      p_tenant_id uuid,
      p_type text,
      p_title text,
      p_body text default null,
      p_link text default null
    ) returns void as $$
    begin
      insert into notifications (tenant_id, type, title, body, link)
      values (p_tenant_id, p_type, p_title, p_body, p_link);
    end;
    $$ language plpgsql security definer set search_path = public;
  END IF;

  -- notify_user
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_user' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text) FROM public;
    CREATE OR REPLACE FUNCTION public.notify_user(
      p_tenant_id uuid,
      p_user_id uuid,
      p_type text,
      p_title text,
      p_body text default null,
      p_link text default null
    ) returns void as $$
    begin
      insert into notifications (tenant_id, user_id, type, title, body, link)
      values (p_tenant_id, p_user_id, p_type, p_title, p_body, p_link);
    end;
    $$ language plpgsql security definer set search_path = public;
  END IF;
END $$;
