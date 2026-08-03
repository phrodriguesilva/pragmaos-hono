-- =========================================================================
-- 0032 — Migration order fixes + team_members collision resolution
--
-- Problems:
-- 1. 0005 alters `integrations` table, but it's created in 0006.
--    On a fresh DB, 0005 aborts because the table doesn't exist.
-- 2. 0014 references `honorarios` table, created only in 0015.
--    Functions with language sql validate body at creation time → aborts.
-- 3. 0015 creates `team_members` (internal team membership) and
--    0023 creates `team_members` (public team page) — collision.
--    The `if not exists` in 0023 is a no-op, so the public team page
--    never gets the columns it needs (slug, public_name, etc.).
--
-- This migration fixes all three issues for existing and fresh installs.
-- =========================================================================

-- ============================================================
-- 1. Fix team_members collision: rename internal table, create public one
-- ============================================================

-- Rename the internal team_members (from 0015) to team_members_internal.
-- This preserves existing data if any.
alter table if exists team_members rename to team_members_internal;

-- Also rename the unique constraint and index if they exist.
alter table if exists team_members_internal rename constraint team_members_tenant_id_team_id_user_id_key to team_members_internal_tenant_id_team_id_user_id_key;

-- Now create the public team_members table (what 0023 intended).
-- This is safe because the old one was renamed above.
create table if not exists team_members (
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

-- RLS for the public team_members table.
alter table team_members enable row level security;
drop policy if exists "team_members_tenant_select" on team_members;
create policy "team_members_tenant_select" on team_members
  for select using (tenant_id = public.current_tenant_id());
drop policy if exists "team_members_tenant_modify" on team_members;
create policy "team_members_tenant_modify" on team_members
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Indexes.
create index if not exists idx_team_members_tenant on team_members(tenant_id);
create index if not exists idx_team_members_slug on team_members(tenant_id, slug);
create index if not exists idx_team_members_featured on team_members(tenant_id) where is_featured = true;

-- Updated_at trigger.
create or replace function public.set_updated_at_team_members()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_team_members_updated_at on team_members;
create trigger trg_team_members_updated_at
  before update on team_members
  for each row execute function public.set_updated_at_team_members();

-- ============================================================
-- 2. Fix 0014 dashboard functions (honorarios reference)
--    The functions were created with `language sql` which validates
--    the body at creation time. If honorarios didn't exist, they aborted.
--    This migration recreates them (they already exist if 0014 succeeded,
--    so we use `create or replace`).
-- ============================================================
-- These functions are recreated here to ensure they exist even if
-- 0014 failed on a fresh install. The `create or replace` is safe.

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
-- 3. Fix 0005/0006 order: ensure integrations type constraint exists
--    If 0005 failed on fresh install, the constraint may be missing.
--    This ensures it's correct regardless of whether 0005 ran.
-- ============================================================
alter table public.integrations drop constraint if exists integrations_type_check;
alter table public.integrations add constraint integrations_type_check
  check (type in ('pje','google','microsoft','clicksign','docusign','whatsapp','govbr','digesto','llm','querido_diario'));
