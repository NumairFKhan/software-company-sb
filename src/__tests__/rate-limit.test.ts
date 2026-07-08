/**
 * Unit tests for rate-limit.ts
 *
 * The checkChatRateLimit function depends on a Supabase client, so we mock
 * the client's query builder. Tests verify:
 *   - Allowed when message count is below the limit
 *   - Blocked when message count equals or exceeds the limit
 *   - Remaining count is computed correctly
 *   - Fails open (allowed = true) when the Supabase query errors
 */

import { checkChatRateLimit, RATE_LIMIT_MAX } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeMockSupabase(count: number | null, error: boolean = false): SupabaseClient {
  const queryChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue(
      error
        ? { count: null, error: { message: "DB error" } }
        : { count, error: null }
    ),
  };

  return {
    from: jest.fn().mockReturnValue(queryChain),
  } as unknown as SupabaseClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkChatRateLimit – allowed scenarios", () => {
  it("allows the request when the user has sent 0 messages", async () => {
    const supabase = makeMockSupabase(0);
    const result = await checkChatRateLimit(supabase, "user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMIT_MAX);
  });

  it("allows the request when the user has sent 29 messages (one below limit)", async () => {
    const supabase = makeMockSupabase(RATE_LIMIT_MAX - 1);
    const result = await checkChatRateLimit(supabase, "user-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("computes remaining as RATE_LIMIT_MAX - count", async () => {
    const supabase = makeMockSupabase(10);
    const result = await checkChatRateLimit(supabase, "user-1");
    expect(result.remaining).toBe(RATE_LIMIT_MAX - 10);
  });
});

describe("checkChatRateLimit – blocked scenarios", () => {
  it("blocks the request when the user has sent exactly RATE_LIMIT_MAX messages", async () => {
    const supabase = makeMockSupabase(RATE_LIMIT_MAX);
    const result = await checkChatRateLimit(supabase, "user-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks the request when the user has sent more than RATE_LIMIT_MAX messages", async () => {
    const supabase = makeMockSupabase(RATE_LIMIT_MAX + 5);
    const result = await checkChatRateLimit(supabase, "user-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkChatRateLimit – resetAt", () => {
  it("returns a resetAt Date that is roughly 1 hour in the future", async () => {
    const before = Date.now();
    const supabase = makeMockSupabase(0);
    const result = await checkChatRateLimit(supabase, "user-1");
    const resetMs = result.resetAt.getTime();
    // resetAt should be at least 59.5 minutes from now (accounting for tiny
    // sub-millisecond clock drift between the two Date.now() calls)
    expect(resetMs).toBeGreaterThanOrEqual(before + 59.5 * 60 * 1000);
    // And no more than 1 hour + 1 second in the future (sanity ceiling)
    expect(resetMs).toBeLessThanOrEqual(before + 60 * 60 * 1000 + 1000);
  });
});

describe("checkChatRateLimit – fail-open on DB error", () => {
  it("returns allowed=true when the Supabase query fails", async () => {
    // Suppress the expected console.error so test output stays clean
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeMockSupabase(null, true);
    const result = await checkChatRateLimit(supabase, "user-1");
    consoleSpy.mockRestore();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMIT_MAX);
  });
});
