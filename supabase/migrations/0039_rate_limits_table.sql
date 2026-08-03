-- Migration 0038: Rate limits table for DB-backed rate limiting
-- Used as fallback when Upstash Redis is not configured.
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

-- RLS: only service role can access (application uses service role key).
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_rate_limits" ON rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Cleanup function: delete expired entries.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits() RETURNS integer AS $$
BEGIN
  DELETE FROM rate_limits WHERE reset_at < now();
  RETURN 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic increment: insert if not exists, otherwise increment count.
-- Used by the application's Supabase rate-limit fallback backend.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_key text, p_reset_at timestamptz)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO rate_limits (key, count, reset_at) VALUES (p_key, 1, p_reset_at)
  ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
