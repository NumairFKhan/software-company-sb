/**
 * Unit tests for chat-context.ts
 *
 * Tests cover:
 *  - serializeSession(): correct human-readable formatting for each log type
 *  - buildSystemPrompt(): system prompt structure, content, and hard rules
 */

import { serializeSession, buildSystemPrompt } from "@/lib/chat-context";
import type { SessionLog, PlayerProfile } from "@/types/database";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(
  overrides: Partial<SessionLog> & { log_date: string; log_type: SessionLog["log_type"] }
): SessionLog {
  return {
    id: "sess-001",
    user_id: "user-001",
    created_at: "2026-07-08T10:00:00Z",
    updated_at: "2026-07-08T10:00:00Z",
    deleted_at: null,
    duration_mins: 60,
    intensity: null,
    fatigue: null,
    pain_notes: null,
    free_notes: null,
    details: {},
    ...overrides,
  };
}

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "profile-001",
    user_id: "user-001",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    display_name: "Alex Smith",
    level: "intermediate",
    handedness: "right",
    backhand_type: "two_handed",
    goals: ["improve consistency", "enter club tournaments"],
    technical_focus: ["serve", "backhand"],
    available_days: ["Tuesday", "Thursday", "Saturday"],
    session_length_minutes: 75,
    known_injuries: null,
    ...overrides,
  };
}

// ── serializeSession ──────────────────────────────────────────────────────────

describe("serializeSession – practice session", () => {
  it("includes date, type, duration in the headline", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      duration_mins: 75,
    });
    const result = serializeSession(session);
    expect(result).toContain("July 5");
    expect(result).toContain("Tennis Practice");
    expect(result).toContain("75 min");
  });

  it("includes intensity and fatigue when present", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      intensity: 4,
      fatigue: 3,
    });
    const result = serializeSession(session);
    expect(result).toContain("intensity 4/5");
    expect(result).toContain("fatigue 3/5");
  });

  it("includes focus area from details", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      details: { focus_area: "backhand cross-court" },
    });
    const result = serializeSession(session);
    expect(result).toContain("backhand cross-court");
  });

  it("includes drill_notes from details", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      details: { drill_notes: "50 cross-court rallies" },
    });
    const result = serializeSession(session);
    expect(result).toContain("50 cross-court rallies");
  });

  it("includes pain_notes when present", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      pain_notes: "Slight wrist ache",
    });
    const result = serializeSession(session);
    expect(result).toContain("pain notes: Slight wrist ache");
  });

  it("includes free_notes when present", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      free_notes: "Felt great today",
    });
    const result = serializeSession(session);
    expect(result).toContain("notes: Felt great today");
  });

  it("omits intensity/fatigue when null", () => {
    const session = makeSession({
      log_date: "2026-07-05",
      log_type: "practice",
      intensity: null,
      fatigue: null,
    });
    const result = serializeSession(session);
    expect(result).not.toContain("intensity");
    expect(result).not.toContain("fatigue");
  });
});

describe("serializeSession – match session", () => {
  it("includes score, surface, and opponent_level from details", () => {
    const session = makeSession({
      log_date: "2026-07-06",
      log_type: "match",
      duration_mins: 90,
      details: {
        sets_score: "6-3, 4-6, 6-4",
        surface: "clay",
        opponent_level: "advanced",
      },
    });
    const result = serializeSession(session);
    expect(result).toContain("Match");
    expect(result).toContain("6-3, 4-6, 6-4");
    expect(result).toContain("clay");
    expect(result).toContain("advanced");
  });
});

describe("serializeSession – fitness session", () => {
  it("includes activity_type and gym_notes", () => {
    const session = makeSession({
      log_date: "2026-07-07",
      log_type: "fitness",
      details: {
        activity_type: "gym strength",
        gym_notes: "legs and core",
      },
    });
    const result = serializeSession(session);
    expect(result).toContain("Fitness Training");
    expect(result).toContain("gym strength");
    expect(result).toContain("legs and core");
  });
});

