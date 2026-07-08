/**
 * Unit tests for google-calendar.ts
 *
 * Tests cover:
 *  - formatStartLabel(): timed events, all-day events, invalid input
 *  - formatCalendarSummary(): empty list, single event, multiple events
 *  - getUpcomingCalendarEvents(): no token row, API success, token refresh path
 *  - refreshGoogleAccessToken(): missing env vars, success, API error
 */

import {
  formatStartLabel,
  formatCalendarSummary,
  getUpcomingCalendarEvents,
  refreshGoogleAccessToken,
  type CalendarEvent,
} from "@/lib/google-calendar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    title: "Club Tournament",
    startRaw: "2026-07-14T09:00:00-04:00",
    startLabel: "Tue Jul 14, 9:00 AM",
    allDay: false,
    ...overrides,
  };
}

// ── formatStartLabel ──────────────────────────────────────────────────────────

describe("formatStartLabel – timed events", () => {
  it("returns a human-readable label for a timed event", () => {
    // Use a fixed UTC time to avoid timezone-dependent failures in CI
    const label = formatStartLabel("2026-07-14T13:00:00Z", false);
    // The string should contain at least the month and day
    expect(label).toContain("Jul");
    expect(label).toContain("14");
    // Should contain AM or PM (12-hour clock)
    expect(label).toMatch(/AM|PM/);
  });

  it("does not append '(all day)' for timed events", () => {
    const label = formatStartLabel("2026-07-14T13:00:00Z", false);
    expect(label).not.toContain("all day");
  });
});

describe("formatStartLabel – all-day events", () => {
  it("returns a label with '(all day)' for all-day events", () => {
    const label = formatStartLabel("2026-07-14", true);
    expect(label).toContain("all day");
    expect(label).toContain("Jul");
    expect(label).toContain("14");
  });

  it("does not include a time component for all-day events", () => {
    const label = formatStartLabel("2026-07-14", true);
    expect(label).not.toMatch(/\d:\d{2}/); // no "9:00" style time
  });
});

describe("formatStartLabel – edge cases", () => {
  it("falls back to the raw string when the input is unparseable", () => {
    const raw = "not-a-date";
    const label = formatStartLabel(raw, false);
    // Should return the raw string rather than throwing
    expect(label).toBe(raw);
  });
});

// ── formatCalendarSummary ─────────────────────────────────────────────────────

describe("formatCalendarSummary – empty input", () => {
  it("returns null for an empty events array", () => {
    expect(formatCalendarSummary([])).toBeNull();
  });
});

describe("formatCalendarSummary – single event", () => {
  it("produces one bullet line with label and title", () => {
    const events: CalendarEvent[] = [
      makeEvent({ startLabel: "Tue Jul 14, 9:00 AM", title: "Club Tournament" }),
    ];
    const summary = formatCalendarSummary(events);
    expect(summary).not.toBeNull();
    expect(summary).toContain("Tue Jul 14, 9:00 AM");
    expect(summary).toContain("Club Tournament");
    expect(summary).toContain("-");
  });
});

describe("formatCalendarSummary – multiple events", () => {
  it("produces one line per event", () => {
    const events: CalendarEvent[] = [
      makeEvent({ startLabel: "Mon Jul 13, 8:00 AM", title: "Morning Run" }),
      makeEvent({ startLabel: "Wed Jul 15, 6:00 PM", title: "Tennis League Match" }),
      makeEvent({ startLabel: "Sat Jul 18 (all day)", title: "Road Trip", allDay: true }),
    ];
    const summary = formatCalendarSummary(events);
    expect(summary).not.toBeNull();
    const lines = summary!.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Morning Run");
    expect(lines[1]).toContain("Tennis League Match");
    expect(lines[2]).toContain("Road Trip");
  });

  it("formats each line as '- <label>: <title>'", () => {
    const events: CalendarEvent[] = [
      makeEvent({ startLabel: "Tue Jul 14, 9:00 AM", title: "Tournament" }),
    ];
    const summary = formatCalendarSummary(events);
    expect(summary).toBe("- Tue Jul 14, 9:00 AM: Tournament");
  });
});

// ── getUpcomingCalendarEvents ─────────────────────────────────────────────────

