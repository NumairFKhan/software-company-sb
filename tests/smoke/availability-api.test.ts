/**
 * Tests for the coach availability grid editor feature.
 *
 * Suites:
 *  1. Unit — deriveOpenSlots() utility (no network, deterministic clock)
 *  2. Unit — groupSlotsByDate() and formatting helpers
 *  3. Schema — migration 00008 structure
 *  4. Integration smoke — PUT/GET /api/coaches/[id]/availability (requires live Supabase)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { deriveOpenSlots, groupSlotsByDate, formatTime, formatDate } from "@/lib/availability";
import type { RecurringSlot } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// 1. deriveOpenSlots() — unit tests (deterministic clock)
// ---------------------------------------------------------------------------

describe("deriveOpenSlots()", () => {
  /**
   * Fixed reference: Monday 2026-07-06 at 09:00 UTC
   * (use UTC date to avoid timezone-sensitive failures in CI)
   */
  const NOW = new Date("2026-07-06T09:00:00Z");

  /** Monday = 1 */
  const MON_SLOT: RecurringSlot = {
    id: "slot-1",
    coach_id: "coach-1",
    day_of_week: 1,
    start_time: "10:00",
    end_time: "11:00",
  };

  it("returns an open slot for a recurring weekday with no bookings", () => {
    const slots = deriveOpenSlots([MON_SLOT], [], 1, NOW);
    expect(slots.length).toBeGreaterThanOrEqual(1);
    expect(slots[0].start_time).toBe("10:00");
    expect(slots[0].end_time).toBe("11:00");
  });

  it("excludes a recurring slot that is already confirmed-booked", () => {
    // The next Monday after NOW is 2026-07-06 itself (it IS Monday)
    // First upcoming slot is 2026-07-06 10:00–11:00
    const firstMonday = deriveOpenSlots([MON_SLOT], [], 1, NOW);
    const firstSlot = firstMonday[0];

    // Build a confirmed booking that exactly covers firstSlot (timezone-safe)
    const bookingStartMs = new Date(firstSlot.start_datetime).getTime();
    const bookingEndMs = bookingStartMs + 60 * 60 * 1000; // +1 hour
    const confirmedBookings = [
      {
        slot_start: new Date(bookingStartMs).toISOString(),
        slot_end: new Date(bookingEndMs).toISOString(),
      },
    ];

    const remaining = deriveOpenSlots([MON_SLOT], confirmedBookings, 1, NOW);
    expect(
      remaining.every((s) => s.start_datetime !== firstSlot.start_datetime)
    ).toBe(true);
  });

  it("skips slots that are entirely in the past", () => {
    // NOW is Mon 09:00; Monday slot is 10:00–11:00, so it's in the future → included
    // Use an 8 AM slot which is before NOW
    const earlySlot: RecurringSlot = {
      ...MON_SLOT,
      id: "slot-2",
      start_time: "07:00",
      end_time: "08:00",
    };
    const slots = deriveOpenSlots([earlySlot], [], 1, NOW);
    // 07:00–08:00 is before 09:00 on the same day → skip today's, keep next week's
    expect(slots.every((s) => new Date(s.start_datetime) > NOW)).toBe(true);
  });

  it("returns empty array when recurringSlots is empty", () => {
    expect(deriveOpenSlots([], [], 4, NOW)).toEqual([]);
  });

  it("projects the correct number of weekday occurrences over 4 weeks", () => {
    // 4 weeks = 28 days; a given weekday occurs ≤ 4 times
    const slots = deriveOpenSlots([MON_SLOT], [], 4, NOW);
    expect(slots.length).toBeGreaterThanOrEqual(3);
    expect(slots.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 2. Formatting helpers — unit tests
// ---------------------------------------------------------------------------

describe("groupSlotsByDate()", () => {
  it("groups slots by date string", () => {
    const slots = [
      { date: "2026-07-06", start_time: "09:00", end_time: "10:00", start_datetime: "2026-07-06T09:00:00Z" },
      { date: "2026-07-06", start_time: "10:00", end_time: "11:00", start_datetime: "2026-07-06T10:00:00Z" },
      { date: "2026-07-07", start_time: "09:00", end_time: "10:00", start_datetime: "2026-07-07T09:00:00Z" },
    ];

    const grouped = groupSlotsByDate(slots);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].date).toBe("2026-07-06");
    expect(grouped[0].slots).toHaveLength(2);
    expect(grouped[1].date).toBe("2026-07-07");
    expect(grouped[1].slots).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(groupSlotsByDate([])).toEqual([]);
  });
});

describe("formatTime()", () => {
  it("formats midnight as 12:00 AM", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
  });

  it("formats 9 AM correctly", () => {
    expect(formatTime("09:00")).toBe("9:00 AM");
  });

  it("formats noon as 12:00 PM", () => {
    expect(formatTime("12:00")).toBe("12:00 PM");
  });

  it("formats 1 PM correctly", () => {
    expect(formatTime("13:00")).toBe("1:00 PM");
  });

  it("formats 9 PM correctly", () => {
    expect(formatTime("21:00")).toBe("9:00 PM");
  });
});

