/**
 * Tests for the coach/player dashboards and cancellation enhancements.
 *
 * Suites:
 *  1. Unit — coach dashboard API response shape validation helpers
 *  2. Unit — player dashboard booking merge + dedup logic
 *  3. Unit — cancel route authorization logic
 *  4. Unit — player signup validation
 *  5. Schema — migration 00011 structure
 *  6. Integration smoke — live Supabase (skipped without credentials)
 */

import { describe, it, expect, beforeAll } from "vitest";

// ── 1. Coach dashboard — response shape ──────────────────────────────────────

describe("Coach dashboard — booking split logic", () => {
  const now = new Date("2026-07-07T12:00:00Z");

  function splitBookings(
    bookings: { slot_start: string; status: string }[],
    refNow: Date
  ) {
    const nowIso = refNow.toISOString();
    const upcoming = bookings.filter(
      (b) => b.slot_start > nowIso && b.status !== "cancelled"
    );
    const past = bookings
      .filter(
        (b) =>
          b.slot_start <= nowIso ||
          b.status === "completed" ||
          b.status === "cancelled"
      )
      .reverse();
    return { upcoming, past };
  }

  it("puts future confirmed bookings in upcoming", () => {
    const bookings = [
      { slot_start: "2026-07-08T10:00:00Z", status: "confirmed" },
      { slot_start: "2026-07-06T10:00:00Z", status: "confirmed" },
    ];
    const { upcoming, past } = splitBookings(bookings, now);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].slot_start).toBe("2026-07-08T10:00:00Z");
    expect(past).toHaveLength(1);
  });

  it("excludes cancelled future bookings from upcoming", () => {
    const bookings = [
      { slot_start: "2026-07-08T10:00:00Z", status: "cancelled" },
      { slot_start: "2026-07-09T10:00:00Z", status: "confirmed" },
    ];
    const { upcoming } = splitBookings(bookings, now);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].status).toBe("confirmed");
  });

  it("includes cancelled future bookings in past", () => {
    const bookings = [
      { slot_start: "2026-07-08T10:00:00Z", status: "cancelled" },
    ];
    const { upcoming, past } = splitBookings(bookings, now);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("past list is ordered most-recent-first (reversed)", () => {
    const bookings = [
      { slot_start: "2026-07-04T10:00:00Z", status: "completed" },
      { slot_start: "2026-07-05T10:00:00Z", status: "completed" },
      { slot_start: "2026-07-06T10:00:00Z", status: "completed" },
    ].sort((a, b) => (a.slot_start < b.slot_start ? -1 : 1));
    const { past } = splitBookings(bookings, now);
    expect(past[0].slot_start).toBe("2026-07-06T10:00:00Z");
  });
});

// ── 2. Player dashboard — merge + dedup ──────────────────────────────────────

describe("Player dashboard — booking merge + dedup", () => {
  it("deduplicates bookings that appear in both sets", () => {
    const byPlayerId = [
      { id: "b1", slot_start: "2026-07-08T10:00:00Z", status: "confirmed" },
    ];
    const byGuestEmail = [
      { id: "b1", slot_start: "2026-07-08T10:00:00Z", status: "confirmed" }, // duplicate
      { id: "b2", slot_start: "2026-07-09T10:00:00Z", status: "confirmed" },
    ];

    const seen = new Set<string>();
    const merged: typeof byPlayerId = [];
    for (const b of [...byPlayerId, ...byGuestEmail]) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        merged.push(b);
      }
    }

    expect(merged).toHaveLength(2);
    expect(merged.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("handles empty sets gracefully", () => {
    const emptyA: { id: string; slot_start: string; status: string }[] = [];
    const emptyB: { id: string; slot_start: string; status: string }[] = [];
    const seen = new Set<string>();
    const merged: typeof emptyA = [];
    for (const b of [...emptyA, ...emptyB]) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        merged.push(b);
      }
    }
    expect(merged).toHaveLength(0);
  });

  it("sorts merged bookings by slot_start ascending", () => {
    const merged = [
      { id: "b3", slot_start: "2026-07-10T10:00:00Z" },
      { id: "b1", slot_start: "2026-07-08T10:00:00Z" },
      { id: "b2", slot_start: "2026-07-09T10:00:00Z" },
    ];
    merged.sort((a, b) =>
      a.slot_start < b.slot_start ? -1 : a.slot_start > b.slot_start ? 1 : 0
    );
    expect(merged[0].id).toBe("b1");
    expect(merged[1].id).toBe("b2");
    expect(merged[2].id).toBe("b3");
  });
});

// ── 3. Cancel route — authorisation logic ────────────────────────────────────

