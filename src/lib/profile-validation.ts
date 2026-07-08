import type { PlayerLevel, Handedness, BackhandType } from "@/types/database";

export interface ProfileInput {
  display_name?: unknown;
  level?: unknown;
  handedness?: unknown;
  backhand_type?: unknown;
  goals?: unknown;
  technical_focus?: unknown;
  available_days?: unknown;
  session_length_minutes?: unknown;
  known_injuries?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidatedProfile {
  display_name: string;
  level: PlayerLevel;
  handedness: Handedness;
  backhand_type: BackhandType;
  goals: string[];
  technical_focus: string[];
  available_days: string[];
  session_length_minutes: number;
  known_injuries: string | null;
}

const VALID_LEVELS: PlayerLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "competitive",
  "professional",
];

const VALID_HANDEDNESS: Handedness[] = ["right", "left"];
const VALID_BACKHAND: BackhandType[] = ["one_handed", "two_handed"];

/**
 * Validates and coerces raw profile input.
 * Returns either a ValidatedProfile (success) or a ValidationError (failure).
 */
export function validateProfileInput(
  body: ProfileInput
): { ok: true; data: ValidatedProfile } | { ok: false; error: ValidationError } {
  // display_name
  if (!body.display_name || typeof body.display_name !== "string") {
    return { ok: false, error: { field: "display_name", message: "display_name is required" } };
  }
  const display_name = body.display_name.trim();
  if (!display_name) {
    return { ok: false, error: { field: "display_name", message: "display_name cannot be blank" } };
  }

  // level
  if (!body.level || !VALID_LEVELS.includes(body.level as PlayerLevel)) {
    return { ok: false, error: { field: "level", message: "Invalid level" } };
  }

  // handedness
  if (!body.handedness || !VALID_HANDEDNESS.includes(body.handedness as Handedness)) {
    return { ok: false, error: { field: "handedness", message: "Invalid handedness" } };
  }

  // backhand_type
  if (!body.backhand_type || !VALID_BACKHAND.includes(body.backhand_type as BackhandType)) {
    return { ok: false, error: { field: "backhand_type", message: "Invalid backhand_type" } };
  }

  return {
    ok: true,
    data: {
      display_name,
      level: body.level as PlayerLevel,
      handedness: body.handedness as Handedness,
      backhand_type: body.backhand_type as BackhandType,
      goals: Array.isArray(body.goals) ? (body.goals as string[]) : [],
      technical_focus: Array.isArray(body.technical_focus)
        ? (body.technical_focus as string[])
        : [],
      available_days: Array.isArray(body.available_days)
        ? (body.available_days as string[])
        : [],
      session_length_minutes:
        typeof body.session_length_minutes === "number"
          ? body.session_length_minutes
          : 60,
      known_injuries:
        typeof body.known_injuries === "string"
          ? body.known_injuries || null
          : null,
    },
  };
}
