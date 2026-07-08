-- =============================================================
-- CourtCoach AI – Session Logs
-- Migration: 002_session_logs
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- Enum: log type
-- ──────────────────────────────────────────────────────────────
CREATE TYPE session_log_type AS ENUM (
  'practice',
  'match',
  'fitness',
  'recovery'
);

-- ──────────────────────────────────────────────────────────────
-- session_logs
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,                          -- soft-delete

  -- Required core fields
  log_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  log_type      session_log_type NOT NULL,
  duration_mins INT         NOT NULL CHECK (duration_mins > 0),

  -- Optional general fields
  intensity     SMALLINT    CHECK (intensity     BETWEEN 1 AND 5),
  fatigue       SMALLINT    CHECK (fatigue       BETWEEN 1 AND 5),
  pain_notes    TEXT,
  free_notes    TEXT,

  -- JSONB details per log type:
  --   practice  → { focus_area, drill_notes }
  --   match     → { opponent_level, sets_score, surface }
  --   fitness   → { activity_type, gym_notes }
  --   recovery  → { sleep_quality, soreness_areas }
  details       JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indices
CREATE INDEX IF NOT EXISTS session_logs_user_id_idx
  ON public.session_logs (user_id);

CREATE INDEX IF NOT EXISTS session_logs_user_date_idx
  ON public.session_logs (user_id, log_date DESC)
  WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Auto-update updated_at (reuse trigger function from migration 001)
-- ──────────────────────────────────────────────────────────────
CREATE TRIGGER session_logs_updated_at
  BEFORE UPDATE ON public.session_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own logs (excluding soft-deleted rows)
CREATE POLICY "Users can read own session logs"
  ON public.session_logs
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Users can INSERT only logs for themselves
CREATE POLICY "Users can insert own session logs"
  ON public.session_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE only their own logs (used for soft-delete)
CREATE POLICY "Users can update own session logs"
  ON public.session_logs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
