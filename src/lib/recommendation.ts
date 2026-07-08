/**
 * recommendation.ts
 *
 * Core logic for generating and caching daily AI training recommendations.
 *
 * Uses claude-haiku-3-5 (not Sonnet) — this is a non-interactive,
 * cost-sensitive batch operation that runs once per user per day.
 *
 * Public API:
 *   generateRecommendation(profile, recentSessions, todayStr) → DailyRecommendationContent
 *   derivePhysicalStatus(mostRecentRecoveryLog)              → PhysicalStatus
 *   buildRecommendationPrompt(profile, recentSessions, todayStr) → string
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PlayerProfile, SessionLog } from "@/types/database";
import type {
  DailyRecommendationContent,
  PhysicalStatus,
} from "@/types/database";
import { serializeSession } from "@/lib/chat-context";

// ── Constants ─────────────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-3-5";
const MAX_TOKENS = 1024;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── Required JSON keys in the Claude response ─────────────────────────────────

const REQUIRED_KEYS: (keyof DailyRecommendationContent)[] = [
  "session_goal",
  "warmup",
  "main_block",
  "secondary_drill",
  "fitness_note",
  "mental_focus",
  "cooldown",
  "estimated_duration_mins",
];

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the system+user prompt for recommendation generation.
 *
 * Injected context:
 *   - Player profile (or cold-start notice)
 *   - Last 14 days of session logs (newest first)
 *   - Today's date and day of week (for schedule awareness)
 */
export function buildRecommendationPrompt(
  profile: PlayerProfile | null,
  recentSessions: SessionLog[], // expected: already filtered to last 14 days
  todayStr: string              // "YYYY-MM-DD"
): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = DAY_NAMES[dateObj.getUTCDay()];
  const humanDate = dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const lines: string[] = [];

  lines.push(
    `You are CourtCoach AI, an expert tennis coach. Generate a personalized daily training recommendation for today.`
  );
  lines.push(`Today is ${dayOfWeek}, ${humanDate}.`);
  lines.push("");

  // ── Player profile section ─────────────────────────────────────────────────
  if (profile) {
    lines.push("## Player Profile");
    lines.push(`Name: ${profile.display_name}`);
    lines.push(`Level: ${profile.level}`);
    lines.push(`Handedness: ${profile.handedness}`);
    lines.push(
      `Backhand: ${profile.backhand_type === "one_handed" ? "One-handed" : "Two-handed"}`
    );
    if (profile.goals?.length) {
      lines.push(`Goals: ${profile.goals.join(", ")}`);
    }
    if (profile.technical_focus?.length) {
      lines.push(`Technical focus: ${profile.technical_focus.join(", ")}`);
    }
    if (profile.available_days?.length) {
      lines.push(`Available days: ${profile.available_days.join(", ")}`);
    }
    if (profile.session_length_minutes) {
      lines.push(
        `Preferred session length: ${profile.session_length_minutes} minutes`
      );
    }
    if (profile.known_injuries) {
      lines.push(`Known injuries / limitations: ${profile.known_injuries}`);
    }
  } else {
    lines.push(
      "## Player Profile\nNo profile set up yet — treat this as a general recreational player."
    );
  }

  lines.push("");

  // ── Recent logs section ────────────────────────────────────────────────────
  if (recentSessions.length > 0) {
    lines.push("## Recent Training (last 14 days, newest first)");
    for (const session of recentSessions) {
      lines.push(`- ${serializeSession(session)}`);
    }
  } else {
    lines.push(
      "## Recent Training\nNo sessions logged yet. This is a cold-start — the player has no training history."
    );
  }

  lines.push("");

  // ── Output instructions ────────────────────────────────────────────────────
  lines.push(
    `## Instructions
Return ONLY valid JSON — no markdown fences, no extra text — with exactly these keys:

{
  "session_goal": "One sentence describing what today's session aims to achieve.",
  "warmup": "2–4 sentences describing the warm-up routine.",
  "main_block": "3–5 sentences describing the main training block with specific drills.",
  "secondary_drill": "2–3 sentences for a secondary or supplementary drill.",
  "fitness_note": "1–2 sentences on the physical/conditioning component.",
  "mental_focus": "1–2 sentences on the mental or tactical focus for today.",
  "cooldown": "1–2 sentences on the cool-down routine.",
  "estimated_duration_mins": 75
}

Rules:
- Match content to the player's level and available session length.
- If there is no training history, begin the session_goal with: "I don't have much history from you yet — here's a good default session to start..."
- Be specific: reference actual tennis techniques, drills, and exercises by name.
- Keep each section concise (1–5 sentences).
- estimated_duration_mins must be an integer (number, not a string).`
  );

  return lines.join("\n");
}

// ── Recommendation generator ──────────────────────────────────────────────────

/**
 * Calls Claude Haiku to generate a daily training recommendation.
 *
 * Throws if the API call fails or the response JSON is malformed /
 * missing required keys — callers should handle errors appropriately.
 */
export async function generateRecommendation(
  profile: PlayerProfile | null,
  recentSessions: SessionLog[],
  todayStr: string,
  anthropicClient?: Anthropic
): Promise<DailyRecommendationContent> {
  const client = anthropicClient ?? new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = buildRecommendationPrompt(profile, recentSessions, todayStr);

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract text content from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  // Parse the JSON response
  let parsed: unknown;
  try {
    // Strip any accidental markdown code fences the model might add
    const rawText = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(
      `Failed to parse recommendation JSON: ${(e as Error).message}`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Recommendation JSON must be a plain object");
  }

  const obj = parsed as Record<string, unknown>;

  // Validate all required keys are present
  for (const key of REQUIRED_KEYS) {
    if (!(key in obj)) {
      throw new Error(`Recommendation JSON missing required key: "${key}"`);
    }
  }

  // Coerce and return
  return {
    session_goal: String(obj.session_goal),
    warmup: String(obj.warmup),
    main_block: String(obj.main_block),
    secondary_drill: String(obj.secondary_drill),
    fitness_note: String(obj.fitness_note),
    mental_focus: String(obj.mental_focus),
    cooldown: String(obj.cooldown),
    estimated_duration_mins: Number(obj.estimated_duration_mins),
  };
}

// ── Physical status derivation ────────────────────────────────────────────────

export interface RecoveryDetails {
  sleep_quality?: number; // 1–5
  soreness_areas?: string;
}

/**
 * Derives a human-readable physical status label from the most recent
 * recovery log's JSONB details.
 *
 * Rules:
 *   - No recovery log at all                         → "No recent recovery log"
 *   - sleep_quality ≥ 4 AND no soreness noted        → "Feeling good"
 *   - sleep_quality ≤ 2 OR soreness mentions ≥ 2 areas → "Recovery day needed"
 *   - Otherwise                                      → "Moderate fatigue"
 */
export function derivePhysicalStatus(
  recoveryDetails: RecoveryDetails | null
): PhysicalStatus {
  if (!recoveryDetails) {
    return "No recent recovery log";
  }

  const sleep = recoveryDetails.sleep_quality ?? null;
  const soreness = (recoveryDetails.soreness_areas ?? "").trim();

  // Count areas mentioned (split by comma, semicolon, or "and")
  const soreness_count = soreness
    ? soreness.split(/[,;]|\band\b/i).filter((s) => s.trim().length > 0).length
    : 0;

  if (sleep !== null && sleep <= 2) {
    return "Recovery day needed";
  }

  if (soreness_count >= 2) {
    return "Recovery day needed";
  }

  if ((sleep === null || sleep >= 4) && soreness_count === 0) {
    return "Feeling good";
  }

  return "Moderate fatigue";
}
