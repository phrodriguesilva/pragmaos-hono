-- Migration 0017: In-app notifications system.
-- Creates notifications table with RLS for tenant isolation.
-- PragmaOS 2.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid references profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_tenant on notifications(tenant_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_read on notifications(read);
create index if not exists idx_notifications_created on notifications(created_at);

alter table notifications enable row level security;

create policy "notifications_tenant_select" on notifications
  for select using (tenant_id = public.current_tenant_id());
create policy "notifications_tenant_insert" on notifications
  for insert with check (tenant_id = public.current_tenant_id());
create policy "notifications_tenant_update" on notifications
  for update using (tenant_id = public.current_tenant_id());
create policy "notifications_tenant_delete" on notifications
  for delete using (tenant_id = public.current_tenant_id());

-- Helper function to create a notification for all users in a tenant
create or replace function public.notify_tenant(
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
$$ language plpgsql security definer;

-- Helper function to create a notification for a specific user
create or replace function public.notify_user(
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
$$ language plpgsql security definer;
