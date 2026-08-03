-- 0005_integration_types.sql
-- Add new integration types: llm, digesto, querido_diario
-- Drop and recreate the type check constraint.
-- NOTE: The integrations table is created in 0006. On a fresh install,
-- this migration runs before 0006, so the table doesn't exist yet.
-- We wrap the ALTER in a DO block that silently skips if the table
-- is missing. The constraint is also re-asserted in 0006 and 0032.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integrations' AND table_schema = 'public') THEN
    ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_type_check;
    ALTER TABLE public.integrations ADD CONSTRAINT integrations_type_check
      CHECK (type = ANY (ARRAY[
        'cnj'::text, 'pje'::text, 'esaj'::text,
        'google'::text, 'microsoft'::text,
        'clicksign'::text, 'docusign'::text,
        'whatsapp'::text, 'govbr'::text,
        'diario_oficial'::text,
        'llm'::text, 'digesto'::text, 'querido_diario'::text
      ]));
  END IF;
END $$;
