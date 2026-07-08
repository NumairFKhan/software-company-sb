/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Approach: plain Map keyed by IP, storing a { count, windowStart }.
 *
 * Trade-off:
 *   This state lives inside a single Node.js process. On Vercel, each
 *   serverless function invocation may run in a separate sandbox, so limits
 *   are not enforced globally across all instances — they only prevent burst
 *   abuse within a single warm instance.
 *
 *   For production-grade enforcement use a shared store such as
 *   Upstash Redis or Vercel KV. This in-memory version is acceptable for MVP.
 *
 * Parameters: 5 requests per IP per 60-second rolling window.
 */

interface Entry {
  count: number;
  windowStart: number; // Date.now() ms
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5;

// Store is module-level so it persists across requests within one warm instance.
const store = new Map<string, Entry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number; // 0 when allowed
}

/**
 * Checks whether the given identifier (typically an IP address) has exceeded
 * the rate limit. Increments the counter if the request is allowed.
 */
export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // First request in this window
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, retryAfterSeconds: 0 };
}
