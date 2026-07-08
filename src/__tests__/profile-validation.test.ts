/**
 * Unit tests for the profile validation logic used by PUT /api/profile.
 * All tests run without a real Supabase connection.
 */

import { validateProfileInput } from "@/lib/profile-validation";

const VALID_BODY = {
  display_name: "Alex",
  level: "intermediate",
  handedness: "right",
  backhand_type: "two_handed",
  goals: ["Improve consistency"],
  technical_focus: ["Forehand"],
  available_days: ["Mon", "Wed"],
  session_length_minutes: 60,
  known_injuries: null,
};

// ── Success cases ─────────────────────────────────────────────────────────────

describe("validateProfileInput – valid input", () => {
  it("returns ok:true for a complete valid payload", () => {
    const result = validateProfileInput(VALID_BODY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.display_name).toBe("Alex");
      expect(result.data.level).toBe("intermediate");
      expect(result.data.handedness).toBe("right");
      expect(result.data.backhand_type).toBe("two_handed");
    }
  });

  it("trims whitespace from display_name", () => {
    const result = validateProfileInput({ ...VALID_BODY, display_name: "  Bob  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.display_name).toBe("Bob");
  });

  it("defaults optional arrays to [] when omitted", () => {
    const { goals, technical_focus, available_days, ...rest } = VALID_BODY;
    const result = validateProfileInput(rest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.goals).toEqual([]);
      expect(result.data.technical_focus).toEqual([]);
      expect(result.data.available_days).toEqual([]);
    }
    // Silence TS "unused variable" warnings
    void goals; void technical_focus; void available_days;
  });

  it("defaults session_length_minutes to 60 when omitted", () => {
    const { session_length_minutes, ...rest } = VALID_BODY;
    const result = validateProfileInput(rest);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.session_length_minutes).toBe(60);
    void session_length_minutes;
  });

  it("coerces empty string known_injuries to null", () => {
    const result = validateProfileInput({ ...VALID_BODY, known_injuries: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.known_injuries).toBeNull();
  });

  it("preserves non-empty known_injuries string", () => {
    const result = validateProfileInput({
      ...VALID_BODY,
      known_injuries: "Tennis elbow",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.known_injuries).toBe("Tennis elbow");
  });

  it("accepts all five valid player levels", () => {
    const levels = [
      "beginner",
      "intermediate",
      "advanced",
      "competitive",
      "professional",
    ] as const;
    for (const level of levels) {
      const result = validateProfileInput({ ...VALID_BODY, level });
      expect(result.ok).toBe(true);
    }
  });
});

// ── Failure cases ─────────────────────────────────────────────────────────────

describe("validateProfileInput – missing required fields", () => {
  it("rejects missing display_name", () => {
    const result = validateProfileInput({ ...VALID_BODY, display_name: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("display_name");
  });

  it("rejects blank display_name (whitespace only)", () => {
    const result = validateProfileInput({ ...VALID_BODY, display_name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("display_name");
  });

  it("rejects missing level", () => {
    const result = validateProfileInput({ ...VALID_BODY, level: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("level");
  });

  it("rejects invalid level", () => {
    const result = validateProfileInput({ ...VALID_BODY, level: "expert" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("level");
      expect(result.error.message).toMatch(/invalid/i);
    }
  });

  it("rejects missing handedness", () => {
    const result = validateProfileInput({ ...VALID_BODY, handedness: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("handedness");
  });

  it("rejects invalid handedness", () => {
    const result = validateProfileInput({ ...VALID_BODY, handedness: "ambidextrous" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("handedness");
  });

  it("rejects missing backhand_type", () => {
    const result = validateProfileInput({ ...VALID_BODY, backhand_type: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("backhand_type");
  });

  it("rejects invalid backhand_type", () => {
    const result = validateProfileInput({ ...VALID_BODY, backhand_type: "none" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("backhand_type");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("validateProfileInput – edge cases", () => {
  it("ignores non-array goals and returns []", () => {
    const result = validateProfileInput({ ...VALID_BODY, goals: "not-an-array" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.goals).toEqual([]);
  });

  it("ignores non-number session_length_minutes and returns 60", () => {
    const result = validateProfileInput({
      ...VALID_BODY,
      session_length_minutes: "ninety",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.session_length_minutes).toBe(60);
  });
});
