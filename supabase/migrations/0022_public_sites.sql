-- 0022_public_sites.sql
-- White-label public websites for each tenant.
-- Adds: branding columns to tenants, site config, law areas catalog,
-- tenant law areas, articles/blog, and contact submissions.

-- =========================================================================
-- 1. Branding columns on tenants
-- =========================================================================
alter table tenants
  add column if not exists slug text unique,
  add column if not exists subdomain text unique,
  add column if not exists custom_domain text unique,
  add column if not exists logo_url text,
  add column if not exists primary_color text default '#c8553d',
  add column if not exists secondary_color text default '#2b2925',
  add column if not exists tagline text,
  add column if not exists description text,
  add column if not exists founded_year int,
  add column if not exists oab_number text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email_public text,
  add column if not exists social_facebook text,
  add column if not exists social_instagram text,
  add column if not exists social_linkedin text,
  add column if not exists site_published boolean not null default false;

-- Backfill slug from name for existing tenants (if slug is null).
update tenants
  set slug = lower(
    regexp_replace(
      regexp_replace(
        unaccent(name),
        '[^a-z0-9]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  )
  where slug is null;

-- =========================================================================
-- 2. Site configuration (key-value per tenant)
-- =========================================================================
create table if not exists site_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

-- =========================================================================
-- 3. Law areas catalog (shared across all tenants)
-- =========================================================================
create table if not exists law_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 4. Tenant law areas (which areas each tenant practices)
-- =========================================================================
create table if not exists tenant_law_areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  law_area_id uuid not null references law_areas(id) on delete cascade,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, law_area_id)
);

-- =========================================================================
-- 5. Articles / Blog
-- =========================================================================
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  slug text not null,
  excerpt text,
  content text not null,
  cover_image_url text,
  author_id uuid references profiles(id) on delete set null,
  law_area_id uuid references law_areas(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  reading_time_min int,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- =========================================================================
-- 6. Contact submissions (from public site -> creates lead in CRM)
-- =========================================================================
create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  law_area_id uuid references law_areas(id) on delete set null,
  lead_id uuid,  -- link to leads table if a lead was created
  status text not null default 'new' check (status in ('new','contacted','converted','archived')),
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 7. Indexes
-- =========================================================================
create index if not exists idx_tenant_law_areas_tenant on tenant_law_areas(tenant_id);
create index if not exists idx_articles_tenant on articles(tenant_id);
create index if not exists idx_articles_published on articles(tenant_id, status, published_at desc);
create index if not exists idx_contact_submissions_tenant on contact_submissions(tenant_id);
create index if not exists idx_site_settings_tenant on site_settings(tenant_id);

-- =========================================================================
-- 8. Seed default law areas
-- =========================================================================
insert into law_areas (name, slug, icon) values
  ('Direito da Familia', 'direito-da-familia', 'ph-heart'),
  ('Direito Previdenciario', 'direito-previdenciario', 'ph-hand-coins'),
  ('Direito do Trabalho', 'direito-do-trabalho', 'ph-briefcase'),
  ('Direito Civil', 'direito-civil', 'ph-scales'),
  ('Direito Penal', 'direito-penal', 'ph-shield-warning'),
  ('Direito Empresarial', 'direito-empresarial', 'ph-building'),
  ('Direito Tributario', 'direito-tributario', 'ph-receipt'),
  ('Direito Imobiliario', 'direito-imobiliario', 'ph-house'),
  ('Direito do Consumidor', 'direito-do-consumidor', 'ph-storefront'),
  ('Direito Administrativo', 'direito-administrativo', 'ph-gear'),
  ('Direito Ambiental', 'direito-ambiental', 'ph-tree'),
  ('Direito Digital', 'direito-digital', 'ph-cpu')
on conflict (slug) do nothing;

-- =========================================================================
-- 9. RLS policies
-- =========================================================================

-- site_settings: tenant-scoped
alter table site_settings enable row level security;
create policy "site_settings_select_own" on site_settings
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "site_settings_modify_own" on site_settings
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- law_areas: readable by all authenticated (shared catalog)
alter table law_areas enable row level security;
create policy "law_areas_select_all" on law_areas
  for select to authenticated
  using (true);

-- tenant_law_areas: tenant-scoped
alter table tenant_law_areas enable row level security;
create policy "tenant_law_areas_select_own" on tenant_law_areas
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "tenant_law_areas_modify_own" on tenant_law_areas
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- articles: tenant-scoped
alter table articles enable row level security;
create policy "articles_select_own" on articles
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "articles_modify_own" on articles
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin','advogado')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin','advogado')));

-- contact_submissions: tenant-scoped
alter table contact_submissions enable row level security;
create policy "contact_submissions_select_own" on contact_submissions
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "contact_submissions_modify_own" on contact_submissions
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin','recepcao')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin','recepcao')));

-- =========================================================================
-- 10. Updated_at triggers
-- =========================================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger if not exists trg_site_settings_updated
  before update on site_settings
  for each row execute function update_updated_at();

create trigger if not exists trg_articles_updated
  before update on articles
  for each row execute function update_updated_at();
