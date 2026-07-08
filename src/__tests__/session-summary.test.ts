/**
 * Unit tests for computeSessionSummary().
 *
 * All tests supply an explicit `today` date so results are deterministic
 * regardless of when the test suite runs.
 */

import {
  computeSessionSummary,
  type SessionSummaryRow,
} from "@/lib/session-summary";

const TODAY = "2026-07-08"; // reference date used across the suite

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(
  overrides: Partial<SessionSummaryRow> & { log_date: string }
): SessionSummaryRow {
  return {
    log_type: "practice",
    fatigue: null,
    pain_notes: null,
    details: {},
    ...overrides,
  };
}

/**
 * Build a date string `daysAgo` days before `TODAY`.
 * daysAgo=0  → "2026-07-08"
 * daysAgo=7  → "2026-07-01"
 * daysAgo=13 → "2026-06-25"
 */
function daysAgo(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Empty input ───────────────────────────────────────────────────────────────

describe("computeSessionSummary – empty input", () => {
  it("returns null top_focus_area when there are no rows", () => {
    const { top_focus_area } = computeSessionSummary([], TODAY);
    expect(top_focus_area).toBeNull();
  });

  it("returns insufficient_data fatigue_trend when there are no rows", () => {
    const { fatigue_trend } = computeSessionSummary([], TODAY);
    expect(fatigue_trend).toBe("insufficient_data");
  });

  it("returns false pain_flag when there are no rows", () => {
    const { pain_flag } = computeSessionSummary([], TODAY);
    expect(pain_flag).toBe(false);
  });
});

// ── top_focus_area ────────────────────────────────────────────────────────────

describe("computeSessionSummary – top_focus_area", () => {
  it("returns null when no practice sessions are present", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), log_type: "match" }),
      makeRow({ log_date: daysAgo(2), log_type: "fitness" }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBeNull();
  });

  it("returns null when practice sessions have no focus_area", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), log_type: "practice", details: {} }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBeNull();
  });

  it("returns the only focus_area when there is one practice session", () => {
    const rows = [
      makeRow({
        log_date: daysAgo(1),
        log_type: "practice",
        details: { focus_area: "Backhand" },
      }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBe("Backhand");
  });

  it("returns the most frequent focus_area across multiple sessions", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), log_type: "practice", details: { focus_area: "Serve" } }),
      makeRow({ log_date: daysAgo(2), log_type: "practice", details: { focus_area: "Backhand" } }),
      makeRow({ log_date: daysAgo(3), log_type: "practice", details: { focus_area: "Serve" } }),
      makeRow({ log_date: daysAgo(4), log_type: "practice", details: { focus_area: "Backhand" } }),
      makeRow({ log_date: daysAgo(5), log_type: "practice", details: { focus_area: "Serve" } }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBe("Serve"); // 3 vs 2
  });

  it("ignores non-practice sessions when computing top_focus_area", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), log_type: "match", details: { focus_area: "Volley" } }),
      makeRow({ log_date: daysAgo(2), log_type: "practice", details: { focus_area: "Serve" } }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBe("Serve");
  });

  it("ignores blank/whitespace focus_area values", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), log_type: "practice", details: { focus_area: "  " } }),
      makeRow({ log_date: daysAgo(2), log_type: "practice", details: { focus_area: "" } }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBeNull();
  });

  it("trims whitespace from focus_area before counting", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), log_type: "practice", details: { focus_area: " Serve " } }),
      makeRow({ log_date: daysAgo(2), log_type: "practice", details: { focus_area: "Serve" } }),
    ];
    const { top_focus_area } = computeSessionSummary(rows, TODAY);
    expect(top_focus_area).toBe("Serve");
  });
});

// ── fatigue_trend ─────────────────────────────────────────────────────────────

describe("computeSessionSummary – fatigue_trend", () => {
  it("returns insufficient_data when recent window has 0 fatigue entries", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: null }),
      makeRow({ log_date: daysAgo(2), fatigue: null }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("insufficient_data");
  });

  it("returns insufficient_data when recent window has exactly 1 fatigue entry", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: 3 }),
      makeRow({ log_date: daysAgo(8), fatigue: 4 }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("insufficient_data");
  });

  it("returns stable when recent window has ≥2 entries but prior window is empty", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: 3 }),
      makeRow({ log_date: daysAgo(2), fatigue: 4 }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("stable");
  });

  it("returns improving when recent average fatigue is more than 0.5 lower than prior", () => {
    // prior avg = 4.5, recent avg = 2  → diff = 2 - 4.5 = -2.5 < -0.5 → improving
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: 2 }),
      makeRow({ log_date: daysAgo(2), fatigue: 2 }),
      makeRow({ log_date: daysAgo(8), fatigue: 4 }),
      makeRow({ log_date: daysAgo(9), fatigue: 5 }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("improving");
  });

  it("returns worsening when recent average fatigue is more than 0.5 higher than prior", () => {
    // prior avg = 2, recent avg = 4.5 → diff = 4.5 - 2 = 2.5 > 0.5 → worsening
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: 4 }),
      makeRow({ log_date: daysAgo(2), fatigue: 5 }),
      makeRow({ log_date: daysAgo(8), fatigue: 2 }),
      makeRow({ log_date: daysAgo(9), fatigue: 2 }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("worsening");
  });

  it("returns stable when the difference is within ±0.5", () => {
    // prior avg = 3, recent avg = 3.2 → diff = 0.2 → stable
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: 3 }),
      makeRow({ log_date: daysAgo(2), fatigue: 3 }),
      makeRow({ log_date: daysAgo(3), fatigue: 4 }),
      makeRow({ log_date: daysAgo(8), fatigue: 3 }),
      makeRow({ log_date: daysAgo(9), fatigue: 3 }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("stable");
  });

  it("uses the boundary exactly: day 7 ago is in 'recent' window", () => {
    // boundary = 2026-07-01 (7 days before 2026-07-08)
    // daysAgo(7) = "2026-07-01" → should be in RECENT window (>= boundary)
    const rows = [
      makeRow({ log_date: daysAgo(7), fatigue: 1 }), // recent
      makeRow({ log_date: daysAgo(6), fatigue: 1 }), // recent
      makeRow({ log_date: daysAgo(8), fatigue: 5 }), // prior (< boundary)
      makeRow({ log_date: daysAgo(9), fatigue: 5 }), // prior
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("improving"); // recent avg=1, prior avg=5
  });

  it("handles mixed null/non-null fatigue correctly (only non-null contribute)", () => {
    // recent: fatigue=5, null → avg of [5] = 5 (but only 1 entry → insufficient)
    const rows = [
      makeRow({ log_date: daysAgo(1), fatigue: 5 }),
      makeRow({ log_date: daysAgo(2), fatigue: null }),
    ];
    const { fatigue_trend } = computeSessionSummary(rows, TODAY);
    expect(fatigue_trend).toBe("insufficient_data");
  });
});

