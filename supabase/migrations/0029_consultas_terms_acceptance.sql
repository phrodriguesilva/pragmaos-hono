-- 0029 — Consultas Legais: terms acceptance tracking
-- Adds a timestamp column to profiles to track when each user accepted the Consultas Legais terms.

alter table profiles add column if not exists consulta_terms_accepted_at timestamptz;

comment on column profiles.consulta_terms_accepted_at is 'Timestamp when the user accepted the Consultas Legais terms. NULL means not yet accepted.';
