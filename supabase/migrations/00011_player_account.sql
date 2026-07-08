-- Migration 00011: Player account signup and guest-booking linking
--
-- Players can create full accounts.  On creation, any guest bookings that used
-- the same email address are retroactively linked to the new player_id so the
-- player can see (and cancel) them from their dashboard.
--
-- Additionally adds a partial index to speed up the guest-email linking query
-- and ensures the cancel endpoint can efficiently look up bookings by
-- player_id for the authenticated-player path.

-- Index: fast lookup of guest bookings by email (used for linking on signup)
CREATE INDEX IF NOT EXISTS bookings_guest_email_idx
  ON bookings (guest_email)
  WHERE player_id IS NULL AND guest_email IS NOT NULL;

-- Index: fast lookup of bookings by player_id (dashboard & cancel checks)
CREATE INDEX IF NOT EXISTS bookings_player_id_idx
  ON bookings (player_id)
  WHERE player_id IS NOT NULL;

-- Index: fast lookup of bookings by coach_id + slot_start (dashboard ordering)
CREATE INDEX IF NOT EXISTS bookings_coach_slot_start_idx
  ON bookings (coach_id, slot_start);
