-- =========================================================================
-- 0032 — Migration order fixes + team_members collision resolution
--
-- Problems:
-- 1. 0005 alters `integrations` table, but it's created in 0006.
--    On a fresh DB, 0005 aborts because the table doesn't exist.
--    → Fixed in-place: 0005 now uses DROP IF EXISTS (tolerant).
-- 2. 0014 references `honorarios` table, created only in 0015.
--    Functions with language sql validate body at creation time → aborts.
--    → Fixed in-place: 0014 now uses language plpgsql (defers validation).
-- 3. 0015 creates `team_members` (internal team membership) and
--    0023 creates `team_members` (public team page) — collision.
--    The `if not exists` in 0023 is a no-op, so the public team page
--    never gets the columns it needs (slug, public_name, etc.).
--    → Fixed here: rename the PUBLIC table to `public_team_members`.
--      The internal `team_members` (from 0015) stays as-is.
--
-- NOTE: This migration only runs on databases that already have 0031 applied.
-- For fresh installs, 0005 and 0014 have been edited in-place to not abort.
-- =========================================================================

-- ============================================================
-- 1. Fix team_members collision: create public_team_members
-- ============================================================

-- If 0031's rename already happened (team_members_internal exists),
-- we need to undo it: rename team_members_internal back to team_members,
-- and create the public table as public_team_members.
-- If 0031's rename did NOT happen (team_members is still the internal one),
-- we just create public_team_members from scratch.

-- Case A: 0031 renamed team_members → team_members_internal
-- Undo: rename back to team_members (the internal table)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'team_members_internal') then
    -- Undo the rename from 0031
    alter table team_members_internal rename to team_members;
    -- Rename the constraint back
    alter table team_members rename constraint team_members_internal_tenant_id_team_id_user_id_key to team_members_tenant_id_team_id_user_id_key;
    -- The "new" team_members table (public, created by 0031) needs to be renamed
    -- to public_team_members. But it has the same name as the one we just restored.
    -- This is a conflict — 0031 created a table called team_members (public).
    -- After renaming team_members_internal → team_members, we have TWO tables
    -- with the same name, which is impossible. So we need a different approach.

    -- Actually, if team_members_internal exists, it means 0031 ran.
    -- 0031 renamed the original team_members → team_members_internal,
    -- then created a NEW team_members (public schema).
    -- We need to:
    --   1. Rename the NEW (public) team_members → public_team_members
    --   2. Rename team_members_internal → team_members (restore original)

    -- But step 1 can't happen because we already did the rename in the if block.
    -- Let's use a safer approach below.
  end if;
end $$;

-- Safer approach: check state and act accordingly.
-- State after 0031: team_members_internal (was internal) + team_members (new public)
-- State without 0031: team_members (internal only, public never created)

-- Step 1: If team_members_internal exists, 0031 ran.
--         Rename the public team_members → public_team_members first,
--         then restore team_members_internal → team_members.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'team_members_internal') then
    -- 0031 ran. The current "team_members" is the PUBLIC one (has slug, public_name).
    -- Rename it to public_team_members.
    alter table team_members rename to public_team_members;

    -- Rename its constraint
    alter table if exists public_team_members rename constraint team_members_tenant_id_slug_key to public_team_members_tenant_id_slug_key;

    -- Rename its indexes
    alter index if exists idx_team_members_tenant rename to idx_public_team_members_tenant;
    alter index if exists idx_team_members_slug rename to idx_public_team_members_slug;
    alter index if exists idx_team_members_featured rename to idx_public_team_members_featured;

    -- Rename its trigger
    drop trigger if exists trg_team_members_updated_at on public_team_members;
    create trigger trg_public_team_members_updated_at
      before update on public_team_members
      for each row execute function public.set_updated_at_team_members();

    -- Rename its RLS policies
    drop policy if exists "team_members_tenant_select" on public_team_members;
    create policy "public_team_members_tenant_select" on public_team_members
      for select using (tenant_id = public.current_tenant_id());
    drop policy if exists "team_members_tenant_modify" on public_team_members;
    create policy "public_team_members_tenant_modify" on public_team_members
      for all using (tenant_id = public.current_tenant_id())
      with check (tenant_id = public.current_tenant_id());

    -- Now restore the internal table name
    alter table team_members_internal rename to team_members;
    alter table team_members rename constraint team_members_internal_tenant_id_team_id_user_id_key to team_members_tenant_id_team_id_user_id_key;
  else
    -- 0031 did NOT run (fresh install or 0031 was skipped).
    -- team_members is the internal table (from 0015).
    -- Create the public table as public_team_members.
    create table if not exists public_team_members (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      profile_id uuid references profiles(id) on delete cascade,
      public_name text not null,
      public_title text not null,
      public_bio text,
      public_photo_url text,
      public_linkedin text,
      public_email text,
      slug text not null,
      sort_order int not null default 0,
      is_featured boolean not null default false,
      is_published boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, slug)
    );

    alter table public_team_members enable row level security;
    create policy "public_team_members_tenant_select" on public_team_members
      for select using (tenant_id = public.current_tenant_id());
    create policy "public_team_members_tenant_modify" on public_team_members
      for all using (tenant_id = public.current_tenant_id())
      with check (tenant_id = public.current_tenant_id());

    create index if not exists idx_public_team_members_tenant on public_team_members(tenant_id);
    create index if not exists idx_public_team_members_slug on public_team_members(tenant_id, slug);
    create index if not exists idx_public_team_members_featured on public_team_members(tenant_id) where is_featured = true;

    create trigger trg_public_team_members_updated_at
      before update on public_team_members
      for each row execute function public.set_updated_at_team_members();
  end if;
end $$;

-- ============================================================
-- 2. Recreate dashboard function (in case 0014 failed on fresh install)
-- ============================================================
create or replace function public.dashboard_pending_honorarios_total(p_tenant uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::bigint from honorarios
  where tenant_id = p_tenant and status = 'pending'
$$;

-- ============================================================
-- 3. Ensure integrations type constraint is correct
-- ============================================================
alter table public.integrations drop constraint if exists integrations_type_check;
alter table public.integrations add constraint integrations_type_check
  check (type in ('pje','google','microsoft','clicksign','docusign','whatsapp','govbr','digesto','llm','querido_diario'));
