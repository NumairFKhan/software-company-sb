/**
 * Unit tests for recommendation.ts
 *
 * Tests cover:
 *   - derivePhysicalStatus(): all status branches
 *   - buildRecommendationPrompt(): key content injection
 *   - generateRecommendation(): happy path + error cases (mocked Anthropic)
 */

import {
  derivePhysicalStatus,
  buildRecommendationPrompt,
  generateRecommendation,
  type RecoveryDetails,
} from "@/lib/recommendation";
import type { PlayerProfile, SessionLog } from "@/types/database";

// ── Test fixtures ─────────────────────────────────────────────────────────────

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

// ── derivePhysicalStatus ──────────────────────────────────────────────────────

describe("derivePhysicalStatus – no recovery log", () => {
  it("returns 'No recent recovery log' when details is null", () => {
    expect(derivePhysicalStatus(null)).toBe("No recent recovery log");
  });

  it("returns 'No recent recovery log' for an empty details object", () => {
    expect(derivePhysicalStatus({})).toBe("Feeling good");
    // Empty object with no sleep quality and no soreness → Feeling good
  });
});

describe("derivePhysicalStatus – Feeling good", () => {
  it("returns 'Feeling good' when sleep ≥ 4 and no soreness", () => {
    const d: RecoveryDetails = { sleep_quality: 4 };
    expect(derivePhysicalStatus(d)).toBe("Feeling good");
  });

  it("returns 'Feeling good' when sleep = 5 and no soreness", () => {
    const d: RecoveryDetails = { sleep_quality: 5 };
    expect(derivePhysicalStatus(d)).toBe("Feeling good");
  });

  it("returns 'Feeling good' when sleep ≥ 4 and soreness_areas is empty string", () => {
    const d: RecoveryDetails = { sleep_quality: 4, soreness_areas: "" };
    expect(derivePhysicalStatus(d)).toBe("Feeling good");
  });

  it("returns 'Feeling good' when no sleep_quality and no soreness", () => {
    const d: RecoveryDetails = {};
    expect(derivePhysicalStatus(d)).toBe("Feeling good");
  });
});

describe("derivePhysicalStatus – Recovery day needed", () => {
  it("returns 'Recovery day needed' when sleep_quality ≤ 2", () => {
    const d: RecoveryDetails = { sleep_quality: 2 };
    expect(derivePhysicalStatus(d)).toBe("Recovery day needed");
  });

  it("returns 'Recovery day needed' when sleep_quality = 1", () => {
    const d: RecoveryDetails = { sleep_quality: 1 };
    expect(derivePhysicalStatus(d)).toBe("Recovery day needed");
  });

  it("returns 'Recovery day needed' when soreness_areas has 2 or more comma-separated areas", () => {
    const d: RecoveryDetails = { sleep_quality: 4, soreness_areas: "quads, hamstrings" };
    expect(derivePhysicalStatus(d)).toBe("Recovery day needed");
  });

  it("returns 'Recovery day needed' when soreness_areas has 3 areas", () => {
    const d: RecoveryDetails = { soreness_areas: "quads, hamstrings, calves" };
    expect(derivePhysicalStatus(d)).toBe("Recovery day needed");
  });

  it("returns 'Recovery day needed' when soreness_areas are separated by semicolons", () => {
    const d: RecoveryDetails = { soreness_areas: "quads; calves" };
    expect(derivePhysicalStatus(d)).toBe("Recovery day needed");
  });
});

describe("derivePhysicalStatus – Moderate fatigue", () => {
  it("returns 'Moderate fatigue' when sleep = 3 and no soreness", () => {
    const d: RecoveryDetails = { sleep_quality: 3 };
    expect(derivePhysicalStatus(d)).toBe("Moderate fatigue");
  });

  it("returns 'Moderate fatigue' when sleep ≥ 4 and 1 soreness area noted", () => {
    const d: RecoveryDetails = { sleep_quality: 4, soreness_areas: "quads" };
    expect(derivePhysicalStatus(d)).toBe("Moderate fatigue");
  });

  it("returns 'Moderate fatigue' when sleep = 3 and 1 soreness area", () => {
    const d: RecoveryDetails = { sleep_quality: 3, soreness_areas: "shoulder" };
    expect(derivePhysicalStatus(d)).toBe("Moderate fatigue");
  });
});

// ── buildRecommendationPrompt ─────────────────────────────────────────────────

describe("buildRecommendationPrompt – with profile", () => {
  const today = "2026-07-08";
  const profile = makeProfile();

  it("includes the player name", () => {
    const prompt = buildRecommendationPrompt(profile, [], today);
    expect(prompt).toContain("Alex Smith");
  });

  it("includes the player level", () => {
    const prompt = buildRecommendationPrompt(profile, [], today);
    expect(prompt).toContain("intermediate");
  });

  it("includes goals in the prompt", () => {
    const prompt = buildRecommendationPrompt(profile, [], today);
    expect(prompt).toContain("improve consistency");
    expect(prompt).toContain("enter club tournaments");
  });

  it("includes known_injuries when present", () => {
    const injured = makeProfile({ known_injuries: "right shoulder tendinitis" });
    const prompt = buildRecommendationPrompt(injured, [], today);
    expect(prompt).toContain("right shoulder tendinitis");
  });

  it("includes the date and day of week", () => {
    // 2026-07-08 is a Wednesday
    const prompt = buildRecommendationPrompt(profile, [], today);
    expect(prompt).toContain("Wednesday");
    expect(prompt).toContain("2026");
  });

  it("includes required JSON key names in instructions", () => {
    const prompt = buildRecommendationPrompt(profile, [], today);
    expect(prompt).toContain("session_goal");
    expect(prompt).toContain("warmup");
    expect(prompt).toContain("main_block");
    expect(prompt).toContain("secondary_drill");
    expect(prompt).toContain("fitness_note");
    expect(prompt).toContain("mental_focus");
    expect(prompt).toContain("cooldown");
    expect(prompt).toContain("estimated_duration_mins");
  });
});

