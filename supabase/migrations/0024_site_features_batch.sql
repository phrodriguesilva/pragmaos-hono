-- 0024_site_features_batch.sql
-- testimonials, client_logos, recognitions, newsletter_subscriptions, offices
-- + article categories/tags/featured

-- =========================================================================
-- testimonials — depoimentos de clientes
-- =========================================================================
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  author_name text not null,
  author_role text,
  author_company text,
  content text not null,
  rating int check (rating between 1 and 5) default 5,
  source text default 'website',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_testimonials_tenant on testimonials(tenant_id);
alter table testimonials enable row level security;
create policy "testimonials_select_own" on testimonials
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "testimonials_modify_own" on testimonials
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- client_logos — logos de clientes para carousel
-- =========================================================================
create table if not exists client_logos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_logos_tenant on client_logos(tenant_id);
alter table client_logos enable row level security;
create policy "client_logos_select_own" on client_logos
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "client_logos_modify_own" on client_logos
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- recognitions — premiações e reconhecimentos
-- =========================================================================
create table if not exists recognitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  organization text,
  year int,
  description text,
  ranking_position text,
  icon text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_recognitions_tenant on recognitions(tenant_id);
alter table recognitions enable row level security;
create policy "recognitions_select_own" on recognitions
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "recognitions_modify_own" on recognitions
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- newsletter_subscriptions — inscrições na newsletter
-- =========================================================================
create table if not exists newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  name text,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists idx_newsletter_tenant on newsletter_subscriptions(tenant_id);
alter table newsletter_subscriptions enable row level security;
create policy "newsletter_select_own" on newsletter_subscriptions
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "newsletter_modify_own" on newsletter_subscriptions
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- offices — múltiplos escritórios
-- =========================================================================
create table if not exists offices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,
  address text not null,
  city text,
  state char(2),
  zip text,
  phone text,
  email text,
  map_lat numeric(9,6),
  map_lng numeric(9,6),
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_offices_tenant on offices(tenant_id);
alter table offices enable row level security;
create policy "offices_select_own" on offices
  for select to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid()));
create policy "offices_modify_own" on offices
  for all to authenticated
  using (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')))
  with check (tenant_id in (select tenant_id from profiles where id = auth.uid() and role in ('socio','admin')));

-- =========================================================================
-- article categories — add category column to articles
-- =========================================================================
alter table articles
  add column if not exists category text default 'artigo' check (category in ('artigo','noticia','client-alert','midia')),
  add column if not exists tags text[] default '{}',
  add column if not exists featured boolean not null default false;
