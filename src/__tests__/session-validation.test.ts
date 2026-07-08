/**
 * Unit tests for session log validation used by POST /api/sessions.
 * All tests run without a real Supabase connection.
 */

import {
  validateSessionInput,
  VALID_LOG_TYPES,
  todayIso,
} from "@/lib/session-validation";

const VALID_BODY = {
  log_type: "practice",
  duration_mins: 60,
  log_date: "2024-06-15",
};

// ── VALID_LOG_TYPES export ────────────────────────────────────────────────────

describe("VALID_LOG_TYPES", () => {
  it("contains the four expected types", () => {
    expect(VALID_LOG_TYPES).toEqual(["practice", "match", "fitness", "recovery"]);
  });
});

// ── todayIso ──────────────────────────────────────────────────────────────────

describe("todayIso", () => {
  it("returns a string matching YYYY-MM-DD", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── Success cases ─────────────────────────────────────────────────────────────

describe("validateSessionInput – valid input", () => {
  it("returns ok:true for a minimal valid payload", () => {
    const result = validateSessionInput(VALID_BODY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.log_type).toBe("practice");
      expect(result.data.duration_mins).toBe(60);
      expect(result.data.log_date).toBe("2024-06-15");
    }
  });

  it("defaults log_date to today when omitted", () => {
    const { log_date, ...rest } = VALID_BODY;
    const result = validateSessionInput(rest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.log_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    void log_date;
  });

  it("defaults details to {} when omitted", () => {
    const result = validateSessionInput(VALID_BODY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.details).toEqual({});
    }
  });

  it("defaults intensity and fatigue to null when omitted", () => {
    const result = validateSessionInput(VALID_BODY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.intensity).toBeNull();
      expect(result.data.fatigue).toBeNull();
    }
  });

  it("accepts intensity 1–5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const result = validateSessionInput({ ...VALID_BODY, intensity: n });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.intensity).toBe(n);
    }
  });

  it("accepts fatigue 1–5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const result = validateSessionInput({ ...VALID_BODY, fatigue: n });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.fatigue).toBe(n);
    }
  });

  it("accepts all four valid log types", () => {
    for (const t of ["practice", "match", "fitness", "recovery"]) {
      const result = validateSessionInput({ ...VALID_BODY, log_type: t });
      expect(result.ok).toBe(true);
    }
  });

  it("trims and preserves non-empty pain_notes", () => {
    const result = validateSessionInput({
      ...VALID_BODY,
      pain_notes: "  Knee ache  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pain_notes).toBe("Knee ache");
  });

  it("coerces blank pain_notes to null", () => {
    const result = validateSessionInput({ ...VALID_BODY, pain_notes: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pain_notes).toBeNull();
  });

  it("coerces blank free_notes to null", () => {
    const result = validateSessionInput({ ...VALID_BODY, free_notes: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.free_notes).toBeNull();
  });

  it("accepts a valid details object", () => {
    const details = { focus_area: "Backhand", drill_notes: "50 feeds" };
    const result = validateSessionInput({ ...VALID_BODY, details });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.details).toEqual(details);
  });
});

// ── Missing required fields ───────────────────────────────────────────────────

describe("validateSessionInput – missing required fields", () => {
  it("rejects missing log_type", () => {
    const { log_type, ...rest } = VALID_BODY;
    const result = validateSessionInput(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("log_type");
    void log_type;
  });

  it("rejects invalid log_type", () => {
    const result = validateSessionInput({ ...VALID_BODY, log_type: "yoga" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("log_type");
      expect(result.error.message).toMatch(/practice.*match.*fitness.*recovery/);
    }
  });

  it("rejects missing duration_mins", () => {
    const { duration_mins, ...rest } = VALID_BODY;
    const result = validateSessionInput(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("duration_mins");
    void duration_mins;
  });

  it("rejects duration_mins = 0", () => {
    const result = validateSessionInput({ ...VALID_BODY, duration_mins: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("duration_mins");
  });

  it("rejects negative duration_mins", () => {
    const result = validateSessionInput({ ...VALID_BODY, duration_mins: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("duration_mins");
  });

  it("rejects non-integer duration_mins", () => {
    const result = validateSessionInput({ ...VALID_BODY, duration_mins: 45.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("duration_mins");
  });

  it("rejects string duration_mins", () => {
    const result = validateSessionInput({
      ...VALID_BODY,
      duration_mins: "sixty" as unknown as number,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("duration_mins");
  });
});

// ── Date validation ───────────────────────────────────────────────────────────

describe("validateSessionInput – log_date validation", () => {
  it("rejects a date in wrong format", () => {
    const result = validateSessionInput({
      ...VALID_BODY,
      log_date: "15/06/2024",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("log_date");
  });

  it("rejects a non-string date", () => {
    const result = validateSessionInput({
      ...VALID_BODY,
      log_date: 20240615 as unknown as string,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("log_date");
  });

  it("accepts null log_date and defaults to today", () => {
    const result = validateSessionInput({ ...VALID_BODY, log_date: null as unknown as string });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.log_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ── Intensity / fatigue validation ────────────────────────────────────────────

describe("validateSessionInput – intensity/fatigue out of range", () => {
  it("rejects intensity = 0", () => {
    const result = validateSessionInput({ ...VALID_BODY, intensity: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("intensity");
  });

  it("rejects intensity = 6", () => {
    const result = validateSessionInput({ ...VALID_BODY, intensity: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("intensity");
  });

  it("rejects fatigue = 0", () => {
    const result = validateSessionInput({ ...VALID_BODY, fatigue: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("fatigue");
  });

  it("rejects fatigue = 6", () => {
    const result = validateSessionInput({ ...VALID_BODY, fatigue: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("fatigue");
  });

  it("accepts null explicitly for intensity", () => {
    const result = validateSessionInput({ ...VALID_BODY, intensity: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.intensity).toBeNull();
  });
});

// ── Details validation ────────────────────────────────────────────────────────

describe("validateSessionInput – details validation", () => {
  it("rejects details as an array", () => {
    const result = validateSessionInput({
      ...VALID_BODY,
      details: ["focus"] as unknown as Record<string, unknown>,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("details");
  });

  it("rejects details as a string", () => {
    const result = validateSessionInput({
      ...VALID_BODY,
      details: "backhand" as unknown as Record<string, unknown>,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("details");
  });

  it("accepts null details and defaults to {}", () => {
    const result = validateSessionInput({ ...VALID_BODY, details: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.details).toEqual({});
  });
});
