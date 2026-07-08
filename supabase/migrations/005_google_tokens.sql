-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 005: Google OAuth Token Storage
-- ──────────────────────────────────────────────────────────────────────────────
-- Stores Google OAuth provider tokens captured during the auth callback.
--
-- Why a separate table?
--   Supabase does NOT persist provider_token / provider_refresh_token across
--   sessions. They're only available immediately after the OAuth sign-in
--   callback. We capture them here so that future server-side features
--   (e.g. Google Calendar API calls) can retrieve a valid access / refresh token
--   for any user without requiring them to re-authenticate.
--
-- Security notes:
--   • RLS is enabled — a user can only upsert/read their own row.
--   • In production, access_token and refresh_token should ideally be encrypted
--     at rest. For this initial version they are stored as plain TEXT inside the
--     Supabase-managed Postgres instance (encrypted at the storage level by the
--     cloud provider). A future hardening pass can add app-level encryption.
--   • The table is NOT accessible from the browser anon key because the client-
--     side Supabase library never needs to read it — only server-side Route
--     Handlers do.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token     TEXT        NOT NULL,
  -- refresh_token may be NULL if the user revoked offline access or Supabase
  -- did not return one (e.g. repeated consent without access_type=offline).
  refresh_token    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup by user_id (the most common query pattern)
CREATE INDEX IF NOT EXISTS google_tokens_user_id_idx ON google_tokens (user_id);

-- Auto-update updated_at on every write
-- (re-uses the same trigger function pattern as earlier migrations)
CREATE OR REPLACE FUNCTION update_google_tokens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER google_tokens_updated_at
  BEFORE UPDATE ON google_tokens
  FOR EACH ROW EXECUTE FUNCTION update_google_tokens_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

-- Users may upsert and read only their own token row.
-- Server-side Route Handlers (running in the user's authenticated session
-- immediately after exchangeCodeForSession) satisfy auth.uid() = user_id.
CREATE POLICY "Users can manage their own google tokens"
  ON google_tokens
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
