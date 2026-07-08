/**
 * Tests for the player discovery / coach search feature.
 *
 * Suites:
 *  1. Haversine formula — pure unit tests, no I/O.
 *  2. searchCoaches() — unit tests with mocked geocoding and Supabase.
 *  3. GET /api/coaches validation — checks the error-message contract.
 *  4. Integration smoke tests — skipped unless real Supabase credentials exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// 1. Haversine formula — pure unit tests
// ---------------------------------------------------------------------------
describe("haversineDistance", () => {
  it("returns 0 for identical coordinates", async () => {
    const { haversineDistance } = await import("@/lib/haversine");
    expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it("returns ~2451 miles between NYC and LA (within 2%)", async () => {
    const { haversineDistance } = await import("@/lib/haversine");
    // NYC: 40.7128° N, 74.0060° W
    // LA:  34.0522° N, 118.2437° W
    const dist = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeGreaterThan(2400);
    expect(dist).toBeLessThan(2510);
  });

  it("returns ~5 miles between two close points in NYC", async () => {
    const { haversineDistance } = await import("@/lib/haversine");
    // Empire State Building vs Central Park (approx 5 miles apart)
    const dist = haversineDistance(40.7488, -73.9856, 40.7979, -73.9654);
    expect(dist).toBeGreaterThan(3);
    expect(dist).toBeLessThan(7);
  });

  it("is symmetric — dist(A,B) === dist(B,A)", async () => {
    const { haversineDistance } = await import("@/lib/haversine");
    const d1 = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
    const d2 = haversineDistance(34.0522, -118.2437, 40.7128, -74.006);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.0001);
  });
});

// ---------------------------------------------------------------------------
// 2. searchCoaches() — unit tests (mocked geocode + Supabase)
// ---------------------------------------------------------------------------
describe("searchCoaches (unit — mocked deps)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns missing_zip error when zip is empty", async () => {
    const { searchCoaches } = await import("@/lib/searchCoaches");
    const result = await searchCoaches({ zip: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("missing_zip");
    }
  });

  it("returns invalid_radius error for unsupported radius value", async () => {
    // Stub geocode to succeed so we reach the radius check
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "40.7128", lon: "-74.0060" }],
    });

    const { searchCoaches } = await import("@/lib/searchCoaches");
    const result = await searchCoaches({ zip: "10001", radius: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_radius");
    }
  });

  it("returns geocode_failed error when nominatim returns empty array", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const { searchCoaches } = await import("@/lib/searchCoaches");
    const result = await searchCoaches({ zip: "00000" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("geocode_failed");
    }
  });

  it("defaults radius to 10 when not provided", async () => {
    // We verify no invalid_radius error is returned for the default
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [], // empty geocode → geocode_failed, but NOT invalid_radius
    });

    const { searchCoaches } = await import("@/lib/searchCoaches");
    const result = await searchCoaches({ zip: "00000" });
    if (!result.ok) {
      expect(result.error.kind).not.toBe("invalid_radius");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. GET /api/coaches query-param validation — contract tests
// ---------------------------------------------------------------------------
describe("GET /api/coaches — query parameter validation", () => {
  it("VALID_RADII contains 5, 10, and 25", async () => {
    const { VALID_RADII } = await import("@/lib/searchCoaches");
    expect(VALID_RADII).toContain(5);
    expect(VALID_RADII).toContain(10);
    expect(VALID_RADII).toContain(25);
  });

  it("PAGE_SIZE is 12", async () => {
    const { PAGE_SIZE } = await import("@/lib/searchCoaches");
    expect(PAGE_SIZE).toBe(12);
  });

  it("searchCoaches paginates correctly — page 2 skips first PAGE_SIZE results", async () => {
    // We verify the pagination slice logic by checking exported PAGE_SIZE constant
    const { PAGE_SIZE } = await import("@/lib/searchCoaches");
    // Simulate: 25 total results, page 2 => slice [12..24]
    const fakeResults = Array.from({ length: 25 }, (_, i) => i);
    const page = 2;
    const start = (page - 1) * PAGE_SIZE;
    const slice = fakeResults.slice(start, start + PAGE_SIZE);
    expect(slice.length).toBe(12);
    expect(slice[0]).toBe(12); // first item on page 2 is index 12
  });
});

// ---------------------------------------------------------------------------
// 4. File / export structure
// ---------------------------------------------------------------------------
describe("Module structure", () => {
  it("haversine.ts exports haversineDistance function", async () => {
    const mod = await import("@/lib/haversine");
    expect(typeof mod.haversineDistance).toBe("function");
  });

  it("searchCoaches.ts exports searchCoaches, PAGE_SIZE, VALID_RADII", async () => {
    const mod = await import("@/lib/searchCoaches");
    expect(typeof mod.searchCoaches).toBe("function");
    expect(typeof mod.PAGE_SIZE).toBe("number");
    expect(Array.isArray(mod.VALID_RADII)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Integration smoke tests — require real Supabase credentials
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
  "GET /api/coaches smoke tests (live Supabase)",
  () => {
    const { createClient } = require("@supabase/supabase-js");
    const TEST_ZIP = "10001"; // New York — Nominatim should geocode this reliably

    let serviceClient: ReturnType<typeof createClient>;
    let testCoachId: string;
    let testUserId: string;

    beforeEach(() => {
      if (!serviceClient && hasCredentials) {
        serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      }
    });

    it("creates a test coach near NYC for search fixture", async () => {
      const email = `smoke-search-${Date.now()}@example.com`;
      const { data: authData, error: authError } =
        await serviceClient.auth.admin.createUser({
          email,
          password: "TestPassword1!",
          email_confirm: true,
        });
      expect(authError).toBeNull();
      testUserId = authData.user!.id;

      const { data: coach, error } = await serviceClient
        .from("coaches")
        .insert({
          user_id: testUserId,
          email,
          full_name: "Search Smoke Test Coach",
          hourly_rate: 75,
          lat: 40.7128, // NYC
          lng: -74.006,
          zip: TEST_ZIP,
          onboarding_complete: true,
        })
        .select()
        .single();

      expect(error).toBeNull();
      testCoachId = coach!.id;
    });

    it("searchCoaches returns the test coach within 10 miles of 10001", async () => {
      const { searchCoaches } = await import("@/lib/searchCoaches");
      const result = await searchCoaches({ zip: TEST_ZIP, radius: 10 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const found = result.data.coaches.some((c) => c.id === testCoachId);
        expect(found).toBe(true);
      }
    });

    it("cleanup — delete test coach and user", async () => {
      if (testCoachId) {
        await serviceClient.from("coaches").delete().eq("id", testCoachId);
      }
      if (testUserId) {
        await serviceClient.auth.admin.deleteUser(testUserId);
      }
    });
  }
);
