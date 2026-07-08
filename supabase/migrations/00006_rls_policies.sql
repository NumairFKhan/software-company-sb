-- =========================================================
-- Row Level Security (RLS) policies for CourtSide
-- =========================================================

-- ---- coaches ----
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

-- Coaches can read their own row
CREATE POLICY "coaches: select own row"
  ON coaches FOR SELECT
  USING (user_id = auth.uid());

-- Coaches can update their own row
CREATE POLICY "coaches: update own row"
  ON coaches FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Public can view coaches whose onboarding is complete (for discovery)
CREATE POLICY "coaches: public select onboarded"
  ON coaches FOR SELECT
  USING (onboarding_complete = TRUE);

-- Inserts require service-role key (handled server-side during sign-up)
-- No INSERT policy for authenticated role → only service-role can insert.

-- ---- players ----
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Players can read their own row
CREATE POLICY "players: select own row"
  ON players FOR SELECT
  USING (user_id = auth.uid());

-- Players can update their own row
CREATE POLICY "players: update own row"
  ON players FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Coaches can view players who have booked them (joined via bookings)
CREATE POLICY "players: coaches can see their players"
  ON players FOR SELECT
  USING (
    id IN (
      SELECT player_id FROM bookings
      WHERE coach_id IN (
        SELECT id FROM coaches WHERE user_id = auth.uid()
      )
    )
  );

-- ---- availability_slots ----
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can view availability slots (needed for booking flow)
CREATE POLICY "availability_slots: authenticated read"
  ON availability_slots FOR SELECT
  TO authenticated
  USING (TRUE);

-- Coaches can manage their own availability slots
CREATE POLICY "availability_slots: coach insert own"
  ON availability_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "availability_slots: coach update own"
  ON availability_slots FOR UPDATE
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  )
  WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

CREATE POLICY "availability_slots: coach delete own"
  ON availability_slots FOR DELETE
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- ---- bookings ----
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Owning coach can read bookings
CREATE POLICY "bookings: coach can read own"
  ON bookings FOR SELECT
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- Owning player can read bookings
CREATE POLICY "bookings: player can read own"
  ON bookings FOR SELECT
  USING (
    player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
  );

-- All writes (INSERT, UPDATE, DELETE) require service-role key (no policy for authenticated role)
-- This ensures booking state transitions are always performed server-side.
