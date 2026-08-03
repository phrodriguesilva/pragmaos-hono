-- 0036 — Audit log must be append-only (no UPDATE or DELETE).
-- Previous migration 0002 created UPDATE and DELETE policies on audit_log
-- which compromise audit trail integrity. Remove them.

drop policy if exists "audit_log_tenant_update" on public.audit_log;
drop policy if exists "audit_log_tenant_delete" on public.audit_log;

-- Only INSERT and SELECT remain — audit logs cannot be modified or deleted
-- by any tenant user (even with direct DB access via service role bypass,
-- the application code never issues UPDATE/DELETE on audit_log).
