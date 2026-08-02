-- 0014_dashboard_aggregates.sql
-- Postgres functions for dashboard aggregation (server-side GROUP BY).
-- Avoids fetching all rows to the app server just to count/sum in JS.

-- Sum of pending honorarios for a tenant.
create or replace function public.dashboard_pending_honorarios_total(p_tenant uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::bigint from honorarios
  where tenant_id = p_tenant and status = 'pending' and deleted_at is null;
$$;

-- Revenue by month (last 6 months) for a tenant.
-- Returns array of {month_index, total_cents} where month_index is 0=oldest .. 5=newest.
create or replace function public.dashboard_revenue_6m(p_tenant uuid, p_now timestamptz default now())
returns table(month_index int, total_cents bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m_start timestamptz;
  m_end timestamptz;
begin
  for i in 0..5 loop
    m_start := date_trunc('month', p_now - make_interval(months => 5 - i));
    m_end := m_start + interval '1 month';
    return query select
      i as month_index,
      coalesce(sum(h.amount_cents), 0)::bigint as total_cents
    from honorarios h
    where h.tenant_id = p_tenant
      and h.status = 'paid'
      and h.deleted_at is null
      and h.paid_at >= m_start
      and h.paid_at < m_end;
  end loop;
end;
$$;

-- Case counts grouped by type and status (single query, returns both).
create or replace function public.dashboard_case_counts(p_tenant uuid)
returns table(case_type text, status text, cnt bigint)
language sql
stable
security definer
set search_path = public
as $$
  select case_type, status, count(*)::bigint
  from cases
  where tenant_id = p_tenant and deleted_at is null
  group by case_type, status;
$$;
