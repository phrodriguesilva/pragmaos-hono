-- 0023_team_and_stats.sql
-- Professional profiles + public team members + site stats.
-- Extends profiles with OAB, bio, photo, etc.
-- Adds: team_members (public site), site_stats (numbers on home).

-- =========================================================================
-- 1. Extend profiles with professional fields
-- =========================================================================
alter table profiles
  add column if not exists phone text,
  add column if not exists photo_url text,
  add column if not exists oab_number text,
  add column if not exists oab_state char(2),
  add column if not exists bio text,
  add column if not exists linkedin_url text,
  add column if not exists specialties text[] default '{}',
  add column if not exists admission_date date,
  add column if not exists bar_admission_date date,
  add column if not exists supervisor_id uuid references profiles(id) on delete set null;

-- =========================================================================
-- 2. team_members — public-facing team pages
--    References profiles so we don't duplicate data.
--    The admin chooses which profiles to publish and can override
--    the public bio/title independently of internal data.
-- =========================================================================
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  public_name text not null,
  public_title text not null,           -- e.g. "Socio Fundador", "Advogado Associado"
  public_bio text,
  public_photo_url text,                -- override profile photo if needed
  public_linkedin text,
  public_email text,                    -- optional, may differ from internal
  slug text not null,                   -- URL slug: /equipe/:slug
  sort_order int not null default 0,
  is_featured boolean not null default false,  -- show on home page
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists idx_team_members_tenant on team_members(tenant_id);
create index if not exists idx_team_members_published on team_members(tenant_id, is_published, sort_order);

-- =========================================================================
-- 3. site_stats — numbers displayed on the public home page
--    e.g. "+20 anos", "+5000 processos", "70 profissionais"
-- =========================================================================
create table if not exists site_stats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,                  -- e.g. "anos de experiencia"
  value text not null,                  -- e.g. "20", "5000", "70"
  prefix text default '',               -- e.g. "+"
  suffix text default '',               -- e.g. "", "mil"
  icon text,                            -- Phosphor icon name
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_stats_tenant on site_stats(tenant_id);

-- =========================================================================
-- 4. RLS policies
-- =========================================================================

-- team_members: tenant-scoped (admin manages, public reads via service role)
alter table team_members enable row level security;
create policy "team_members_select_own" on team_members
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "team_members_modify_own" on team_members
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- site_stats: tenant-scoped
alter table site_stats enable row level security;
create policy "site_stats_select_own" on site_stats
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "site_stats_modify_own" on site_stats
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- 5. Updated_at trigger for team_members
-- =========================================================================
drop trigger if exists trg_team_members_updated on team_members;
create trigger trg_team_members_updated
  before update on team_members
  for each row execute function update_updated_at();
