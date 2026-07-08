-- Migration 00009: Guest checkout support for bookings
--
-- 1. Makes player_id nullable so guest (no-account) bookings are allowed.
-- 2. Adds guest_name / guest_email for the person booking the session.
-- 3. Adds stripe_checkout_session_id to correlate webhook events back to the booking.
-- 4. Creates an atomic create_booking_if_available() stored procedure that
--    checks for slot conflicts and inserts the booking inside a single transaction,
--    handling concurrent INSERT races via unique-constraint exception handling.

-- ── 1. Make player_id nullable (guest checkout has no player account) ────────
ALTER TABLE bookings
  ALTER COLUMN player_id DROP NOT NULL;

-- ── 2. Guest fields ──────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_name  TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- ── 3. Stripe Checkout Session ID ────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

-- ── 4. Atomic slot-check + insert stored procedure ───────────────────────────
--
-- Returns one row: (booking_id UUID, conflict BOOLEAN)
--   • conflict = FALSE  →  booking created; booking_id holds the new row's id
--   • conflict = TRUE   →  slot already taken; booking_id is NULL
--
-- The procedure runs inside its own implicit transaction (called via supabase.rpc).
-- A nested BEGIN … EXCEPTION block catches any unique_violation that could still
-- occur due to concurrent inserts racing past the initial conflict check.
CREATE OR REPLACE FUNCTION create_booking_if_available(
  p_coach_id     UUID,
  p_slot_start   TIMESTAMPTZ,
  p_slot_end     TIMESTAMPTZ,
  p_hourly_rate  NUMERIC,
  p_guest_name   TEXT,
  p_guest_email  TEXT
) RETURNS TABLE(booking_id UUID, conflict BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_count INT;
  v_booking_id     UUID;
BEGIN
  -- Pessimistic conflict check: are there any pending or confirmed bookings
  -- for the same coach at the same start time?
  SELECT COUNT(*) INTO v_conflict_count
  FROM   bookings
  WHERE  coach_id   = p_coach_id
    AND  slot_start = p_slot_start
    AND  status     IN ('pending', 'confirmed');

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT NULL::UUID, TRUE::BOOLEAN;
    RETURN;
  END IF;

  -- Attempt to insert; catch the race-condition unique_violation
  BEGIN
    INSERT INTO bookings (
      coach_id,
      player_id,
      slot_start,
      slot_end,
      hourly_rate,
      guest_name,
      guest_email,
      status
    ) VALUES (
      p_coach_id,
      NULL,           -- guest checkout: no player account
      p_slot_start,
      p_slot_end,
      p_hourly_rate,
      p_guest_name,
      p_guest_email,
      'pending'
    ) RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another concurrent request beat us to this slot
    RETURN QUERY SELECT NULL::UUID, TRUE::BOOLEAN;
    RETURN;
  END;

  RETURN QUERY SELECT v_booking_id, FALSE::BOOLEAN;
END;
$$;