describe("getUpcomingCalendarEvents – no token", () => {
  it("returns null when the user has no google_tokens row", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getUpcomingCalendarEvents(mockSupabase as any, "user-123");
    expect(result).toBeNull();
  });

  it("returns null when the token row has no access_token", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { access_token: null, refresh_token: null, updated_at: new Date().toISOString() },
              error: null,
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getUpcomingCalendarEvents(mockSupabase as any, "user-123");
    expect(result).toBeNull();
  });

  it("returns null when the DB query returns an error", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "DB error" } }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getUpcomingCalendarEvents(mockSupabase as any, "user-123");
    expect(result).toBeNull();
  });
});

describe("getUpcomingCalendarEvents – Calendar API success", () => {
  beforeEach(() => {
    // Mock a successful Calendar API response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            summary: "Tennis Lesson",
            start: { dateTime: "2026-07-14T10:00:00-04:00" },
            status: "confirmed",
          },
          {
            summary: "Tournament Day",
            start: { date: "2026-07-16" },
            status: "confirmed",
          },
          {
            // Cancelled event — should be filtered out
            summary: "Cancelled Meeting",
            start: { dateTime: "2026-07-15T09:00:00-04:00" },
            status: "cancelled",
          },
        ],
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a list of upcoming events, excluding cancelled ones", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                access_token: "fake-access-token",
                refresh_token: "fake-refresh-token",
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getUpcomingCalendarEvents(mockSupabase as any, "user-123");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2); // Tennis Lesson + Tournament Day (not Cancelled Meeting)
    expect(result![0].title).toBe("Tennis Lesson");
    expect(result![1].title).toBe("Tournament Day");
    expect(result![1].allDay).toBe(true);
  });

  it("events have title, startRaw, startLabel, and allDay fields", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                access_token: "fake-access-token",
                refresh_token: null,
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getUpcomingCalendarEvents(mockSupabase as any, "user-123");
    expect(result).not.toBeNull();
    const event = result![0];
    expect(event).toHaveProperty("title");
    expect(event).toHaveProperty("startRaw");
    expect(event).toHaveProperty("startLabel");
    expect(event).toHaveProperty("allDay");
    expect(typeof event.title).toBe("string");
    expect(typeof event.startLabel).toBe("string");
    expect(typeof event.allDay).toBe("boolean");
  });
});

describe("getUpcomingCalendarEvents – Calendar API failure with no refresh token", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns null when the API call fails and there is no refresh token", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 401, message: "Unauthorized" } }),
    });

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                access_token: "expired-token",
                refresh_token: null,
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getUpcomingCalendarEvents(mockSupabase as any, "user-123");
    expect(result).toBeNull();
  });
});

// ── refreshGoogleAccessToken ──────────────────────────────────────────────────

describe("refreshGoogleAccessToken – missing env vars", () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
    if (originalClientSecret === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("returns null when GOOGLE_CLIENT_ID is not set", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    const result = await refreshGoogleAccessToken("some-refresh-token");
    expect(result).toBeNull();
  });

  it("returns null when GOOGLE_CLIENT_SECRET is not set", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    delete process.env.GOOGLE_CLIENT_SECRET;
    const result = await refreshGoogleAccessToken("some-refresh-token");
    expect(result).toBeNull();
  });
});

describe("refreshGoogleAccessToken – API success", () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access-token",
        expires_in: 3600,
      }),
    });
  });

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
    if (originalClientSecret === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
    jest.restoreAllMocks();
  });

  it("returns the new access token on success", async () => {
    const result = await refreshGoogleAccessToken("valid-refresh-token");
    expect(result).toBe("new-access-token");
  });

  it("calls the Google OAuth2 token endpoint", async () => {
    await refreshGoogleAccessToken("valid-refresh-token");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("refreshGoogleAccessToken – API error", () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
    if (originalClientSecret === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
    jest.restoreAllMocks();
  });

  it("returns null when the token endpoint returns an error", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "invalid_grant",
        error_description: "Token has been revoked",
      }),
    });
    const result = await refreshGoogleAccessToken("revoked-token");
    expect(result).toBeNull();
  });

  it("returns null when the network call throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network failure"));
    const result = await refreshGoogleAccessToken("any-token");
    expect(result).toBeNull();
  });
});