describe("serializeSession – recovery session", () => {
  it("includes sleep_quality and soreness_areas", () => {
    const session = makeSession({
      log_date: "2026-07-08",
      log_type: "recovery",
      details: {
        sleep_quality: 4,
        soreness_areas: "quads",
      },
    });
    const result = serializeSession(session);
    expect(result).toContain("Recovery");
    expect(result).toContain("sleep quality: 4/5");
    expect(result).toContain("quads");
  });
});

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

describe("buildSystemPrompt – role block", () => {
  it("mentions 'CourtCoach' in the prompt", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt).toContain("CourtCoach");
  });

  it("includes tennis-specific instructions", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("tennis");
  });
});

describe("buildSystemPrompt – player profile section", () => {
  it("includes player name, level, and backhand type when profile is provided", () => {
    const profile = makeProfile();
    const prompt = buildSystemPrompt(profile, []);
    expect(prompt).toContain("Alex Smith");
    expect(prompt).toContain("intermediate");
    expect(prompt).toContain("Two-handed");
  });

  it("includes goals and technical focus areas", () => {
    const profile = makeProfile();
    const prompt = buildSystemPrompt(profile, []);
    expect(prompt).toContain("improve consistency");
    expect(prompt).toContain("enter club tournaments");
    expect(prompt).toContain("serve");
    expect(prompt).toContain("backhand");
  });

  it("includes known_injuries when present", () => {
    const profile = makeProfile({ known_injuries: "right shoulder tendinitis" });
    const prompt = buildSystemPrompt(profile, []);
    expect(prompt).toContain("right shoulder tendinitis");
  });

  it("includes a fallback message when profile is null", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("no profile");
  });

  it("formats one_handed backhand correctly", () => {
    const profile = makeProfile({ backhand_type: "one_handed" });
    const prompt = buildSystemPrompt(profile, []);
    expect(prompt).toContain("One-handed");
  });
});

describe("buildSystemPrompt – session log section", () => {
  it("lists serialized sessions newest-first", () => {
    const sessions: SessionLog[] = [
      makeSession({ log_date: "2026-07-07", log_type: "practice", duration_mins: 60 }),
      makeSession({ log_date: "2026-07-05", log_type: "match", duration_mins: 90 }),
    ];
    const prompt = buildSystemPrompt(null, sessions);
    const july7Idx = prompt.indexOf("July 7");
    const july5Idx = prompt.indexOf("July 5");
    expect(july7Idx).toBeLessThan(july5Idx);
  });

  it("includes a no-fabrication instruction when sessions list is empty", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toUpperCase()).toContain("NOT FABRICATE");
  });

  it("shows session data when sessions are provided", () => {
    const sessions: SessionLog[] = [
      makeSession({
        log_date: "2026-07-05",
        log_type: "practice",
        duration_mins: 75,
        intensity: 4,
        fatigue: 3,
        details: { focus_area: "serve" },
      }),
    ];
    const prompt = buildSystemPrompt(null, sessions);
    expect(prompt).toContain("July 5");
    expect(prompt).toContain("75 min");
    expect(prompt).toContain("serve");
  });
});

describe("buildSystemPrompt – medical disclaimer rule", () => {
  it("includes the exact medical disclaimer text in the rules section", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt).toContain(
      "If pain is sharp, persistent, or worsening — stop play and see a medical professional."
    );
  });
});

describe("buildSystemPrompt – no-fabrication rule", () => {
  it("explicitly prohibits fabricating session data", () => {
    const prompt = buildSystemPrompt(null, []);
    // The rules section should mention not fabricating data
    expect(prompt).toContain("fabricate");
  });
});