describe("formatDate()", () => {
  it("returns a readable date string for 2026-07-06", () => {
    const result = formatDate("2026-07-06");
    // Day is Monday — should contain "Mon" and "Jul" and "6"
    expect(result).toContain("6");
    expect(result).toContain("Jul");
  });
});

// ---------------------------------------------------------------------------
// 3. Migration file — schema tests (no network)
// ---------------------------------------------------------------------------

describe("Migration 00008 — availability_slots_recurring", () => {
  it("exists and has expected column names", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const migPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "00008_availability_slots_recurring.sql"
    );

    const sql = readFileSync(migPath, "utf-8");

    expect(sql).toContain("day_of_week");
    expect(sql).toContain("start_time");
    expect(sql).toContain("end_time");
    expect(sql).toContain("is_recurring");
  });

  it("defines the replace_recurring_availability RPC function", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const migPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "00008_availability_slots_recurring.sql"
    );

    const sql = readFileSync(migPath, "utf-8");
    expect(sql).toContain("replace_recurring_availability");
  });

  it("all migration files still follow the 00NNN_ naming convention", async () => {
    const { readdirSync } = await import("fs");
    const { join } = await import("path");

    const dir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(8);
    files.forEach((file: string) => {
      expect(file).toMatch(/^\d{5}_/);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Integration smoke tests — require live Supabase credentials
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

describe.skipIf(!hasCredentials)(
  "PUT /api/coaches/[id]/availability smoke tests (live Supabase)",
  () => {
    const { createClient } = require("@supabase/supabase-js");

    const TEST_EMAIL = `smoke-avail-${Date.now()}@example.com`;
    const TEST_PASSWORD = "TestPassword1!";
    let coachId: string;
    let userId: string;
    let serviceClient: ReturnType<typeof createClient>;

    beforeEach(() => {
      if (!serviceClient && hasCredentials) {
        serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      }
    });

    it("creates a test coach", async () => {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      expect(error).toBeNull();
      userId = data.user!.id;

      const { data: coachRow, error: coachErr } = await serviceClient
        .from("coaches")
        .insert({ user_id: userId, email: TEST_EMAIL, full_name: "Availability Smoke Coach" })
        .select("id")
        .single();

      expect(coachErr).toBeNull();
      coachId = coachRow!.id;
    });

    it("availability_slots has day_of_week, start_time, end_time, is_recurring columns", async () => {
      // Insert a recurring slot directly to verify schema
      const { error } = await serviceClient.from("availability_slots").insert({
        coach_id: coachId,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "10:00",
        is_recurring: true,
      });
      expect(error).toBeNull();

      const { data } = await serviceClient
        .from("availability_slots")
        .select("day_of_week, start_time, end_time, is_recurring")
        .eq("coach_id", coachId)
        .eq("is_recurring", true)
        .single();

      expect(data).not.toBeNull();
      expect(data!.day_of_week).toBe(1);
      expect(data!.start_time).toMatch(/^09:00/);
      expect(data!.is_recurring).toBe(true);
    });

    it("replace_recurring_availability RPC atomically replaces slots", async () => {
      const newSlots = [
        { day_of_week: 2, start_time: "10:00", end_time: "11:00" },
        { day_of_week: 3, start_time: "14:00", end_time: "15:00" },
      ];

      const { error } = await serviceClient.rpc("replace_recurring_availability", {
        p_coach_id: coachId,
        p_slots: newSlots,
      });
      expect(error).toBeNull();

      const { data } = await serviceClient
        .from("availability_slots")
        .select("day_of_week, start_time")
        .eq("coach_id", coachId)
        .eq("is_recurring", true)
        .order("day_of_week");

      // Original Monday (1) slot should be gone; only Wed (2) and Thu (3) remain
      expect(data).toHaveLength(2);
      const days = data!.map((r: { day_of_week: number }) => r.day_of_week);
      expect(days).toContain(2);
      expect(days).toContain(3);
      expect(days).not.toContain(1);
    });

    it("replace_recurring_availability with empty array removes all slots", async () => {
      const { error } = await serviceClient.rpc("replace_recurring_availability", {
        p_coach_id: coachId,
        p_slots: [],
      });
      expect(error).toBeNull();

      const { data } = await serviceClient
        .from("availability_slots")
        .select("id")
        .eq("coach_id", coachId)
        .eq("is_recurring", true);

      expect(data).toHaveLength(0);
    });

    it("cleanup — delete test user and coach", async () => {
      await serviceClient.from("coaches").delete().eq("user_id", userId);
      await serviceClient.auth.admin.deleteUser(userId);
    });
  }
);