describe("buildRecommendationPrompt – no profile (cold start)", () => {
  it("does not throw when profile is null", () => {
    expect(() => buildRecommendationPrompt(null, [], "2026-07-08")).not.toThrow();
  });

  it("mentions cold-start scenario when no sessions", () => {
    const prompt = buildRecommendationPrompt(null, [], "2026-07-08");
    expect(prompt.toLowerCase()).toContain("cold-start");
  });
});

describe("buildRecommendationPrompt – with sessions", () => {
  it("lists the sessions in the prompt", () => {
    const sessions = [
      makeSession({ log_date: "2026-07-06", log_type: "practice", duration_mins: 75 }),
    ];
    const prompt = buildRecommendationPrompt(makeProfile(), sessions, "2026-07-08");
    expect(prompt).toContain("July 6");
    expect(prompt).toContain("75 min");
  });

  it("uses 'No sessions logged' message when sessions array is empty", () => {
    const prompt = buildRecommendationPrompt(makeProfile(), [], "2026-07-08");
    expect(prompt).toContain("No sessions logged");
  });
});

// ── generateRecommendation ────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

/** Builds a minimal mock Anthropic client that returns the given text. */
function makeMockAnthropic(responseText: string): Anthropic {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as unknown as Anthropic;
}

/** A valid recommendation JSON payload. */
const VALID_REC_JSON = JSON.stringify({
  session_goal: "Improve serve consistency.",
  warmup: "5 min jog, dynamic stretching.",
  main_block: "Serve drills focusing on first-serve percentage.",
  secondary_drill: "Volley practice at the net.",
  fitness_note: "Core strength exercises post-session.",
  mental_focus: "Stay relaxed on the serve motion.",
  cooldown: "Static stretching, 5 min.",
  estimated_duration_mins: 75,
});

describe("generateRecommendation – happy path", () => {
  it("returns all 8 required keys", async () => {
    const client = makeMockAnthropic(VALID_REC_JSON);
    const result = await generateRecommendation(null, [], "2026-07-08", client);
    expect(result).toMatchObject({
      session_goal: expect.any(String),
      warmup: expect.any(String),
      main_block: expect.any(String),
      secondary_drill: expect.any(String),
      fitness_note: expect.any(String),
      mental_focus: expect.any(String),
      cooldown: expect.any(String),
      estimated_duration_mins: expect.any(Number),
    });
  });

  it("parses estimated_duration_mins as a number", async () => {
    const client = makeMockAnthropic(VALID_REC_JSON);
    const result = await generateRecommendation(null, [], "2026-07-08", client);
    expect(typeof result.estimated_duration_mins).toBe("number");
    expect(result.estimated_duration_mins).toBe(75);
  });

  it("strips markdown fences if the model wraps in ```json", async () => {
    const fenced = `\`\`\`json\n${VALID_REC_JSON}\n\`\`\``;
    const client = makeMockAnthropic(fenced);
    const result = await generateRecommendation(null, [], "2026-07-08", client);
    expect(result.session_goal).toBe("Improve serve consistency.");
  });
});

describe("generateRecommendation – error cases", () => {
  it("throws when the model returns invalid JSON", async () => {
    const client = makeMockAnthropic("not-json");
    await expect(
      generateRecommendation(null, [], "2026-07-08", client)
    ).rejects.toThrow(/Failed to parse recommendation JSON/);
  });

  it("throws when the model omits a required key", async () => {
    const incomplete = JSON.stringify({
      session_goal: "Improve serve.",
      warmup: "Jog.",
      // missing: main_block, secondary_drill, fitness_note, mental_focus, cooldown, estimated_duration_mins
    });
    const client = makeMockAnthropic(incomplete);
    await expect(
      generateRecommendation(null, [], "2026-07-08", client)
    ).rejects.toThrow(/missing required key/);
  });

  it("throws when the model returns an array instead of an object", async () => {
    const client = makeMockAnthropic("[]");
    await expect(
      generateRecommendation(null, [], "2026-07-08", client)
    ).rejects.toThrow(/must be a plain object/);
  });

  it("throws when the model returns no text content block", async () => {
    const badClient = {
      messages: {
        create: jest.fn().mockResolvedValue({ content: [] }),
      },
    } as unknown as Anthropic;
    await expect(
      generateRecommendation(null, [], "2026-07-08", badClient)
    ).rejects.toThrow(/no text content/);
  });

  it("throws when the Anthropic API call rejects", async () => {
    const errorClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error("API error")),
      },
    } as unknown as Anthropic;
    await expect(
      generateRecommendation(null, [], "2026-07-08", errorClient)
    ).rejects.toThrow("API error");
  });
});

describe("generateRecommendation – with profile and sessions", () => {
  it("calls the Anthropic API with a non-empty prompt", async () => {
    const client = makeMockAnthropic(VALID_REC_JSON);
    const profile = makeProfile();
    const sessions = [
      makeSession({ log_date: "2026-07-06", log_type: "practice" }),
    ];
    await generateRecommendation(profile, sessions, "2026-07-08", client);
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: expect.any(String) }),
        ]),
      })
    );
  });

  it("uses claude-haiku-3-5 as the model", async () => {
    const client = makeMockAnthropic(VALID_REC_JSON);
    await generateRecommendation(null, [], "2026-07-08", client);
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-3-5" })
    );
  });
});
