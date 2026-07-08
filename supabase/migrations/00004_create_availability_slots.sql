-- Create availability_slots table
CREATE TABLE IF NOT EXISTS availability_slots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  slot_start      TIMESTAMPTZ NOT NULL,
  slot_end        TIMESTAMPTZ NOT NULL,
  is_booked       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT slot_end_after_start CHECK (slot_end > slot_start)
);

-- Index for coach availability lookups
CREATE INDEX IF NOT EXISTS availability_slots_coach_id_idx ON availability_slots(coach_id);
CREATE INDEX IF NOT EXISTS availability_slots_slot_start_idx ON availability_slots(slot_start);

CREATE TRIGGER availability_slots_updated_at
  BEFORE UPDATE ON availability_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
