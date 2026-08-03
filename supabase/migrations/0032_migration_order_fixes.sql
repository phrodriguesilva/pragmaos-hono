-- =========================================================================
-- 0032 — Create public_team_members table
--
-- The bank has a single `team_members` table (from 0015) that got public
-- columns added by 0023 (ALTER ADD COLUMN IF NOT EXISTS). The code now
-- reads `public_team_members` for the public team page and `team_members`
-- for internal teams. This migration creates the missing public table.
--
-- The internal `team_members` table is left as-is (it still has the public
-- columns but they're unused — harmless).
-- =========================================================================

-- Create the public team_members table.
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

-- RLS policies (tenant-scoped: admin manages, public reads via service role).
alter table public_team_members enable row level security;

drop policy if exists "public_team_members_select_own" on public_team_members;
create policy "public_team_members_select_own" on public_team_members
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));

drop policy if exists "public_team_members_modify_own" on public_team_members;
create policy "public_team_members_modify_own" on public_team_members
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- Indexes.
create index if not exists idx_public_team_members_tenant on public_team_members(tenant_id);
create index if not exists idx_public_team_members_published on public_team_members(tenant_id, is_published, sort_order);

-- Updated_at trigger (uses the existing update_updated_at() function).
drop trigger if exists trg_public_team_members_updated on public_team_members;
create trigger trg_public_team_members_updated
  before update on public_team_members
  for each row execute function update_updated_at();

-- ============================================================
-- Recreate dashboard function (in case 0014 failed on fresh install)
-- ============================================================
create or replace function public.dashboard_pending_honorarios_total(p_tenant uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select coalesce(sum(amount_cents), 0)::bigint from honorarios
    where tenant_id = p_tenant and status = 'pending' and deleted_at is null);
end;
$$;

-- ============================================================
-- Ensure integrations type constraint is correct
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integrations' AND table_schema = 'public') THEN
    ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_type_check;
    ALTER TABLE public.integrations ADD CONSTRAINT integrations_type_check
      CHECK (type = ANY (ARRAY[
        'cnj'::text, 'pje'::text, 'esaj'::text,
        'google'::text, 'microsoft'::text,
        'clicksign'::text, 'docusign'::text,
        'whatsapp'::text, 'govbr'::text,
        'diario_oficial'::text,
        'llm'::text, 'digesto'::text, 'querido_diario'::text
      ]));
  END IF;
END $$;
