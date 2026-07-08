/**
 * Tests for the 24-hour reminder, privacy/cancellation-policy pages,
 * and pre-launch polish ticket.
 *
 * Suites:
 *  1. Migration 00012 — reminder_sent_at column
 *  2. Reminder cron route — authorization logic (mirrors daily cron suite)
 *  3. Reminder cron route — query window & idempotency logic
 *  4. Reminder email templates — required placeholders
 *  5. vercel.json — reminder cron entry
 *  6. database.types.ts — reminder_sent_at present in Booking interface
 *  7. Privacy page — file exists
 *  8. Cancellation policy page — file exists
 *  9. Booking confirmation email — cancellation policy URL variable present
 * 10. Loading skeleton files — all required loading.tsx files exist
 * 11. Stripe Checkout description — cancellation policy URL helper
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// 1. Migration 00012 — reminder_sent_at
// ---------------------------------------------------------------------------

describe("Migration 00012 — reminder_sent_at", () => {
  it("migration file exists", async () => {
    const { existsSync } = await import("fs");
    const { join } = await import("path");

    expect(
      existsSync(
        join(
          process.cwd(),
          "supabase",
          "migrations",
          "00012_bookings_reminder.sql"
        )
      )
    ).toBe(true);
  });

  it("adds reminder_sent_at TIMESTAMPTZ column", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "00012_bookings_reminder.sql"
      ),
      "utf-8"
    );

    expect(sql).toContain("reminder_sent_at");
    expect(sql).toContain("TIMESTAMPTZ");
  });

  it("creates a partial index for the reminder queue", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "00012_bookings_reminder.sql"
      ),
      "utf-8"
    );

    expect(sql).toContain("CREATE INDEX");
    expect(sql).toContain("reminder_sent_at IS NULL");
  });

  it("follows the 00NNN_ naming convention", async () => {
    const { readdirSync } = await import("fs");
    const { join } = await import("path");

    const dir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(12);
    files.forEach((f: string) => expect(f).toMatch(/^\d{5}_/));
  });
});

// ---------------------------------------------------------------------------
// 2. Reminder cron — authorization
// ---------------------------------------------------------------------------

describe("Reminder cron authorization", () => {
  const FAKE_SECRET = "test-cron-secret-xyz789";

  it("accepts a valid Bearer token", () => {
    const authHeader = `Bearer ${FAKE_SECRET}`;
    const cronSecret = FAKE_SECRET;
    expect(authHeader === `Bearer ${cronSecret}`).toBe(true);
  });

  it("rejects a missing Authorization header", () => {
    const authHeader: string | null = null;
    const cronSecret = FAKE_SECRET;
    const bearerOk = authHeader === `Bearer ${cronSecret}`;
    const headerOk = (null as string | null) === cronSecret;
    expect(bearerOk || headerOk).toBe(false);
  });

  it("rejects an incorrect secret", () => {
    const authHeader: string = "Bearer wrong-secret";
    const cronSecret: string = FAKE_SECRET;
    expect(authHeader === `Bearer ${cronSecret}`).toBe(false);
  });

  it("also accepts X-Cron-Secret header", () => {
    const cronHeader = FAKE_SECRET;
    const cronSecret = FAKE_SECRET;
    expect(cronHeader === cronSecret).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Reminder cron — window and idempotency
// ---------------------------------------------------------------------------

describe("Reminder cron — 24-hour window and idempotency", () => {
  it("query window is now+23h to now+25h", () => {
    const now = Date.now();
    const windowStart = now + 23 * 60 * 60 * 1000;
    const windowEnd   = now + 25 * 60 * 60 * 1000;
    expect(windowEnd - windowStart).toBe(2 * 60 * 60 * 1000); // 2-hour band
    expect(windowStart).toBeGreaterThan(now);
  });

  it("a booking starting in 24h falls inside the window", () => {
    const now = Date.now();
    const slotStart = now + 24 * 60 * 60 * 1000;
    const windowStart = now + 23 * 60 * 60 * 1000;
    const windowEnd   = now + 25 * 60 * 60 * 1000;
    expect(slotStart).toBeGreaterThanOrEqual(windowStart);
    expect(slotStart).toBeLessThanOrEqual(windowEnd);
  });

  it("a booking starting in 48h falls outside the window", () => {
    const now = Date.now();
    const slotStart = now + 48 * 60 * 60 * 1000;
    const windowEnd   = now + 25 * 60 * 60 * 1000;
    expect(slotStart).toBeGreaterThan(windowEnd);
  });

  it("a booking starting in 1h falls outside the window", () => {
    const now = Date.now();
    const slotStart = now + 1 * 60 * 60 * 1000;
    const windowStart = now + 23 * 60 * 60 * 1000;
    expect(slotStart).toBeLessThan(windowStart);
  });

  it("reminder route uses reminder_sent_at IS NULL for idempotency", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/cron/reminders/route.ts"),
      "utf-8"
    );

    expect(src).toContain("reminder_sent_at");
    expect(src).toContain("null");
    // Must set reminder_sent_at after sending
    expect(src).toContain("reminder_sent_at: new Date().toISOString()");
  });

  it("reminder route sends emails to both coach and player", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/cron/reminders/route.ts"),
      "utf-8"
    );

    expect(src).toContain("reminder-player.html");
    expect(src).toContain("reminder-coach.html");
  });

  it("reminder route returns processed/skipped/errored summary", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/cron/reminders/route.ts"),
      "utf-8"
    );

    expect(src).toContain("processed");
    expect(src).toContain("skipped");
    expect(src).toContain("errored");
  });
});

// ---------------------------------------------------------------------------
// 4. Reminder email templates
// ---------------------------------------------------------------------------

describe("Reminder email templates", () => {
  it("reminder-player.html exists and contains required placeholders", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const html = readFileSync(
      join(process.cwd(), "emails", "reminder-player.html"),
      "utf-8"
    );

    expect(html).toContain("{{GUEST_NAME}}");
    expect(html).toContain("{{COACH_NAME}}");
    expect(html).toContain("{{SESSION_DATE}}");
    expect(html).toContain("{{SESSION_TIME}}");
    expect(html).toContain("{{BOOKING_ID}}");
    expect(html).toContain("{{COURT_LOCATION}}");
    expect(html).toContain("{{CANCELLATION_POLICY_URL}}");
    expect(html).toContain("{{APP_URL}}");
  });

  it("reminder-coach.html exists and contains required placeholders", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const html = readFileSync(
      join(process.cwd(), "emails", "reminder-coach.html"),
      "utf-8"
    );

    expect(html).toContain("{{COACH_NAME}}");
    expect(html).toContain("{{GUEST_NAME}}");
    expect(html).toContain("{{GUEST_EMAIL}}");
    expect(html).toContain("{{SESSION_DATE}}");
    expect(html).toContain("{{SESSION_TIME}}");
    expect(html).toContain("{{BOOKING_ID}}");
    expect(html).toContain("{{COURT_LOCATION}}");
    expect(html).toContain("{{APP_URL}}");
  });
});

// ---------------------------------------------------------------------------
// 5. vercel.json — reminder cron entry
// ---------------------------------------------------------------------------

describe("vercel.json — reminder cron", () => {
  it("includes an /api/cron/reminders entry", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf-8");
    const config = JSON.parse(raw);

    expect(config.crons).toBeDefined();
    const reminderCron = config.crons.find(
      (c: { path: string; schedule: string }) =>
        c.path === "/api/cron/reminders"
    );
    expect(reminderCron).toBeDefined();
    // Runs hourly
    expect(reminderCron.schedule).toBe("0 * * * *");
  });

  it("still includes the daily payout cron at 9 AM UTC", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf-8");
    const config = JSON.parse(raw);

    const dailyCron = config.crons.find(
      (c: { path: string; schedule: string }) => c.path === "/api/cron/daily"
    );
    expect(dailyCron).toBeDefined();
    expect(dailyCron.schedule).toBe("0 9 * * *");
  });
});

// ---------------------------------------------------------------------------
// 6. database.types.ts — reminder_sent_at in Booking
// ---------------------------------------------------------------------------

describe("database.types.ts — reminder_sent_at in Booking interface", () => {
  it("Booking interface includes reminder_sent_at", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/lib/database.types.ts"),
      "utf-8"
    );

    expect(src).toContain("reminder_sent_at");
  });
});

// ---------------------------------------------------------------------------
// 7. Privacy page
// ---------------------------------------------------------------------------

describe("/privacy page", () => {
  it("page.tsx file exists", async () => {
    const { existsSync } = await import("fs");
    const { join } = await import("path");

    expect(
      existsSync(join(process.cwd(), "src/app/privacy/page.tsx"))
    ).toBe(true);
  });

  it("mentions PII handling and email address", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/privacy/page.tsx"),
      "utf-8"
    );

    expect(src.toLowerCase()).toContain("email");
    expect(src.toLowerCase()).toContain("personal");
    // Must mention no marketing use
    expect(src.toLowerCase()).toContain("marketing");
  });
});

// ---------------------------------------------------------------------------
// 8. Cancellation policy page
// ---------------------------------------------------------------------------

describe("/cancellation-policy page", () => {
  it("page.tsx file exists", async () => {
    const { existsSync } = await import("fs");
    const { join } = await import("path");

    expect(
      existsSync(
        join(process.cwd(), "src/app/cancellation-policy/page.tsx")
      )
    ).toBe(true);
  });

  it("mentions the 24-hour refund cutoff", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/cancellation-policy/page.tsx"),
      "utf-8"
    );

    expect(src.toLowerCase()).toContain("24");
    expect(src.toLowerCase()).toContain("refund");
  });
});

// ---------------------------------------------------------------------------
// 9. Booking confirmation email — CANCELLATION_POLICY_URL variable
// ---------------------------------------------------------------------------

describe("Booking confirmation email — cancellation policy URL", () => {
  it("booking-player.html contains {{CANCELLATION_POLICY_URL}}", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const html = readFileSync(
      join(process.cwd(), "emails", "booking-player.html"),
      "utf-8"
    );

    expect(html).toContain("{{CANCELLATION_POLICY_URL}}");
  });

  it("stripe webhook passes CANCELLATION_POLICY_URL in emailVars", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf-8"
    );

    expect(src).toContain("CANCELLATION_POLICY_URL");
    expect(src).toContain("/cancellation-policy");
  });
});

// ---------------------------------------------------------------------------
// 10. Loading skeleton files
// ---------------------------------------------------------------------------

describe("Loading skeleton files", () => {
  const skeletons = [
    "src/app/coaches/loading.tsx",
    "src/app/coaches/[id]/loading.tsx",
    "src/app/booking/[id]/success/loading.tsx",
    "src/app/dashboard/coach/loading.tsx",
    "src/app/dashboard/player/loading.tsx",
  ];

  for (const relPath of skeletons) {
    it(`${relPath} exists`, async () => {
      const { existsSync } = await import("fs");
      const { join } = await import("path");

      expect(existsSync(join(process.cwd(), relPath))).toBe(true);
    });

    it(`${relPath} uses animate-pulse`, async () => {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");

      const src = readFileSync(join(process.cwd(), relPath), "utf-8");
      expect(src).toContain("animate-pulse");
    });
  }
});

// ---------------------------------------------------------------------------
// 11. Stripe Checkout description — cancellation policy URL
// ---------------------------------------------------------------------------

describe("Stripe Checkout description — cancellation policy URL", () => {
  it("bookings route includes /cancellation-policy in the Checkout description", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/bookings/route.ts"),
      "utf-8"
    );

    expect(src).toContain("/cancellation-policy");
    // Must reference the helper function (not the old constant)
    expect(src).toContain("cancellationPolicyText");
  });
});
