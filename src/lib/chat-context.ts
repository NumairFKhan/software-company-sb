/**
 * chat-context.ts
 *
 * Builds the Claude system prompt by serialising the player's profile and
 * recent session logs into structured, human-readable text blocks.
 *
 * System-prompt structure (per technical spec):
 *   [Role & tone block]
 *   [Player profile]
 *   [Last 30 days session logs, newest first]
 *   [Hard rules: medical disclaimer, no-fabrication, concise default]
 */

import type { PlayerProfile, SessionLog } from "@/types/database";

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Converts an ISO date string ("YYYY-MM-DD") to a human-readable label
 * such as "July 5" using UTC so timezone shifts don't change the date.
 */
function formatLogDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── Session serialisation ─────────────────────────────────────────────────────

const LOG_TYPE_LABELS: Record<string, string> = {
  practice: "Tennis Practice",
  match: "Match",
  fitness: "Fitness Training",
  recovery: "Recovery",
};

/**
 * Serialises a single session log as a one-line human-readable text block.
 *
 * Example output:
 *   "July 5: Tennis Practice, 75 min, intensity 4/5, fatigue 3/5,
 *    focus: backhand cross-court. Notes: felt inconsistent on second ball."
 */
export function serializeSession(session: SessionLog): string {
  const date = formatLogDate(session.log_date);
  const type = LOG_TYPE_LABELS[session.log_type] ?? session.log_type;
  const duration = `${session.duration_mins} min`;

  const parts: string[] = [`${date}: ${type}, ${duration}`];

  if (session.intensity !== null) {
    parts[0] += `, intensity ${session.intensity}/5`;
  }
  if (session.fatigue !== null) {
    parts[0] += `, fatigue ${session.fatigue}/5`;
  }

  const details = (session.details ?? {}) as Record<string, unknown>;

  // Type-specific detail fields
  switch (session.log_type) {
    case "practice": {
      const focus = details["focus_area"];
      const drills = details["drill_notes"];
      if (focus) parts.push(`focus: ${focus}`);
      if (drills) parts.push(`drills: ${drills}`);
      break;
    }
    case "match": {
      const score = details["sets_score"];
      const surface = details["surface"];
      const opponent = details["opponent_level"];
      if (score) parts.push(`score: ${score}`);
      if (surface) parts.push(`surface: ${surface}`);
      if (opponent) parts.push(`opponent level: ${opponent}`);
      break;
    }
    case "fitness": {
      const activity = details["activity_type"];
      const notes = details["gym_notes"];
      if (activity) parts.push(`activity: ${activity}`);
      if (notes) parts.push(`notes: ${notes}`);
      break;
    }
    case "recovery": {
      const sleepQuality = details["sleep_quality"];
      const soreness = details["soreness_areas"];
      if (sleepQuality !== undefined && sleepQuality !== null) {
        parts.push(`sleep quality: ${sleepQuality}/5`);
      }
      if (soreness) parts.push(`soreness: ${soreness}`);
      break;
    }
  }

  if (session.pain_notes?.trim()) {
    parts.push(`pain notes: ${session.pain_notes.trim()}`);
  }
  if (session.free_notes?.trim()) {
    parts.push(`notes: ${session.free_notes.trim()}`);
  }

  // Join headline + detail clauses with ". " for readability
  const [headline, ...details2] = parts;
  return details2.length > 0
    ? `${headline}. ${details2.join(", ")}.`
    : `${headline}.`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

/**
 * Assembles the full Claude system prompt from the player's profile and their
 * last 30 days of session logs (newest first).
 *
 * When profile is null (new user), the prompt instructs the model to give
 * general advice without fabricating a profile.
 *
 * When sessions is empty, the prompt explicitly says no logs exist so the
 * model does not invent session data.
 *
 * When calendarSummary is provided (non-null), an "Upcoming Week" section is
 * injected so the coach can reference schedule context (e.g. tournaments,
 * travel, or busy days) when giving advice.  When null, the section is omitted
 * entirely — the rest of the prompt is unaffected.
 */
export function buildSystemPrompt(
  profile: PlayerProfile | null,
  recentSessions: SessionLog[],
  calendarSummary: string | null = null
): string {
  const sections: string[] = [];

  // ── [1] Role & tone block ──────────────────────────────────────────────────
  sections.push(
    `You are CourtCoach, an expert AI tennis coach. Your role is to provide practical, specific, and actionable advice tailored to this player's logged training data and stated goals. Speak in clear tennis language — reference techniques, drills, tactics, and conditioning by name. Be encouraging but direct. Default to concise responses (2–4 focused paragraphs) unless the player explicitly asks for more detail.`
  );

  // ── [2] Player profile ─────────────────────────────────────────────────────
  if (profile) {
    const lines: string[] = [
      "## Player Profile",
      `Name: ${profile.display_name}`,
      `Level: ${profile.level}`,
      `Handedness: ${profile.handedness}`,
      `Backhand: ${profile.backhand_type === "one_handed" ? "One-handed" : "Two-handed"}`,
    ];

    if (profile.goals?.length) {
      lines.push(`Goals: ${profile.goals.join(", ")}`);
    }
    if (profile.technical_focus?.length) {
      lines.push(`Technical focus areas: ${profile.technical_focus.join(", ")}`);
    }
    if (profile.available_days?.length) {
      lines.push(`Available training days: ${profile.available_days.join(", ")}`);
    }
    if (profile.session_length_minutes) {
      lines.push(`Preferred session length: ${profile.session_length_minutes} minutes`);
    }
    if (profile.known_injuries) {
      lines.push(`Known injuries / limitations: ${profile.known_injuries}`);
    }

    sections.push(lines.join("\n"));
  } else {
    sections.push(
      `## Player Profile\nNo profile set up yet. Provide general advice suitable for a recreational tennis player and encourage the player to complete their profile for personalised coaching.`
    );
  }

  // ── [3] Last 30 days session logs (newest first) ───────────────────────────
  if (recentSessions.length > 0) {
    const logLines: string[] = [
      "## Recent Training Log (last 30 days, newest first)",
    ];
    for (const session of recentSessions) {
      logLines.push(`- ${serializeSession(session)}`);
    }
    sections.push(logLines.join("\n"));
  } else {
    sections.push(
      `## Recent Training Log\nNo sessions logged in the last 30 days. Do NOT fabricate any training sessions. Offer general advice and encourage the player to start logging their sessions.`
    );
  }

  // ── [4] Upcoming week from Google Calendar (optional) ─────────────────────
  if (calendarSummary) {
    sections.push(
      `## Upcoming Week (Google Calendar — next 7 days)\n${calendarSummary}\n\nUse this calendar context to give scheduling-aware advice. For example, note if the player has a tournament coming up, has a busy travel day, or should taper their training load. Do NOT fabricate calendar events beyond what is listed above.`
    );
  }

  // ── [5] Hard rules ─────────────────────────────────────────────────────────
  sections.push(
    `## Rules (always follow these — non-negotiable)

RULE 1 — MEDICAL DISCLAIMER (MANDATORY):
Any response you write that references pain, injury, soreness, or physical symptoms — whether the player mentioned it or you brought it up — MUST end with the following disclaimer verbatim on its own line:
"If pain is sharp, persistent, or worsening — stop play and see a medical professional."
This disclaimer is not optional. Do NOT paraphrase it, abbreviate it, or skip it. If your response discusses recovery, overuse, aches, strains, tiredness in muscles, or any physical limitation whatsoever, you MUST include it.

RULE 2 — NO FABRICATION:
Only reference sessions and data that appear explicitly in the training log above. Never invent sessions, scores, metrics, or events that are not listed.

RULE 3 — CONCISENESS:
Be concise by default (2–4 paragraphs). Provide deeper detail only when the player explicitly asks for it.`
  );

  return sections.join("\n\n");
}
