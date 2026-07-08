/**
 * Utility functions for deriving concrete open booking slots from
 * weekly recurring availability templates, excluding already-confirmed bookings.
 */

import type { OpenSlot, RecurringSlot } from "./database.types";

interface ConfirmedBooking {
  slot_start: string; // ISO datetime
  slot_end: string;   // ISO datetime
}

/**
 * Expands recurring weekly availability templates into concrete open slots
 * for the next `weeks` weeks (default: 4), excluding any time windows that
 * overlap with a confirmed booking.
 *
 * @param recurringSlots  - Weekly template rows from availability_slots
 * @param confirmedBookings - Bookings with status = 'confirmed'
 * @param weeks           - How many weeks ahead to project (default 4)
 * @param now             - Reference "now" (injectable for testing, defaults to current time)
 */
export function deriveOpenSlots(
  recurringSlots: RecurringSlot[],
  confirmedBookings: ConfirmedBooking[],
  weeks = 4,
  now: Date = new Date()
): OpenSlot[] {
  if (recurringSlots.length === 0) return [];

  const openSlots: OpenSlot[] = [];

  // Iterate over each day in the window [now, now + weeks * 7 days)
  const endDate = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

  // Normalise `current` to midnight local time so we iterate full calendar days
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);

  while (current < endDate) {
    const dayOfWeek = current.getDay(); // 0 = Sunday … 6 = Saturday

    // All recurring template slots that fall on this weekday
    const slotsForDay = recurringSlots.filter(
      (s) => s.day_of_week === dayOfWeek
    );

    for (const slot of slotsForDay) {
      // Parse HH:MM strings
      const [startH, startM] = slot.start_time.split(":").map(Number);
      const [endH, endM] = slot.end_time.split(":").map(Number);

      const slotStart = new Date(current);
      slotStart.setHours(startH, startM, 0, 0);

      const slotEnd = new Date(current);
      slotEnd.setHours(endH, endM, 0, 0);

      // Skip slots that are entirely in the past
      if (slotEnd <= now) continue;

      // Check for overlap with any confirmed booking
      const isBooked = confirmedBookings.some((booking) => {
        const bookingStart = new Date(booking.slot_start);
        const bookingEnd = new Date(booking.slot_end);
        // Intervals overlap when: bookingStart < slotEnd AND bookingEnd > slotStart
        return bookingStart < slotEnd && bookingEnd > slotStart;
      });

      if (!isBooked) {
        openSlots.push({
          date: current.toISOString().split("T")[0],
          start_time: slot.start_time,
          end_time: slot.end_time,
          start_datetime: slotStart.toISOString(),
          end_datetime: slotEnd.toISOString(),
        });
      }
    }

    // Advance to the next calendar day
    current.setDate(current.getDate() + 1);
  }

  return openSlots;
}

/**
 * Groups a flat list of OpenSlots by their date string for display.
 */
export function groupSlotsByDate(
  slots: OpenSlot[]
): Array<{ date: string; slots: OpenSlot[] }> {
  const map = new Map<string, OpenSlot[]>();

  for (const slot of slots) {
    const existing = map.get(slot.date);
    if (existing) {
      existing.push(slot);
    } else {
      map.set(slot.date, [slot]);
    }
  }

  return Array.from(map.entries()).map(([date, dateSlots]) => ({
    date,
    slots: dateSlots,
  }));
}

/**
 * Formats a time string like "09:00" → "9:00 AM" / "13:00" → "1:00 PM"
 */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Formats a date string "YYYY-MM-DD" → "Mon, Jul 7"
 */
export function formatDate(dateStr: string): string {
  // Parse as local date (avoid UTC offset shift by treating as local)
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
