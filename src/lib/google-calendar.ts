/**
 * google-calendar.ts
 *
 * Server-side Google Calendar integration for CourtCoach AI.
 *
 * Responsibilities:
 *  1. Fetch the user's stored Google tokens from Supabase.
 *  2. Refresh the access token if it is expired or about to expire.
 *  3. Call the Google Calendar API v3 events.list endpoint for the next 7 days.
 *  4. Return a structured list of upcoming events (title + start time only).
 *  5. Format the event list as a concise string suitable for injecting into the
 *     AI coach's system prompt.
 *
 * All failures are handled gracefully — this function always returns null
 * (no calendar data) rather than throwing, so the rest of the app continues
 * to work even when the Calendar API is unavailable.
 *
 * SECURITY: Google tokens are fetched and used server-side only.
 *           The access token is never returned to the browser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A minimal representation of a Google Calendar event. */
export interface CalendarEvent {
  /** The event title (summary field in the Calendar API). */
  title: string;
  /** ISO 8601 start datetime or date string from the Calendar API. */
  startRaw: string;
  /** Human-readable start label (e.g. "Mon Jul 14, 9:00 AM"). */
  startLabel: string;
  /** Whether this is an all-day event (no time component). */
  allDay: boolean;
}

/** Shape of a Google Calendar API event item (fields we care about). */
interface GCalEventItem {
  summary?: string;
  start?: {
    dateTime?: string; // timed events
    date?: string;     // all-day events
    timeZone?: string;
  };
  status?: string;
}

/** Shape of the Google Calendar API events.list response. */
interface GCalEventsResponse {
  items?: GCalEventItem[];
  error?: {
    code?: number;
    message?: string;
  };
}

/** Shape of the OAuth2 token refresh response. */
interface TokenRefreshResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const TOKEN_REFRESH_URL = "https://oauth2.googleapis.com/token";

/** Fetch at most this many events from the API. */
const MAX_RESULTS = 20;

/** All-day events longer than this many days are filtered out (e.g. out-of-office blocks). */
const MAX_DAYS_AHEAD = 7;

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Exchanges a refresh token for a new access token using the standard
 * Google OAuth2 token endpoint.
 *
 * Returns the new access token string, or null if the refresh fails.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "[google-calendar] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — cannot refresh token"
    );
    return null;
  }

  try {
    const resp = await fetch(TOKEN_REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const data: TokenRefreshResponse = await resp.json();

    if (!resp.ok || data.error || !data.access_token) {
      console.error(
        "[google-calendar] Token refresh failed:",
        data.error ?? resp.status,
        data.error_description ?? ""
      );
      return null;
    }

    return data.access_token;
  } catch (err) {
    console.error("[google-calendar] Token refresh network error:", err);
    return null;
  }
}

// ── Calendar API fetch ────────────────────────────────────────────────────────

/**
 * Fetches the user's upcoming events from the Google Calendar primary calendar
 * for the next 7 days.
 *
 * Returns a list of CalendarEvent objects, or null if the API call fails.
 */
