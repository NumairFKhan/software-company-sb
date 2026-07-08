-- Migration 00012: Add reminder_sent_at to bookings
--
-- The daily reminder cron job sends a 24-hour advance email to both the coach
-- and the player for every confirmed booking that starts in the next 23-25 hours.
-- reminder_sent_at records when the reminder was dispatched so the job stays
-- idempotent — a duplicate cron firing never resends the email.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Index for the reminder query: status=confirmed, reminder_sent_at IS NULL,
-- slot_start between (now + 23h) and (now + 25h).
CREATE INDEX IF NOT EXISTS bookings_reminder_queue_idx
  ON bookings (slot_start)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;