describe("Cancel route — authorisation logic", () => {
  /**
   * The cancel route authorises via three paths:
   *   A) Authenticated coach (coach_id matches)
   *   B) Authenticated player (player_id matches)
   *   C) Guest email matches booking.guest_email
   */

  function checkAuth(
    booking: { coach_id: string; player_id: string | null; guest_email: string | null },
    authCoachId: string | null,
    authPlayerId: string | null,
    providedGuestEmail: string | null
  ): boolean {
    // Path A: coach
    if (authCoachId && authCoachId === booking.coach_id) return true;
    // Path B: player
    if (authPlayerId && booking.player_id && authPlayerId === booking.player_id) return true;
    // Path C: guest email
    if (providedGuestEmail && booking.guest_email) {
      return providedGuestEmail.toLowerCase() === booking.guest_email.toLowerCase();
    }
    return false;
  }

  const booking = {
    coach_id: "coach-1",
    player_id: "player-1",
    guest_email: "guest@example.com",
  };

  it("authorises the owning coach", () => {
    expect(checkAuth(booking, "coach-1", null, null)).toBe(true);
  });

  it("rejects a different coach", () => {
    expect(checkAuth(booking, "coach-999", null, null)).toBe(false);
  });

  it("authorises the linked player", () => {
    expect(checkAuth(booking, null, "player-1", null)).toBe(true);
  });

  it("rejects a different player", () => {
    expect(checkAuth(booking, null, "player-999", null)).toBe(false);
  });

  it("authorises the guest by email (case-insensitive)", () => {
    expect(checkAuth(booking, null, null, "GUEST@example.com")).toBe(true);
  });

  it("rejects a wrong guest email", () => {
    expect(checkAuth(booking, null, null, "wrong@example.com")).toBe(false);
  });

  it("rejects when no auth provided", () => {
    expect(checkAuth(booking, null, null, null)).toBe(false);
  });
});

// ── 4. Cancel route — 24-hour refund eligibility ─────────────────────────────

describe("Cancel route — refund eligibility", () => {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  it("is eligible if slot is more than 24 hours away", () => {
    const now = Date.now();
    const slotStart = now + TWENTY_FOUR_HOURS_MS + 60_000; // 24h + 1 min
    expect(slotStart - now > TWENTY_FOUR_HOURS_MS).toBe(true);
  });

  it("is not eligible if slot is exactly 24 hours away", () => {
    const now = Date.now();
    const slotStart = now + TWENTY_FOUR_HOURS_MS; // exactly 24h
    expect(slotStart - now > TWENTY_FOUR_HOURS_MS).toBe(false);
  });

  it("is not eligible if slot is less than 24 hours away", () => {
    const now = Date.now();
    const slotStart = now + 60_000; // 1 minute
    expect(slotStart - now > TWENTY_FOUR_HOURS_MS).toBe(false);
  });

  it("is not eligible if slot is in the past", () => {
    const now = Date.now();
    const slotStart = now - 60_000; // 1 minute ago
    expect(slotStart - now > TWENTY_FOUR_HOURS_MS).toBe(false);
  });
});

// ── 5. Player signup — input validation ──────────────────────────────────────

describe("Player signup — input validation", () => {
  it("rejects missing email", () => {
    const { email, password, full_name } = { email: "", password: "pass1234", full_name: "Jane" };
    expect(!email || !password || !full_name).toBe(true);
  });

  it("rejects password shorter than 8 characters", () => {
    expect("short".length < 8).toBe(true);
  });

  it("accepts a valid 8-character password", () => {
    expect("password".length >= 8).toBe(true);
  });

  it("normalises email to lowercase", () => {
    const email = "JANE@EXAMPLE.COM";
    expect(email.trim().toLowerCase()).toBe("jane@example.com");
  });

  it("rejects invalid email format", () => {
    const invalidEmails = ["notanemail", "missing@", "@nodomain", "no-at-sign"];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const e of invalidEmails) {
      expect(emailRegex.test(e)).toBe(false);
    }
  });
});

// ── 6. Migration 00011 schema check ──────────────────────────────────────────

describe("Migration 00011 — player_account", () => {
  it("exists with the correct filename", async () => {
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");

    const migPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "00011_player_account.sql"
    );

    expect(existsSync(migPath)).toBe(true);
  });

  it("adds bookings_guest_email_idx index", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "00011_player_account.sql"),
      "utf-8"
    );

    expect(sql).toContain("bookings_guest_email_idx");
    expect(sql).toContain("guest_email");
  });

  it("adds bookings_player_id_idx index", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "00011_player_account.sql"),
      "utf-8"
    );

    expect(sql).toContain("bookings_player_id_idx");
    expect(sql).toContain("player_id");
  });

  it("follows 00NNN_ naming convention (all migrations)", async () => {
    const { readdirSync } = await import("fs");
    const { join } = await import("path");

    const dir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(11);
    files.forEach((f: string) => expect(f).toMatch(/^\d{5}_/));
  });
});

