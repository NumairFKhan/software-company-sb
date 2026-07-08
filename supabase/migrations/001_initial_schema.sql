-- =============================================================
-- CourtCoach AI – Initial Schema
-- Migration: 001_initial_schema
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- Enums
-- ──────────────────────────────────────────────────────────────
CREATE TYPE player_level AS ENUM (
  'beginner',
  'intermediate',
  'advanced',
  'competitive',
  'professional'
);

CREATE TYPE handedness AS ENUM ('right', 'left');

CREATE TYPE backhand_type AS ENUM ('one_handed', 'two_handed');

-- ──────────────────────────────────────────────────────────────
-- player_profiles
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Core profile
  display_name           TEXT NOT NULL,
  level                  player_level NOT NULL,
  handedness             handedness NOT NULL,
  backhand_type          backhand_type NOT NULL,

  -- Goals & technical focus (arrays of free-text tags / predefined options)
  goals                  TEXT[] NOT NULL DEFAULT '{}',
  technical_focus        TEXT[] NOT NULL DEFAULT '{}',

  -- Schedule
  available_days         TEXT[] NOT NULL DEFAULT '{}',
  session_length_minutes INT  NOT NULL DEFAULT 60 CHECK (session_length_minutes > 0),

  -- Optional / advanced
  known_injuries         TEXT,

  CONSTRAINT player_profiles_user_id_unique UNIQUE (user_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS player_profiles_user_id_idx
  ON public.player_profiles (user_id);

-- ──────────────────────────────────────────────────────────────
-- Auto-update updated_at
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER player_profiles_updated_at
  BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ──────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own profile
CREATE POLICY "Users can read own profile"
  ON public.player_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can INSERT only a profile for themselves
CREATE POLICY "Users can insert own profile"
  ON public.player_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE only their own profile
CREATE POLICY "Users can update own profile"
  ON public.player_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can DELETE only their own profile
CREATE POLICY "Users can delete own profile"
  ON public.player_profiles
  FOR DELETE
  USING (auth.uid() = user_id);
