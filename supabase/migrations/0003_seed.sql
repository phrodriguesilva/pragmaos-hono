-- Seed: create the first tenant (Luiz Fabiano's law firm) and a bootstrap
-- profile row. The actual auth.users entry is created via Supabase Auth
-- (sign-up or admin invite); a trigger then inserts the matching profile.
-- This migration only creates the tenant and a trigger to auto-profile.

-- Trigger: when a new auth.users row is created, do nothing by default.
-- The app creates the profile explicitly after sign-up so it can set the
-- role and tenant_id. This is a no-op trigger kept for documentation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The app is responsible for inserting into profiles with the correct
  -- tenant_id and role. We do not auto-insert here to avoid orphan profiles
  -- without a tenant.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
