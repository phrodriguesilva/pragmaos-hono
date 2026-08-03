-- Migration 0038: Email verification tokens
-- Used to verify email ownership during signup.
CREATE TABLE IF NOT EXISTS email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verifications_token ON email_verifications(token_hash);
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);

ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_email_verifications" ON email_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);
