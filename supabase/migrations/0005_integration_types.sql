-- 0005_integration_types.sql
-- Add new integration types: llm, digesto, querido_diario
-- Drop and recreate the type check constraint.

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