// ── pain_flag ─────────────────────────────────────────────────────────────────

describe("computeSessionSummary – pain_flag", () => {
  it("returns false when all pain_notes are null", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), pain_notes: null }),
      makeRow({ log_date: daysAgo(2), pain_notes: null }),
    ];
    const { pain_flag } = computeSessionSummary(rows, TODAY);
    expect(pain_flag).toBe(false);
  });

  it("returns false when all pain_notes are empty strings", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), pain_notes: "" }),
      makeRow({ log_date: daysAgo(2), pain_notes: "   " }),
    ];
    const { pain_flag } = computeSessionSummary(rows, TODAY);
    expect(pain_flag).toBe(false);
  });

  it("returns true when at least one row has non-empty pain_notes", () => {
    const rows = [
      makeRow({ log_date: daysAgo(1), pain_notes: null }),
      makeRow({ log_date: daysAgo(2), pain_notes: "Knee ache" }),
    ];
    const { pain_flag } = computeSessionSummary(rows, TODAY);
    expect(pain_flag).toBe(true);
  });

  it("returns true when the sole pain entry has whitespace-only is not flagged", () => {
    const rows = [makeRow({ log_date: daysAgo(1), pain_notes: "   " })];
    const { pain_flag } = computeSessionSummary(rows, TODAY);
    expect(pain_flag).toBe(false);
  });
});

// ── Combined real-world scenario ──────────────────────────────────────────────

describe("computeSessionSummary – combined scenario (5+ entries across both windows)", () => {
  /**
   * Simulate 8 sessions spanning both 14-day windows:
   * - 5 recent (days 0–6): 2 practice (focus: Serve ×2), 1 match, 1 fitness, 1 recovery
   * - 3 prior  (days 7–13): 1 practice (focus: Backhand), 2 fitness
   *
   * Fatigue:
   * - Recent: 2, 3, 3, 4, null → avg of [2,3,3,4] = 3.0
   * - Prior:  5, 4, 4          → avg = 4.33
   * → diff = 3.0 - 4.33 = -1.33 < -0.5 → improving
   *
   * Top focus: Serve (2) vs Backhand (1) → Serve
   * Pain flag: one row has "Wrist twinge" → true
   */
  const rows: SessionSummaryRow[] = [
    // Recent window (days 0–6)
    makeRow({ log_date: daysAgo(0), log_type: "practice", fatigue: 2, pain_notes: null, details: { focus_area: "Serve" } }),
    makeRow({ log_date: daysAgo(1), log_type: "match",    fatigue: 3, pain_notes: "Wrist twinge", details: {} }),
    makeRow({ log_date: daysAgo(2), log_type: "practice", fatigue: 3, pain_notes: null, details: { focus_area: "Serve" } }),
    makeRow({ log_date: daysAgo(4), log_type: "fitness",  fatigue: 4, pain_notes: null, details: {} }),
    makeRow({ log_date: daysAgo(6), log_type: "recovery", fatigue: null, pain_notes: null, details: {} }),
    // Prior window (days 7–13)
    makeRow({ log_date: daysAgo(7),  log_type: "practice", fatigue: 5, pain_notes: null, details: { focus_area: "Backhand" } }),
    makeRow({ log_date: daysAgo(10), log_type: "fitness",  fatigue: 4, pain_notes: null, details: {} }),
    makeRow({ log_date: daysAgo(13), log_type: "fitness",  fatigue: 4, pain_notes: null, details: {} }),
  ];

  it("computes the correct top_focus_area", () => {
    expect(computeSessionSummary(rows, TODAY).top_focus_area).toBe("Serve");
  });

  it("computes 'improving' fatigue_trend", () => {
    expect(computeSessionSummary(rows, TODAY).fatigue_trend).toBe("improving");
  });

  it("sets pain_flag to true", () => {
    expect(computeSessionSummary(rows, TODAY).pain_flag).toBe(true);
  });
});
