-- Migration 00010: Add stripe_transfer_id to bookings for post-lesson payout tracking
--
-- stripe_transfer_id is set by the daily cron job (/api/cron/daily) once
-- a Stripe Transfer has been successfully created to the coach's Connect account.
-- NULL means the payout has not yet been issued for this booking.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

-- Partial index for fast payout-queue queries:
--   SELECT ... WHERE status = 'confirmed' AND stripe_transfer_id IS NULL AND slot_end < now()
CREATE INDEX IF NOT EXISTS bookings_payout_queue_idx
  ON bookings (coach_id, slot_end)
  WHERE status = 'confirmed' AND stripe_transfer_id IS NULL;
