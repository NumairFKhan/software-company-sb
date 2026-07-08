-- Create booking status type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
  END IF;
END$$;

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id            UUID            NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id           UUID            NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  availability_slot_id UUID           REFERENCES availability_slots(id) ON DELETE SET NULL,
  slot_start          TIMESTAMPTZ     NOT NULL,
  slot_end            TIMESTAMPTZ     NOT NULL,
  status              booking_status  NOT NULL DEFAULT 'pending',
  hourly_rate         NUMERIC(10, 2)  NOT NULL,
  stripe_payment_intent_id TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Prevent double-booking: a coach cannot have two bookings starting at the same time
  CONSTRAINT bookings_coach_slot_unique UNIQUE (coach_id, slot_start),

  CONSTRAINT booking_slot_end_after_start CHECK (slot_end > slot_start)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS bookings_coach_id_idx   ON bookings(coach_id);
CREATE INDEX IF NOT EXISTS bookings_player_id_idx  ON bookings(player_id);
CREATE INDEX IF NOT EXISTS bookings_slot_start_idx ON bookings(slot_start);
CREATE INDEX IF NOT EXISTS bookings_status_idx     ON bookings(status);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
