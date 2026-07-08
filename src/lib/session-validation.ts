import type { LogType, Json } from "@/types/database";

export const VALID_LOG_TYPES: LogType[] = [
  "practice",
  "match",
  "fitness",
  "recovery",
];

export interface SessionInput {
  log_date?: unknown;
  log_type?: unknown;
  duration_mins?: unknown;
  intensity?: unknown;
  fatigue?: unknown;
  pain_notes?: unknown;
  free_notes?: unknown;
  details?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidatedSession {
  log_date: string;        // ISO date "YYYY-MM-DD"
  log_type: LogType;
  duration_mins: number;
  intensity: number | null;
  fatigue: number | null;
  pain_notes: string | null;
  free_notes: string | null;
  details: Json;
}

/** Regex for YYYY-MM-DD */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date as an ISO string "YYYY-MM-DD" (UTC) */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validates and coerces raw session log input.
 * Returns either a ValidatedSession (success) or a ValidationError (failure).
 */
export function validateSessionInput(
  body: SessionInput
): { ok: true; data: ValidatedSession } | { ok: false; error: ValidationError } {
  // ── log_type (required, must be a valid enum value) ────────────────────────
  if (
    !body.log_type ||
    typeof body.log_type !== "string" ||
    !(VALID_LOG_TYPES as string[]).includes(body.log_type)
  ) {
    return {
      ok: false,
      error: {
        field: "log_type",
        message: `log_type must be one of: ${VALID_LOG_TYPES.join(", ")}`,
      },
    };
  }

  // ── duration_mins (required, positive integer) ─────────────────────────────
  const rawDuration = body.duration_mins;
  if (
    rawDuration === undefined ||
    rawDuration === null ||
    typeof rawDuration !== "number" ||
    !Number.isInteger(rawDuration) ||
    rawDuration < 1
  ) {
    return {
      ok: false,
      error: {
        field: "duration_mins",
        message: "duration_mins must be a positive integer",
      },
    };
  }

  // ── log_date (optional, defaults to today) ─────────────────────────────────
  let log_date = todayIso();
  if (body.log_date !== undefined && body.log_date !== null) {
    if (typeof body.log_date !== "string" || !DATE_RE.test(body.log_date)) {
      return {
        ok: false,
        error: {
          field: "log_date",
          message: "log_date must be a string in YYYY-MM-DD format",
        },
      };
    }
    log_date = body.log_date;
  }

  // ── intensity (optional, 1–5) ──────────────────────────────────────────────
  let intensity: number | null = null;
  if (body.intensity !== undefined && body.intensity !== null) {
    const n = body.intensity;
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > 5
    ) {
      return {
        ok: false,
        error: {
          field: "intensity",
          message: "intensity must be an integer between 1 and 5",
        },
      };
    }
    intensity = n;
  }

  // ── fatigue (optional, 1–5) ────────────────────────────────────────────────
  let fatigue: number | null = null;
  if (body.fatigue !== undefined && body.fatigue !== null) {
    const n = body.fatigue;
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > 5
    ) {
      return {
        ok: false,
        error: {
          field: "fatigue",
          message: "fatigue must be an integer between 1 and 5",
        },
      };
    }
    fatigue = n;
  }

  // ── pain_notes (optional, string) ─────────────────────────────────────────
  const pain_notes =
    typeof body.pain_notes === "string" && body.pain_notes.trim()
      ? body.pain_notes.trim()
      : null;

  // ── free_notes (optional, string) ─────────────────────────────────────────
  const free_notes =
    typeof body.free_notes === "string" && body.free_notes.trim()
      ? body.free_notes.trim()
      : null;

  // ── details (optional, must be a plain object if provided) ────────────────
  let details: Json = {};
  if (body.details !== undefined && body.details !== null) {
    if (
      typeof body.details !== "object" ||
      Array.isArray(body.details)
    ) {
      return {
        ok: false,
        error: {
          field: "details",
          message: "details must be a JSON object",
        },
      };
    }
    details = body.details as Json;
  }

  return {
    ok: true,
    data: {
      log_date,
      log_type: body.log_type as LogType,
      duration_mins: rawDuration,
      intensity,
      fatigue,
      pain_notes,
      free_notes,
      details,
    },
  };
}
