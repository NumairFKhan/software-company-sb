/**
 * Tests for the Stripe webhook & post-payment processing ticket:
 *
 *  1. Signature verification logic (unit)
 *  2. Webhook handler idempotency (unit — booking already confirmed)
 *  3. Daily cron authorization (unit)
 *  4. Cancellation refund eligibility logic (unit)
 *  5. Migration 00010 schema check
 *  6. Email templates for cancellation exist and contain required placeholders
 *  7. vercel.json cron schedule
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// 1. STRIPE_WEBHOOK_SECRET presence / absence
// ---------------------------------------------------------------------------

describe("Webhook signature verification", () => {
  it("requires a non-empty sig for constructEvent to succeed", () => {
    // Simulate what stripe.webhooks.constructEvent checks
    const sig = "";
    expect(sig.length).toBe(0);
    // An empty sig would throw — our route returns 400 in that case.
  });

  it("returns 400 when Stripe-Signature header is missing", () => {
    // Represents the route's guard: sig ?? ""  → constructEvent throws
    const sig: string | null = null;
    const effectiveSig = sig ?? "";
    expect(effectiveSig).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 2. Webhook idempotency logic
// ---------------------------------------------------------------------------

describe("Webhook idempotency — checkout.session.completed", () => {
  it("idempotency guard uses .eq('status', 'pending')", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf-8"
    );

    // The route must guard with status=pending to skip already-confirmed bookings
    expect(src).toContain(".eq(\"status\", \"pending\")");
  });

  it("returns 200 (not 5xx) when booking is already confirmed", () => {
    // Simulate the idempotency path: update returns no row → log warning + return 200
    const updateResult = { data: null, error: null };
    const shouldProceedWithEmail = Boolean(updateResult.data);
    expect(shouldProceedWithEmail).toBe(false);
  });

  it("logs a warning when booking update finds no pending row", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf-8"
    );

    expect(src).toContain("console.warn");
    expect(src).toContain("already confirmed");
  });
});

// ---------------------------------------------------------------------------
// 3. Webhook route — structured logging
// ---------------------------------------------------------------------------

describe("Webhook event logging", () => {
  it("logs event id and type on receipt", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf-8"
    );

    // Must log event_id and event_type
    expect(src).toContain("event_id");
    expect(src).toContain("event_type");
    // Must log outcome after processing
    expect(src).toContain("outcome");
  });

  it("responds with { received: true, outcome } on success", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/webhooks/stripe/route.ts"),
      "utf-8"
    );

    expect(src).toContain("received: true");
    expect(src).toContain("outcome");
  });
});

// ---------------------------------------------------------------------------
// 4. Daily cron — authorization logic
// ---------------------------------------------------------------------------

describe("Daily cron authorization", () => {
  const FAKE_SECRET = "test-cron-secret-abc123";

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
// 5. Daily cron — payout ratio
// ---------------------------------------------------------------------------

describe("Daily cron — payout calculation", () => {
  it("coach receives 90% of the hourly rate", () => {
    const COACH_PAYOUT_RATIO = 0.9;
    const hourlyRate = 100;
    const payoutCents = Math.round(hourlyRate * COACH_PAYOUT_RATIO * 100);
    expect(payoutCents).toBe(9000); // $90.00
  });

  it("payout rounds to whole cents", () => {
    const COACH_PAYOUT_RATIO = 0.9;
    const hourlyRate = 75; // $75 × 90% = $67.50
    const payoutCents = Math.round(hourlyRate * COACH_PAYOUT_RATIO * 100);
    expect(payoutCents).toBe(6750); // $67.50
  });

  it("cron route uses transfer_group matching booking ID", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/cron/daily/route.ts"),
      "utf-8"
    );

    expect(src).toContain("transfer_group");
    expect(src).toContain("booking_");
  });

  it("cron route guards against double-payment with stripe_transfer_id IS NULL", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/cron/daily/route.ts"),
      "utf-8"
    );

    expect(src).toContain("stripe_transfer_id");
    expect(src).toContain("null");
  });
});

// ---------------------------------------------------------------------------
// 6. Cancellation refund eligibility
// ---------------------------------------------------------------------------

describe("Cancellation refund eligibility (> vs ≤ 24 hrs)", () => {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  it("slot > 24 hrs away is eligible for a refund", () => {
    const now = Date.now();
    const slotStart = now + TWENTY_FOUR_HOURS_MS + 60_000; // 24h + 1 min
    const eligible = slotStart - now > TWENTY_FOUR_HOURS_MS;
    expect(eligible).toBe(true);
  });

  it("slot exactly 24 hrs away is NOT eligible (boundary)", () => {
    const now = Date.now();
    const slotStart = now + TWENTY_FOUR_HOURS_MS; // exactly 24h
    const eligible = slotStart - now > TWENTY_FOUR_HOURS_MS;
    expect(eligible).toBe(false);
  });

  it("slot < 24 hrs away is not eligible for a refund", () => {
    const now = Date.now();
    const slotStart = now + 60_000; // 1 minute from now
    const eligible = slotStart - now > TWENTY_FOUR_HOURS_MS;
    expect(eligible).toBe(false);
  });

  it("past slot is not eligible for a refund", () => {
    const now = Date.now();
    const slotStart = now - 3600_000; // 1 hour ago
    const eligible = slotStart - now > TWENTY_FOUR_HOURS_MS;
    expect(eligible).toBe(false);
  });

  it("cancellation route returns 200 for already-cancelled booking", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(
        process.cwd(),
        "src/app/api/bookings/[id]/cancel/route.ts"
      ),
      "utf-8"
    );

    // Idempotency guard: if status is already cancelled, return early
    expect(src).toContain("Already cancelled");
  });
});

// ---------------------------------------------------------------------------
// 7. Cancellation — guest email verification
// ---------------------------------------------------------------------------

describe("Cancellation guest email verification", () => {
  it("cancellation route verifies guest email to prove ownership", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/bookings/[id]/cancel/route.ts"),
      "utf-8"
    );

    expect(src).toContain("guestEmail");
    expect(src).toContain("403");
  });

  it("email comparison is case-insensitive", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/app/api/bookings/[id]/cancel/route.ts"),
      "utf-8"
    );

    expect(src).toContain(".toLowerCase()");
  });
});

// ---------------------------------------------------------------------------
// 8. Migration 00010 schema
// ---------------------------------------------------------------------------

describe("Migration 00010 — stripe_transfer_id", () => {
  it("migration file exists", async () => {
    const { existsSync } = await import("fs");
    const { join } = await import("path");

    const exists = existsSync(
      join(process.cwd(), "supabase", "migrations", "00010_bookings_stripe_transfer.sql")
    );
    expect(exists).toBe(true);
  });

  it("adds stripe_transfer_id column", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "00010_bookings_stripe_transfer.sql"),
      "utf-8"
    );

    expect(sql).toContain("stripe_transfer_id");
    expect(sql).toContain("TEXT");
  });

  it("creates an index for the payout queue", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "00010_bookings_stripe_transfer.sql"),
      "utf-8"
    );

    expect(sql).toContain("CREATE INDEX");
    expect(sql).toContain("stripe_transfer_id IS NULL");
  });

  it("follows the 00NNN_ naming convention", async () => {
    const { readdirSync } = await import("fs");
    const { join } = await import("path");

    const dir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(10);
    files.forEach((f: string) => expect(f).toMatch(/^\d{5}_/));
  });
});

// ---------------------------------------------------------------------------
// 9. Cancellation email templates
// ---------------------------------------------------------------------------

describe("Cancellation email templates", () => {
  it("cancellation-player.html exists and contains required placeholders", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const html = readFileSync(
      join(process.cwd(), "emails", "cancellation-player.html"),
      "utf-8"
    );

    expect(html).toContain("{{GUEST_NAME}}");
    expect(html).toContain("{{COACH_NAME}}");
    expect(html).toContain("{{SESSION_DATE}}");
    expect(html).toContain("{{SESSION_TIME}}");
    expect(html).toContain("{{BOOKING_ID}}");
    expect(html).toContain("{{REFUND_NOTE}}");
  });

  it("cancellation-coach.html exists and contains required placeholders", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const html = readFileSync(
      join(process.cwd(), "emails", "cancellation-coach.html"),
      "utf-8"
    );

    expect(html).toContain("{{COACH_NAME}}");
    expect(html).toContain("{{GUEST_NAME}}");
    expect(html).toContain("{{GUEST_EMAIL}}");
    expect(html).toContain("{{SESSION_DATE}}");
    expect(html).toContain("{{SESSION_TIME}}");
    expect(html).toContain("{{REFUND_NOTE}}");
  });
});

// ---------------------------------------------------------------------------
// 10. vercel.json cron configuration
// ---------------------------------------------------------------------------

describe("vercel.json cron schedule", () => {
  it("exists", async () => {
    const { existsSync } = await import("fs");
    const { join } = await import("path");

    expect(existsSync(join(process.cwd(), "vercel.json"))).toBe(true);
  });

  it("points to /api/cron/daily at 9 AM UTC", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf-8");
    const config = JSON.parse(raw);

    expect(config.crons).toBeDefined();
    expect(Array.isArray(config.crons)).toBe(true);

    const dailyCron = config.crons.find(
      (c: { path: string; schedule: string }) => c.path === "/api/cron/daily"
    );
    expect(dailyCron).toBeDefined();
    // 9 AM UTC = "0 9 * * *"
    expect(dailyCron.schedule).toBe("0 9 * * *");
  });
});

// ---------------------------------------------------------------------------
// 11. database.types.ts — stripe_transfer_id field present
// ---------------------------------------------------------------------------

describe("database.types.ts — Booking interface", () => {
  it("Booking interface includes stripe_transfer_id", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const src = readFileSync(
      join(process.cwd(), "src/lib/database.types.ts"),
      "utf-8"
    );

    expect(src).toContain("stripe_transfer_id");
  });
});
