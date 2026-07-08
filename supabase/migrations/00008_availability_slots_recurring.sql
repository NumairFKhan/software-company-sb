-- =========================================================
-- Migration 00008: Add recurring availability support
-- =========================================================
-- Extends availability_slots to support weekly recurring
-- availability templates used by the coach availability grid editor.
--
-- Recurring rows store: day_of_week + start_time + end_time + is_recurring=TRUE
-- Concrete/booked rows continue to use: slot_start + slot_end (now nullable)

-- 1. Make slot_start / slot_end nullable so recurring template rows
--    can exist without a concrete datetime.
ALTER TABLE availability_slots
  ALTER COLUMN slot_start DROP NOT NULL,
  ALTER COLUMN slot_end   DROP NOT NULL;

-- 2. Add recurring-availability columns.
ALTER TABLE availability_slots
  ADD COLUMN IF NOT EXISTS day_of_week  SMALLINT,   -- 0 = Sunday … 6 = Saturday
  ADD COLUMN IF NOT EXISTS start_time   TIME,
  ADD COLUMN IF NOT EXISTS end_time     TIME,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Constraints --------------------------------------------------------

-- Recurring rows must supply day_of_week + start_time + end_time
ALTER TABLE availability_slots
  ADD CONSTRAINT recurring_requires_day_time
    CHECK (
      NOT is_recurring
      OR (day_of_week IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL)
    );

-- day_of_week must be 0–6 (when present)
ALTER TABLE availability_slots
  ADD CONSTRAINT day_of_week_valid_range
    CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6));

-- Recurring end must be after start
ALTER TABLE availability_slots
  ADD CONSTRAINT recurring_end_after_start
    CHECK (
      NOT is_recurring
      OR end_time > start_time
    );

-- Prevent duplicate recurring slots (same coach, same day, same start)
CREATE UNIQUE INDEX IF NOT EXISTS availability_slots_recurring_unique
  ON availability_slots (coach_id, day_of_week, start_time)
  WHERE is_recurring = TRUE;

-- 4. Stored procedure for atomic replace of all recurring slots ----------
--    Called from the PUT /api/coaches/[id]/availability route handler via
--    Supabase service-role RPC.  Runs in a single transaction so there is
--    never a window where the coach has no availability between the DELETE
--    and the INSERT.
CREATE OR REPLACE FUNCTION replace_recurring_availability(
  p_coach_id UUID,
  p_slots    JSONB        -- JSON array of {day_of_week, start_time, end_time}
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete all existing recurring slots for this coach
  DELETE FROM availability_slots
  WHERE coach_id = p_coach_id
    AND is_recurring = TRUE;

  -- Insert replacement slots (skip if empty array)
  IF jsonb_array_length(p_slots) > 0 THEN
    INSERT INTO availability_slots (coach_id, day_of_week, start_time, end_time, is_recurring)
    SELECT
      p_coach_id,
      (elem->>'day_of_week')::SMALLINT,
      (elem->>'start_time')::TIME,
      (elem->>'end_time')::TIME,
      TRUE
    FROM jsonb_array_elements(p_slots) AS elem;
  END IF;
END;
$$;

-- 5. Allow the anon role to read availability_slots for public profiles --
CREATE POLICY "availability_slots: anon read"
  ON availability_slots FOR SELECT
  TO anon
  USING (TRUE);