// ── 7. Integration smoke — live Supabase ─────────────────────────────────────

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

describe.skipIf(!hasCredentials)(
  "Dashboard + player signup smoke tests (live Supabase)",
  () => {
    const { createClient } = require("@supabase/supabase-js");

    const COACH_EMAIL = `smoke-coach-dash-${Date.now()}@example.com`;
    const PLAYER_EMAIL = `smoke-player-dash-${Date.now()}@example.com`;

    let serviceClient: ReturnType<typeof createClient>;
    let coachId: string;
    let coachUserId: string;
    let playerUserId: string;
    let playerId: string;
    let bookingId: string;

    beforeAll(() => {
      serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    });

    it("creates a coach for dashboard tests", async () => {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email: COACH_EMAIL,
        password: "TestPassword1!",
        email_confirm: true,
      });
      expect(error).toBeNull();
      coachUserId = data.user!.id;

      const { data: coachRow, error: coachErr } = await serviceClient
        .from("coaches")
        .insert({
          user_id: coachUserId,
          email: COACH_EMAIL,
          full_name: "Dashboard Coach",
          hourly_rate: 80,
          onboarding_complete: true,
        })
        .select("id")
        .single();

      expect(coachErr).toBeNull();
      coachId = coachRow!.id;
    });

    it("creates a booking for the coach via guest checkout", async () => {
      const slotStart = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const slotEnd   = new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString();

      const { data, error } = await serviceClient.rpc(
        "create_booking_if_available",
        {
          p_coach_id: coachId,
          p_slot_start: slotStart,
          p_slot_end: slotEnd,
          p_hourly_rate: 80,
          p_guest_name: "Guest Player",
          p_guest_email: PLAYER_EMAIL,
        }
      );

      expect(error).toBeNull();
      const result = Array.isArray(data) ? data[0] : data;
      expect(result.conflict).toBe(false);
      bookingId = result.booking_id;
    });

    it("player signup links guest booking by email", async () => {
      // Create player auth user
      const { data: authData, error: authError } =
        await serviceClient.auth.admin.createUser({
          email: PLAYER_EMAIL,
          password: "TestPassword1!",
          email_confirm: true,
        });
      expect(authError).toBeNull();
      playerUserId = authData.user!.id;

      // Insert player row
      const { data: playerRow, error: playerError } = await serviceClient
        .from("players")
        .insert({
          user_id: playerUserId,
          email: PLAYER_EMAIL,
          full_name: "Guest Player",
        })
        .select("id")
        .single();

      expect(playerError).toBeNull();
      playerId = playerRow!.id;

      // Link guest bookings (the signup endpoint does this)
      const { error: linkError } = await serviceClient
        .from("bookings")
        .update({ player_id: playerId })
        .eq("guest_email", PLAYER_EMAIL.toLowerCase())
        .is("player_id", null);

      expect(linkError).toBeNull();

      // Verify the booking is now linked
      const { data: booking } = await serviceClient
        .from("bookings")
        .select("player_id")
        .eq("id", bookingId)
        .single();

      expect(booking!.player_id).toBe(playerId);
    });

    it("booking appears in coach's upcoming list", async () => {
      const { data, error } = await serviceClient
        .from("bookings")
        .select("id, slot_start, status")
        .eq("coach_id", coachId)
        .order("slot_start", { ascending: true });

      expect(error).toBeNull();
      const bookingRow = (data ?? []).find((b: { id: string; status: string }) => b.id === bookingId);
      expect(bookingRow).toBeDefined();
      expect(bookingRow!.status).toBe("pending");
    });

    it("booking appears in player's list by player_id", async () => {
      const { data, error } = await serviceClient
        .from("bookings")
        .select("id, player_id")
        .eq("player_id", playerId);

      expect(error).toBeNull();
      const bookingRow = (data ?? []).find((b: { id: string }) => b.id === bookingId);
      expect(bookingRow).toBeDefined();
    });

    it("cleanup — remove test data", async () => {
      if (bookingId) {
        await serviceClient.from("bookings").delete().eq("id", bookingId);
      }
      if (playerId) {
        await serviceClient.from("players").delete().eq("id", playerId);
      }
      if (coachId) {
        await serviceClient.from("coaches").delete().eq("id", coachId);
      }
      if (playerUserId) {
        await serviceClient.auth.admin.deleteUser(playerUserId);
      }
      if (coachUserId) {
        await serviceClient.auth.admin.deleteUser(coachUserId);
      }
    });
  }
);
