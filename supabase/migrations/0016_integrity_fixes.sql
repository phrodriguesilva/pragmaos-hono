-- Migration 0016: Database integrity fixes.
-- 1. Add updated_at triggers to tables that were missing them.
-- 2. Add ON DELETE CASCADE to foreign keys that were missing it.
-- 3. Add missing unique constraints for data integrity.
-- PragmaOS 2.

-- ============================================================
-- 1. UPDATED_AT TRIGGERS for tables created in migrations 0001-0012
--    that have updated_at columns but no trigger.
--    (Tables from 0015 already have triggers in that migration.)
-- ============================================================

-- Tables from 0001 that were missing the trigger:
create trigger if not exists trg_case_summaries_updated_at
  before update on case_summaries for each row execute function public.set_updated_at();

create trigger if not exists trg_case_events_updated_at
  before update on case_events for each row execute function public.set_updated_at();

create trigger if not exists trg_case_assignments_updated_at
  before update on case_assignments for each row execute function public.set_updated_at();

create trigger if not exists trg_audit_log_updated_at
  before update on audit_log for each row execute function public.set_updated_at();

-- Tables from 0006-0012 that have updated_at but no trigger:
create trigger if not exists trg_integrations_updated_at
  before update on integrations for each row execute function public.set_updated_at();

create trigger if not exists trg_email_accounts_updated_at
  before update on email_accounts for each row execute function public.set_updated_at();

create trigger if not exists trg_email_messages_updated_at
  before update on email_messages for each row execute function public.set_updated_at();

create trigger if not exists trg_signature_requests_updated_at
  before update on signature_requests for each row execute function public.set_updated_at();

create trigger if not exists trg_whatsapp_messages_updated_at
  before update on whatsapp_messages for each row execute function public.set_updated_at();

create trigger if not exists trg_whatsapp_templates_updated_at
  before update on whatsapp_templates for each row execute function public.set_updated_at();

create trigger if not exists trg_document_templates_updated_at
  before update on document_templates for each row execute function public.set_updated_at();

-- ============================================================
-- 2. ON DELETE CASCADE for foreign keys.
--    We add CASCADE to child->parent relationships so that deleting
--    a parent (tenant, client, case) cleans up children automatically.
--    For user references (profiles), we use SET NULL to preserve audit trails.
--
--    Note: These use DROP + ADD CONSTRAINT since ALTER CONSTRAINT
--    is not supported for changing ON DELETE behavior.
--    We wrap in DO blocks to be idempotent.
-- ============================================================

-- Helper: safely drop and recreate a FK with new ON DELETE behavior.
-- We check if the constraint exists before dropping.

-- proceedings.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'proceedings_case_id_fkey' and table_name = 'proceedings') then
    alter table proceedings drop constraint proceedings_case_id_fkey;
  end if;
  alter table proceedings add constraint proceedings_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- proceeding_movements.proceeding_id -> proceedings(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'proceeding_movements_proceeding_id_fkey' and table_name = 'proceeding_movements') then
    alter table proceeding_movements drop constraint proceeding_movements_proceeding_id_fkey;
  end if;
  alter table proceeding_movements add constraint proceeding_movements_proceeding_id_fkey
    foreign key (proceeding_id) references proceedings(id) on delete cascade;
end$$;

-- deadlines.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'deadlines_case_id_fkey' and table_name = 'deadlines') then
    alter table deadlines drop constraint deadlines_case_id_fkey;
  end if;
  alter table deadlines add constraint deadlines_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- hearings.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'hearings_case_id_fkey' and table_name = 'hearings') then
    alter table hearings drop constraint hearings_case_id_fkey;
  end if;
  alter table hearings add constraint hearings_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- communications_log.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'communications_log_case_id_fkey' and table_name = 'communications_log') then
    alter table communications_log drop constraint communications_log_case_id_fkey;
  end if;
  alter table communications_log add constraint communications_log_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- communications_log.client_id -> clients(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'communications_log_client_id_fkey' and table_name = 'communications_log') then
    alter table communications_log drop constraint communications_log_client_id_fkey;
  end if;
  alter table communications_log add constraint communications_log_client_id_fkey
    foreign key (client_id) references clients(id) on delete cascade;
end$$;

-- case_summaries.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'case_summaries_case_id_fkey' and table_name = 'case_summaries') then
    alter table case_summaries drop constraint case_summaries_case_id_fkey;
  end if;
  alter table case_summaries add constraint case_summaries_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- case_events.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'case_events_case_id_fkey' and table_name = 'case_events') then
    alter table case_events drop constraint case_events_case_id_fkey;
  end if;
  alter table case_events add constraint case_events_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- case_assignments.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'case_assignments_case_id_fkey' and table_name = 'case_assignments') then
    alter table case_assignments drop constraint case_assignments_case_id_fkey;
  end if;
  alter table case_assignments add constraint case_assignments_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- invoices.client_id -> clients(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'invoices_client_id_fkey' and table_name = 'invoices') then
    alter table invoices drop constraint invoices_client_id_fkey;
  end if;
  alter table invoices add constraint invoices_client_id_fkey
    foreign key (client_id) references clients(id) on delete cascade;
end$$;

-- invoices.case_id -> cases(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'invoices_case_id_fkey' and table_name = 'invoices') then
    alter table invoices drop constraint invoices_case_id_fkey;
  end if;
  alter table invoices add constraint invoices_case_id_fkey
    foreign key (case_id) references cases(id) on delete set null;