describe("buildSystemPrompt – cold-start scenario", () => {
  it("with 0 sessions mentions no-log state without inventing sessions", () => {
    const prompt = buildSystemPrompt(makeProfile(), []);
    expect(prompt).toContain("No sessions logged");
    expect(prompt).toContain("NOT fabricate");
  });

  it("with 1 session still works correctly", () => {
    const sessions: SessionLog[] = [
      makeSession({ log_date: "2026-07-08", log_type: "recovery" }),
    ];
    const prompt = buildSystemPrompt(makeProfile(), sessions);
    expect(prompt).toContain("Recovery");
  });
});

describe("buildSystemPrompt – data-rich scenario", () => {
  it("with 10+ sessions lists them all in the prompt", () => {
    const sessions: SessionLog[] = Array.from({ length: 12 }, (_, i) =>
      makeSession({
        log_date: `2026-07-${String(i + 1).padStart(2, "0")}`,
        log_type: i % 2 === 0 ? "practice" : "match",
        duration_mins: 60 + i * 5,
        details:
          i % 2 === 0
            ? { focus_area: `focus-${i}` }
            : { sets_score: `6-${i % 7}` },
      })
    );
    const prompt = buildSystemPrompt(makeProfile(), sessions);
    // All 12 sessions should appear (each produces a bullet point)
    const bulletCount = (prompt.match(/^- /gm) ?? []).length;
    expect(bulletCount).toBe(12);
  });
});

// ── buildSystemPrompt – calendar summary ──────────────────────────────────────

describe("buildSystemPrompt – calendar summary injection", () => {
  it("omits the Upcoming Week section when calendarSummary is null", () => {
    const prompt = buildSystemPrompt(makeProfile(), [], null);
    expect(prompt).not.toContain("Upcoming Week");
    expect(prompt).not.toContain("Google Calendar");
  });

  it("omits the Upcoming Week section when calendarSummary is not provided (default)", () => {
    const prompt = buildSystemPrompt(makeProfile(), []);
    expect(prompt).not.toContain("Upcoming Week");
  });

  it("includes the Upcoming Week section when calendarSummary is a non-empty string", () => {
    const summary =
      "- Tue Jul 14, 9:00 AM: Club Tournament\n- Thu Jul 16 (all day): Travel Day";
    const prompt = buildSystemPrompt(makeProfile(), [], summary);
    expect(prompt).toContain("Upcoming Week");
    expect(prompt).toContain("Club Tournament");
    expect(prompt).toContain("Travel Day");
  });

  it("instructs the coach not to fabricate calendar events", () => {
    const summary = "- Mon Jul 13, 8:00 AM: Morning Fitness";
    const prompt = buildSystemPrompt(makeProfile(), [], summary);
    // Should contain the no-fabrication instruction for calendar data
    expect(prompt.toUpperCase()).toContain("NOT FABRICATE");
  });

  it("places the calendar section after the session log section", () => {
    const summary = "- Tue Jul 14, 9:00 AM: Tournament";
    const prompt = buildSystemPrompt(makeProfile(), [], summary);
    const sessionLogIdx = prompt.indexOf("Recent Training Log");
    const calendarIdx = prompt.indexOf("Upcoming Week");
    expect(calendarIdx).toBeGreaterThan(sessionLogIdx);
  });

  it("places the calendar section before the hard rules section", () => {
    const summary = "- Tue Jul 14, 9:00 AM: Tournament";
    const prompt = buildSystemPrompt(makeProfile(), [], summary);
    const calendarIdx = prompt.indexOf("Upcoming Week");
    const rulesIdx = prompt.indexOf("Rules (always follow");
    expect(calendarIdx).toBeLessThan(rulesIdx);
  });

  it("still includes the full rules section when calendar data is present", () => {
    const summary = "- Tue Jul 14, 9:00 AM: Tournament";
    const prompt = buildSystemPrompt(makeProfile(), [], summary);
    expect(prompt).toContain(
      "If pain is sharp, persistent, or worsening — stop play and see a medical professional."
    );
    expect(prompt).toContain("fabricate");
  });
});
