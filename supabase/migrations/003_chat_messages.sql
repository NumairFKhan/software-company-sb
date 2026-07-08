-- ── 003_chat_messages.sql ─────────────────────────────────────────────────────
-- Creates the chat_messages table for storing AI coach conversation history.
-- Each message belongs to a user and a browser session (session_id).
-- Rate limiting uses this table to count user messages per hour.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  TEXT        NOT NULL,  -- opaque browser-session token (UUID generated client-side)
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rate-limit queries: count recent user messages efficiently
CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx
  ON public.chat_messages (user_id, created_at DESC);

-- Index for fetching messages belonging to a specific session
CREATE INDEX IF NOT EXISTS chat_messages_session_idx
  ON public.chat_messages (session_id, created_at ASC);

-- Enable Row Level Security
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only read their own messages
CREATE POLICY "chat_messages: users read own"
  ON public.chat_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert messages for themselves
CREATE POLICY "chat_messages: users insert own"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