export async function fetchCalendarEvents(
  accessToken: string
): Promise<CalendarEvent[] | null> {
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + MAX_DAYS_AHEAD);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: sevenDaysLater.toISOString(),
    singleEvents: "true",        // expand recurring events
    orderBy: "startTime",
    maxResults: String(MAX_RESULTS),
    fields: "items(summary,start,status)",
  });

  let resp: Response;
  try {
    resp = await fetch(`${CALENDAR_API_BASE}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      // Next.js fetch — don't cache; calendar data must be fresh
      cache: "no-store",
    });
  } catch (err) {
    console.error("[google-calendar] Calendar API network error:", err);
    return null;
  }

  let data: GCalEventsResponse;
  try {
    data = await resp.json();
  } catch (err) {
    console.error("[google-calendar] Calendar API response parse error:", err);
    return null;
  }

  if (!resp.ok || data.error) {
    console.error(
      "[google-calendar] Calendar API error:",
      data.error?.code ?? resp.status,
      data.error?.message ?? ""
    );
    return null;
  }

  const items = data.items ?? [];
  const events: CalendarEvent[] = [];

  for (const item of items) {
    // Skip cancelled events
    if (item.status === "cancelled") continue;

    const title = item.summary?.trim() || "(No title)";
    const startRaw = item.start?.dateTime ?? item.start?.date ?? "";
    const allDay = !item.start?.dateTime && !!item.start?.date;

    if (!startRaw) continue;

    const startLabel = formatStartLabel(startRaw, allDay);

    events.push({ title, startRaw, startLabel, allDay });
  }

  return events;
}

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Converts a raw start value from the Calendar API into a human-readable label.
 *
 * - Timed events (dateTime):  "Mon Jul 14, 9:00 AM"
 * - All-day events (date):    "Mon Jul 14 (all day)"
 */
export function formatStartLabel(startRaw: string, allDay: boolean): string {
  try {
    if (allDay) {
      // All-day events have "YYYY-MM-DD" format — parse as UTC to avoid off-by-one
      const [y, m, d] = startRaw.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return (
        date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }) + " (all day)"
      );
    }

    // Timed event — ISO 8601 with timezone offset or "Z"
    const date = new Date(startRaw);
    // Guard against invalid date values
    if (isNaN(date.getTime())) return startRaw;
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return startRaw; // Fall back to raw string if parsing fails
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Fetches upcoming Google Calendar events for a user.
 *
 * Orchestrates:
 *  1. Load stored tokens from the `google_tokens` table.
 *  2. If the access token appears expired, attempt to refresh it.
 *  3. Call the Calendar API with the (potentially refreshed) access token.
 *  4. Return the event list, or null on any failure.
 *
 * Failures at any step are logged server-side and result in null being
 * returned — the dashboard and chat continue to work without calendar data.
 */
export async function getUpcomingCalendarEvents(
  // Accept any Supabase client shape (server or browser)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string
): Promise<CalendarEvent[] | null> {
  // ── 1. Load tokens ─────────────────────────────────────────────────────────
  let accessToken: string;
  let refreshToken: string | null;

  try {
    const { data: tokenRow, error } = await supabase
      .from("google_tokens")
      .select("access_token, refresh_token, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[google-calendar] Failed to load token row:", error.message);
      return null;
    }

    if (!tokenRow || !tokenRow.access_token) {
      // User has not connected Google Calendar — silent return
      return null;
    }

    accessToken = tokenRow.access_token as string;
    refreshToken = (tokenRow.refresh_token as string | null) ?? null;
  } catch (err) {
    console.error("[google-calendar] Unexpected error loading tokens:", err);
    return null;
  }

  // ── 2. Attempt Calendar API call; refresh token if needed ──────────────────
  let events = await fetchCalendarEvents(accessToken);

  if (events === null && refreshToken) {
    // The access token may be expired — try refreshing it
    console.info("[google-calendar] Access token may be expired, attempting refresh");

    const newAccessToken = await refreshGoogleAccessToken(refreshToken);

    if (newAccessToken) {
      // Persist the refreshed token
      try {
        const { error: updateError } = await supabase
          .from("google_tokens")
          .update({ access_token: newAccessToken })
          .eq("user_id", userId);

        if (updateError) {
          console.warn(
            "[google-calendar] Could not persist refreshed token:",
            updateError.message
          );
          // Non-fatal — continue with the new token even if we can't save it
        }
      } catch (err) {
        console.warn("[google-calendar] Token persistence error:", err);
      }

      // Retry with the refreshed token
      events = await fetchCalendarEvents(newAccessToken);
    }
  }

  return events; // May be null if both attempts failed
}

// ── Prompt formatting ─────────────────────────────────────────────────────────

/**
 * Converts a list of CalendarEvent objects into a short, structured text
 * suitable for injecting into the AI coach's system prompt.
 *
 * Example output:
 *   - Mon Jul 14, 9:00 AM: Club Tournament
 *   - Tue Jul 15, 7:00 PM: Travel to NYC (all day)
 *   - Thu Jul 17 (all day): Rest Day
 *
 * Returns null when the event list is empty (so callers can skip the section).
 */
export function formatCalendarSummary(events: CalendarEvent[]): string | null {
  if (!events || events.length === 0) return null;

  const lines = events.map((e) => `- ${e.startLabel}: ${e.title}`);
  return lines.join("\n");
}
