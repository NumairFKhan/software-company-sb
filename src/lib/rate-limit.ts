/**
 * rate-limit.ts
 *
 * Supabase-based rate limiting for the /api/chat endpoint.
 * Counts the number of "user" messages a given user has sent in the last hour
 * using the chat_messages table. Returns whether the request is allowed,
 * how many messages remain, and when the window resets.
 *
 * Limit: 30 user messages per user per rolling hour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const RATE_LIMIT_MAX = 30;         // messages per window
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour in ms

export interface RateLimitResult {
  /** Whether the request is within the rate limit and should be allowed. */
  allowed: boolean;
  /** Number of messages remaining in the current window (0 if exceeded). */
  remaining: number;
  /** The UTC time at which the oldest message in the window ages out. */
  resetAt: Date;
}

/**
 * Checks whether the given user has exceeded the chat rate limit.
 *
 * @param supabase  An authenticated Supabase server client.
 * @param userId    The authenticated user's UUID.
 * @returns         A RateLimitResult describing whether to allow the request.
 */
export async function checkChatRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", windowStart.toISOString());

  if (error) {
    // If we can't query the table, fail open so users aren't blocked by infra
    // issues. Log the error for observability.
    console.error("[rate-limit] Failed to query chat_messages:", error.message);
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX,
      resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS), // worst-case estimate
    };
  }

  const messageCount = count ?? 0;
  const remaining = Math.max(0, RATE_LIMIT_MAX - messageCount);
  // Conservative worst-case reset time: the user's limit fully clears when the
  // oldest message in the current window ages out.  Without a second query to
  // find that exact timestamp we tell the user "at most 1 hour from now".
  const resetAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);

  return {
    allowed: messageCount < RATE_LIMIT_MAX,
    remaining,
    resetAt,
  };
}
