-- 0004_modal_columns.sql
-- Add columns needed by modal-based forms.

-- documents: add description and file_url; make storage_path nullable.
alter table documents add column if not exists description text;
alter table documents add column if not exists file_url text;
alter table documents alter column storage_path drop not null;

-- communications_log: add subject column.
alter table communications_log add column if not exists subject text;
