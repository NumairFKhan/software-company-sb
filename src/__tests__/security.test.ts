/**
 * security.test.ts
 *
 * Security hardening tests for CourtCoach AI.
 *
 * Coverage:
 *   1. Medical disclaimer injection — every system prompt that touches pain /
 *      injury / soreness / physical symptoms must include the exact verbatim
 *      disclaimer text, and the rule must be MANDATORY (non-negotiable).
 *
 *   2. System-prompt rule structure — the hard-rules section must include
 *      strong imperative language, cover all required trigger terms, and
 *      specify that the disclaimer must appear "verbatim".
 *
 *   3. API key safety — ANTHROPIC_API_KEY must not be prefixed with
 *      NEXT_PUBLIC_ anywhere in the source tree (build-time check proxy).
 *
 *   4. Rate-limit threshold — the published RATE_LIMIT_MAX constant matches
 *      the 30-per-hour requirement from the acceptance criteria.
 *
 *   5. Rate-limit 429 behaviour — the mock-Supabase helpers verify that at
 *      exactly 30 messages the door closes (covered in rate-limit.test.ts;
 *      this file adds the representative-prompt scenario check).
 */

import { buildSystemPrompt } from "@/lib/chat-context";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit";
import type { PlayerProfile, SessionLog } from "@/types/database";
import * as fs from "fs";
import * as path from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DISCLAIMER =
  "If pain is sharp, persistent, or worsening — stop play and see a medical professional.";

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "sec-profile-001",
    user_id: "sec-user-001",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    display_name: "Security Test Player",
    level: "intermediate",
    handedness: "right",
    backhand_type: "two_handed",
    goals: ["improve serve"],
    technical_focus: [],
    available_days: ["Monday", "Wednesday"],
    session_length_minutes: 60,
    known_injuries: null,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<SessionLog> & { log_date: string; log_type: SessionLog["log_type"] }
): SessionLog {
  return {
    id: "sec-sess-001",
    user_id: "sec-user-001",
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

// ── 1. Medical disclaimer rule ────────────────────────────────────────────────

describe("Medical disclaimer – system prompt rules section", () => {
  it("includes the exact verbatim disclaimer text in every system prompt", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt).toContain(DISCLAIMER);
  });

  it("includes the verbatim disclaimer when a profile is present", () => {
    const prompt = buildSystemPrompt(makeProfile(), []);
    expect(prompt).toContain(DISCLAIMER);
  });

  it("includes the verbatim disclaimer when sessions are present", () => {
    const sessions: SessionLog[] = [
      makeSession({ log_date: "2026-07-07", log_type: "practice", duration_mins: 60 }),
    ];
    const prompt = buildSystemPrompt(makeProfile(), sessions);
    expect(prompt).toContain(DISCLAIMER);
  });

  it("marks the disclaimer rule as MANDATORY / non-negotiable", () => {
    const prompt = buildSystemPrompt(null, []);
    // The strengthened rule should signal MANDATORY or non-negotiable
    const upper = prompt.toUpperCase();
    const hasMandatory = upper.includes("MANDATORY") || upper.includes("NON-NEGOTIABLE");
    expect(hasMandatory).toBe(true);
  });

  it("explicitly says 'verbatim' so the model cannot paraphrase the disclaimer", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("verbatim");
  });

  it("covers 'injury' as a trigger word — not just 'pain'", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("injury");
  });

  it("covers 'soreness' as a trigger word", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("soreness");
  });

  it("covers 'physical symptoms' as a trigger phrase", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt.toLowerCase()).toContain("physical symptoms");
  });

  it("instructs that the disclaimer must appear even when the AI brings it up (not just user)", () => {
    const prompt = buildSystemPrompt(null, []);
    // The rule should cover AI-initiated mentions, not just user-initiated ones
    // Checking that it says "your response" or "any response" (not just "if the player")
    const coversBothDirections =
      prompt.toLowerCase().includes("any response") ||
      prompt.toLowerCase().includes("your response") ||
      prompt.toLowerCase().includes("you write");
    expect(coversBothDirections).toBe(true);
  });
});

// ── 2. Disclaimer trigger terms – representative prompts ──────────────────────
// We cannot call the live Claude API in unit tests, but we CAN verify that
// the system prompt has sufficiently strong rules for each of the five
// representative prompt categories from the acceptance criteria.

