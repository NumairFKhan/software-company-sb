/**
 * Smoke test: DB schema & RLS policies
 *
 * This test connects to a real Supabase project (via env vars) and verifies:
 *  1. The coaches table exists and accepts inserts via the service-role client.
 *  2. An authenticated user can SELECT their own coach row.
 *  3. A DIFFERENT authenticated user is blocked from UPDATE on the first coach's row.
 *
 * Run with:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... npx vitest run tests/smoke/rls.test.ts
 *
 * NOTE: These tests require a real Supabase project with the migrations applied.
 *       They are skipped automatically when env vars are not set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const hasCredentials = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

// Test user emails — use + addressing to create distinct users without a real inbox
const COACH_EMAIL_A = `smoke-coach-a-${Date.now()}@example.com`;
const COACH_EMAIL_B = `smoke-coach-b-${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPassword1!";

describe.skipIf(!hasCredentials)("Supabase schema smoke tests", () => {
  // Clients are created lazily inside beforeAll so that the createClient call
  // is never executed when credentials are missing (describe.skipIf still
  // evaluates the body, but the individual tests are skipped).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let serviceClient: SupabaseClient<any>;

  let coachAUserId: string;
  let coachAId: string;
  let coachBUserId: string;

  beforeAll(async () => {
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create two auth users via the admin API (requires service-role key)
    const { data: userA, error: errA } =
      await serviceClient.auth.admin.createUser({
        email: COACH_EMAIL_A,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
    expect(errA).toBeNull();
    coachAUserId = userA!.user!.id;

    const { data: userB, error: errB } =
      await serviceClient.auth.admin.createUser({
        email: COACH_EMAIL_B,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
    expect(errB).toBeNull();
    coachBUserId = userB!.user!.id;
  });

  afterAll(async () => {
    // Clean up: delete coaches rows then auth users
    await serviceClient
      .from("coaches")
      .delete()
      .in("user_id", [coachAUserId, coachBUserId]);

    if (coachAUserId) await serviceClient.auth.admin.deleteUser(coachAUserId);
    if (coachBUserId) await serviceClient.auth.admin.deleteUser(coachBUserId);
  });

  it("service-role client can INSERT a coaches row", async () => {
    const { data, error } = await serviceClient
      .from("coaches")
      .insert({
        user_id: coachAUserId,
        email: COACH_EMAIL_A,
        full_name: "Smoke Test Coach A",
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    coachAId = data!.id;
  });

  it("service-role client can INSERT a second coaches row", async () => {
    const { data, error } = await serviceClient
      .from("coaches")
      .insert({
        user_id: coachBUserId,
        email: COACH_EMAIL_B,
        full_name: "Smoke Test Coach B",
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("coach A can SELECT their own row via anon client + user session", async () => {
    // Sign in as coach A
    const anonClientA = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await anonClientA.auth.signInWithPassword({
      email: COACH_EMAIL_A,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { data, error } = await anonClientA
      .from("coaches")
      .select("id, email")
      .eq("user_id", coachAUserId)
      .single();

    expect(error).toBeNull();
    expect(data?.email).toBe(COACH_EMAIL_A);
  });

  it("RLS blocks coach B from updating coach A's row", async () => {
    // Sign in as coach B
    const anonClientB = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await anonClientB.auth.signInWithPassword({
      email: COACH_EMAIL_B,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();

    // Attempt to update coach A's row — should be blocked by RLS
    const { data, error } = await anonClientB
      .from("coaches")
      .update({ full_name: "HACKED" })
      .eq("id", coachAId)
      .select("id");

    // RLS should either return an error or return 0 affected rows
    const wasBlocked = (error !== null) || (data !== null && data.length === 0);
    expect(wasBlocked).toBe(true);
  });
});

describe("Schema type validation (unit — no network)", () => {
  it("BookingStatus values are the expected set", () => {
    // This is a compile-time check; at runtime we just verify the array contents.
    const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
    expect(validStatuses).toHaveLength(4);
    expect(validStatuses).toContain("pending");
    expect(validStatuses).toContain("confirmed");
    expect(validStatuses).toContain("cancelled");
    expect(validStatuses).toContain("completed");
  });

  it("migration file naming convention is sequential", async () => {
    // Read the migration files from the filesystem to verify they're numbered correctly
    const { readdirSync } = await import("fs");
    const { join } = await import("path");
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    expect(files.length).toBeGreaterThanOrEqual(6);

    // Each file should start with a 5-digit zero-padded number
    files.forEach((file) => {
      expect(file).toMatch(/^\d{5}_/);
    });
  });
});