end$$;

-- documents.case_id -> cases(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'documents_case_id_fkey' and table_name = 'documents') then
    alter table documents drop constraint documents_case_id_fkey;
  end if;
  alter table documents add constraint documents_case_id_fkey
    foreign key (case_id) references cases(id) on delete cascade;
end$$;

-- documents.client_id -> clients(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'documents_client_id_fkey' and table_name = 'documents') then
    alter table documents drop constraint documents_client_id_fkey;
  end if;
  alter table documents add constraint documents_client_id_fkey
    foreign key (client_id) references clients(id) on delete set null;
end$$;

-- email_messages.account_id -> email_accounts(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'email_messages_account_id_fkey' and table_name = 'email_messages') then
    alter table email_messages drop constraint email_messages_account_id_fkey;
  end if;
  alter table email_messages add constraint email_messages_account_id_fkey
    foreign key (account_id) references email_accounts(id) on delete cascade;
end$$;

-- email_messages.case_id -> cases(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'email_messages_case_id_fkey' and table_name = 'email_messages') then
    alter table email_messages drop constraint email_messages_case_id_fkey;
  end if;
  alter table email_messages add constraint email_messages_case_id_fkey
    foreign key (case_id) references cases(id) on delete set null;
end$$;

-- email_messages.client_id -> clients(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'email_messages_client_id_fkey' and table_name = 'email_messages') then
    alter table email_messages drop constraint email_messages_client_id_fkey;
  end if;
  alter table email_messages add constraint email_messages_client_id_fkey
    foreign key (client_id) references clients(id) on delete set null;
end$$;

-- signature_requests.case_id -> cases(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'signature_requests_case_id_fkey' and table_name = 'signature_requests') then
    alter table signature_requests drop constraint signature_requests_case_id_fkey;
  end if;
  alter table signature_requests add constraint signature_requests_case_id_fkey
    foreign key (case_id) references cases(id) on delete set null;
end$$;

-- signature_requests.client_id -> clients(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'signature_requests_client_id_fkey' and table_name = 'signature_requests') then
    alter table signature_requests drop constraint signature_requests_client_id_fkey;
  end if;
  alter table signature_requests add constraint signature_requests_client_id_fkey
    foreign key (client_id) references clients(id) on delete set null;
end$$;

-- signature_requests.document_id -> documents(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'signature_requests_document_id_fkey' and table_name = 'signature_requests') then
    alter table signature_requests drop constraint signature_requests_document_id_fkey;
  end if;
  alter table signature_requests add constraint signature_requests_document_id_fkey
    foreign key (document_id) references documents(id) on delete cascade;
end$$;

-- whatsapp_messages.client_id -> clients(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'whatsapp_messages_client_id_fkey' and table_name = 'whatsapp_messages') then
    alter table whatsapp_messages drop constraint whatsapp_messages_client_id_fkey;
  end if;
  alter table whatsapp_messages add constraint whatsapp_messages_client_id_fkey
    foreign key (client_id) references clients(id) on delete set null;
end$$;

-- cases.client_id -> clients(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'cases_client_id_fkey' and table_name = 'cases') then
    alter table cases drop constraint cases_client_id_fkey;
  end if;
  alter table cases add constraint cases_client_id_fkey
    foreign key (client_id) references clients(id) on delete cascade;
end$$;

-- User reference FKs: use SET NULL to preserve audit trail
-- audit_log.user_id -> profiles(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'audit_log_user_id_fkey' and table_name = 'audit_log') then
    alter table audit_log drop constraint audit_log_user_id_fkey;
  end if;
  alter table audit_log add constraint audit_log_user_id_fkey
    foreign key (user_id) references profiles(id) on delete set null;
end$$;

-- case_events.created_by -> profiles(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'case_events_created_by_fkey' and table_name = 'case_events') then
    alter table case_events drop constraint case_events_created_by_fkey;
  end if;
  alter table case_events add constraint case_events_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;
end$$;

-- documents.uploaded_by -> profiles(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'documents_uploaded_by_fkey' and table_name = 'documents') then
    alter table documents drop constraint documents_uploaded_by_fkey;
  end if;
  alter table documents add constraint documents_uploaded_by_fkey
    foreign key (uploaded_by) references profiles(id) on delete set null;
end$$;

-- email_accounts.user_id -> profiles(id) ON DELETE CASCADE
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'email_accounts_user_id_fkey' and table_name = 'email_accounts') then
    alter table email_accounts drop constraint email_accounts_user_id_fkey;
  end if;
  alter table email_accounts add constraint email_accounts_user_id_fkey
    foreign key (user_id) references profiles(id) on delete cascade;
end$$;

-- diario_searches.created_by -> profiles(id) ON DELETE SET NULL
do $$
begin
  if exists (select 1 from information_schema.table_constraints
    where constraint_name = 'diario_searches_created_by_fkey' and table_name = 'diario_searches') then
    alter table diario_searches drop constraint diario_searches_created_by_fkey;
  end if;
  alter table diario_searches add constraint diario_searches_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;
end$$;

-- ============================================================
-- 3. MISSING UNIQUE CONSTRAINTS (data integrity)
--    Some were already added in 0015; these are for pre-existing tables.
-- ============================================================
-- (Already handled in 0015 for: proceedings.cnj_number, invoices.number,
--  clients.cpf, clients.cnpj, email_accounts.email, companies.cnpj)
