-- 0035 — Intake form slugs must be globally unique (public endpoint).
-- Previously unique per (tenant_id, slug), which allowed collisions that break
-- the public /intake/f/:slug route (maybeSingle() errors on duplicates).

-- Drop the per-tenant unique constraint on intake_forms.slug.
alter table public.intake_forms
  drop constraint if exists intake_forms_tenant_id_slug_key;

-- Add a global unique constraint on slug so no two tenants can collide.
-- This protects the public intake route from ambiguity and DoS.
alter table public.intake_forms
  add constraint intake_forms_slug_key unique (slug);