describe("Medical disclaimer – representative prompt scenarios (rule coverage)", () => {
  const prompt = buildSystemPrompt(makeProfile(), [
    makeSession({ log_date: "2026-07-07", log_type: "practice", duration_mins: 60, pain_notes: "shoulder ache" }),
  ]);

  const scenarios = [
    { label: "Sharp pain mention",       present: prompt.includes("pain") },
    { label: "Injury mention",           present: prompt.toLowerCase().includes("injury") },
    { label: "Soreness mention",         present: prompt.toLowerCase().includes("soreness") },
    { label: "Physical symptoms phrase", present: prompt.toLowerCase().includes("physical symptoms") },
    { label: "Verbatim disclaimer text", present: prompt.includes(DISCLAIMER) },
  ];

  for (const { label, present } of scenarios) {
    it(`Rule covers: ${label}`, () => {
      expect(present).toBe(true);
    });
  }
});

// ── 3. API key safety ─────────────────────────────────────────────────────────

describe("API key safety – source code scan", () => {
  const SRC_DIR = path.join(process.cwd(), "src");

  /**
   * Recursively reads all .ts/.tsx source files under a directory, excluding
   * test files (__tests__/ and *.test.ts) which may reference forbidden
   * strings in assertions without those strings actually being in the app.
   */
  function getAppSourceContent(dir: string): string {
    const results: string[] = [];
    function walk(current: string) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          // Skip test directories
          if (entry.name === "__tests__") continue;
          walk(full);
        } else if (
          entry.isFile() &&
          /\.(ts|tsx)$/.test(entry.name) &&
          !entry.name.endsWith(".test.ts") &&
          !entry.name.endsWith(".test.tsx") &&
          !entry.name.endsWith(".spec.ts")
        ) {
          results.push(fs.readFileSync(full, "utf-8"));
        }
      }
    }
    walk(dir);
    return results.join("\n");
  }

  const sourceContent = getAppSourceContent(SRC_DIR);

  it("ANTHROPIC_API_KEY is never prefixed with NEXT_PUBLIC_", () => {
    // A NEXT_PUBLIC_ prefix would expose the key to the browser bundle.
    expect(sourceContent).not.toMatch(/NEXT_PUBLIC_ANTHROPIC_API_KEY/);
  });

  it("env.example does not accidentally expose ANTHROPIC_API_KEY with NEXT_PUBLIC_", () => {
    const envExample = fs.readFileSync(
      path.join(process.cwd(), "env.example"),
      "utf-8"
    );
    expect(envExample).not.toMatch(/NEXT_PUBLIC_ANTHROPIC_API_KEY/);
  });

  it("ANTHROPIC_API_KEY is accessed only through process.env without NEXT_PUBLIC_ prefix", () => {
    // Verify there IS a reference to ANTHROPIC_API_KEY (we're using it)
    expect(sourceContent).toMatch(/ANTHROPIC_API_KEY/);
    // But it must never have the NEXT_PUBLIC_ prefix
    expect(sourceContent).not.toMatch(/NEXT_PUBLIC_ANTHROPIC/);
  });
});

// ── 4. Rate-limit constants ───────────────────────────────────────────────────

describe("Rate limit constants", () => {
  it("RATE_LIMIT_MAX is exactly 30 messages per window", () => {
    expect(RATE_LIMIT_MAX).toBe(30);
  });

  it("RATE_LIMIT_WINDOW_MS is exactly one hour (3600000 ms)", () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(60 * 60 * 1000);
  });

  it("RATE_LIMIT_MAX * 2 does not exceed 60 (sanity check: not too generous)", () => {
    // Just a sanity check that no one accidentally set it to 300 or similar
    expect(RATE_LIMIT_MAX).toBeLessThanOrEqual(30);
  });
});

// ── 5. System prompt structure integrity ─────────────────────────────────────

describe("System prompt structure", () => {
  it("contains four distinct sections separated by double newlines", () => {
    const prompt = buildSystemPrompt(makeProfile(), []);
    // Sections are joined with "\n\n"
    const sections = prompt.split("\n\n");
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });

  it("rules section lists all three rules (medical, no-fabrication, conciseness)", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt).toContain("RULE 1");
    expect(prompt).toContain("RULE 2");
    expect(prompt).toContain("RULE 3");
  });

  it("no-fabrication rule explicitly says 'never invent' or 'never fabricate'", () => {
    const prompt = buildSystemPrompt(null, []);
    const lower = prompt.toLowerCase();
    const hasNoFabrication =
      lower.includes("never invent") ||
      lower.includes("never fabricate") ||
      lower.includes("not fabricate");
    expect(hasNoFabrication).toBe(true);
  });

  it("system prompt mentions CourtCoach (brand identity)", () => {
    const prompt = buildSystemPrompt(null, []);
    expect(prompt).toContain("CourtCoach");
  });
});
