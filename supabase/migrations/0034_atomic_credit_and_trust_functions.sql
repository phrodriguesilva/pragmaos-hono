-- 0034_atomic_credit_and_trust_functions.sql
-- Add atomic RPC functions to prevent race conditions (TOCTOU) in
-- credit deduction and trust account transactions.

-- ============================================================
-- 1. Atomic credit deduction for consultas
-- ============================================================
create or replace function public.deduct_consulta_credits(
  p_tenant_id uuid,
  p_month text,
  p_amount int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_limit int;
begin
  -- Lock the row for the duration of the transaction.
  select used_credits, monthly_limit
    into v_used, v_limit
  from consulta_credits
  where tenant_id = p_tenant_id and month = p_month
  for update;

  if not found then
    return false;
  end if;

  -- Check if deduction would exceed the limit.
  if v_used + p_amount > v_limit then
    return false;
  end if;

  -- Atomically increment used_credits.
  update consulta_credits
    set used_credits = used_credits + p_amount,
        updated_at = now()
    where tenant_id = p_tenant_id and month = p_month;

  return true;
end;
$$;

-- ============================================================
-- 2. Atomic trust account transaction
-- ============================================================
create or replace function public.process_trust_transaction(
  p_tenant_id uuid,
  p_account_id uuid,
  p_type text,
  p_amount int,
  p_description text,
  p_created_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_new_balance int;
  v_result jsonb;
begin
  -- Validate type.
  if p_type not in ('deposit', 'withdrawal') then
    return jsonb_build_object('success', false, 'error', 'invalid_type');
  end if;

  -- Lock the account row.
  select balance_cents into v_balance
  from trust_accounts
  where id = p_account_id and tenant_id = p_tenant_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  -- Check sufficient balance for withdrawals.
  if p_type = 'withdrawal' and p_amount > v_balance then
    return jsonb_build_object('success', false, 'error', 'insufficient_balance');
  end if;

  -- Calculate new balance.
  v_new_balance := case when p_type = 'deposit' then v_balance + p_amount else v_balance - p_amount end;

  -- Insert transaction record.
  insert into trust_transactions (tenant_id, trust_account_id, type, amount_cents, description, created_by)
  values (p_tenant_id, p_account_id, p_type, p_amount, p_description, p_created_by);

  -- Update balance atomically.
  update trust_accounts
    set balance_cents = v_new_balance,
        updated_at = now()
    where id = p_account_id and tenant_id = p_tenant_id;

  return jsonb_build_object('success', true, 'new_balance', v_new_balance);
end;
$$;

-- Revoke execute from public, grant to authenticated.
revoke execute on function public.deduct_consulta_credits(uuid, text, int) from public;
revoke execute on function public.process_trust_transaction(uuid, uuid, text, int, text, uuid) from public;
grant execute on function public.deduct_consulta_credits(uuid, text, int) to authenticated;
grant execute on function public.process_trust_transaction(uuid, uuid, text, int, text, uuid) to authenticated;
