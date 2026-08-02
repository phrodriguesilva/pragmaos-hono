-- Migration 0020: Add missing integration types to CHECK constraint.
-- intima_ai, nfse, pje_mni are used in code but not in the constraint.

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_type_check;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_type_check
  CHECK (type = ANY (ARRAY[
    'cnj'::text, 'pje'::text, 'pje_mni'::text, 'esaj'::text,
    'google'::text, 'microsoft'::text,
    'clicksign'::text, 'docusign'::text,
    'whatsapp'::text, 'govbr'::text,
    'diario_oficial'::text,
    'llm'::text, 'digesto'::text, 'querido_diario'::text,
    'intima_ai'::text, 'nfse'::text
  ]));

-- Add unique constraint to prevent duplicate integration types per tenant
ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_tenant_type_unique;
ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_tenant_type_unique UNIQUE (tenant_id, type);
