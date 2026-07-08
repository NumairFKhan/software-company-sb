import type { LogType } from "@/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FatigueTrend =
  | "improving"
  | "stable"
  | "worsening"
  | "insufficient_data";

export interface SessionSummaryRow {
  log_date: string; // "YYYY-MM-DD"
  log_type: LogType;
  fatigue: number | null;
  pain_notes: string | null;
  details: Record<string, unknown>;
}

export interface SessionSummary {
  top_focus_area: string | null;
  fatigue_trend: FatigueTrend;
  pain_flag: boolean;
}

// ── computeSessionSummary ─────────────────────────────────────────────────────

/**
 * Computes the 14-day training summary from a set of session rows.
 *
 * Rows MUST already be filtered to the last 14 days
 * (i.e. log_date >= today minus 14 days).
 *
 * Summary rules:
 * - top_focus_area : most frequent non-empty `details.focus_area` among
 *                    practice sessions in the 14-day window; null if none.
 * - fatigue_trend  : compares the 7-day average fatigue of the *recent*
 *                    window (days 0–6) against the *prior* window (days 7–13).
 *                    Returns "insufficient_data" when the recent window has
 *                    fewer than 2 entries with a fatigue value, or "stable"
 *                    when the prior window is empty (nothing to compare).
 *                    Otherwise: improving if avg decreased > 0.5, worsening
 *                    if avg increased > 0.5, stable otherwise.
 * - pain_flag      : true if any row in the window has a non-null, non-empty
 *                    pain_notes value.
 *
 * @param rows   - Sessions within the last 14 days (non-deleted)
 * @param today  - Reference date as "YYYY-MM-DD" (UTC). Defaults to today.
 */
export function computeSessionSummary(
  rows: SessionSummaryRow[],
  today?: string
): SessionSummary {
  const refDate = today ?? new Date().toISOString().slice(0, 10);

  // Boundary between "recent" (days 0–6) and "prior" (days 7–13)
  const ref = new Date(`${refDate}T00:00:00Z`);
  const boundary = new Date(ref);
  boundary.setUTCDate(boundary.getUTCDate() - 7);
  const boundaryStr = boundary.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // ── top_focus_area ────────────────────────────────────────────────────────
  const focusCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.log_type !== "practice") continue;
    const det = row.details;
    if (!det || typeof det !== "object" || Array.isArray(det)) continue;
    const fa = (det as Record<string, unknown>)["focus_area"];
    if (typeof fa !== "string" || !fa.trim()) continue;
    const area = fa.trim();
    focusCounts.set(area, (focusCounts.get(area) ?? 0) + 1);
  }

  const top_focus_area =
    focusCounts.size > 0
      ? Array.from(focusCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;

  // ── fatigue_trend ─────────────────────────────────────────────────────────
  // recent = log_date >= boundaryStr (last 7 days, days 0–6)
  // prior  = log_date <  boundaryStr (days 7–13 within the 14-day window)
  const recentFatigue = rows
    .filter((r) => r.log_date >= boundaryStr && r.fatigue !== null)
    .map((r) => r.fatigue as number);

  const priorFatigue = rows
    .filter((r) => r.log_date < boundaryStr && r.fatigue !== null)
    .map((r) => r.fatigue as number);

  let fatigue_trend: FatigueTrend;
  if (recentFatigue.length < 2) {
    fatigue_trend = "insufficient_data";
  } else if (priorFatigue.length === 0) {
    // Nothing to compare against — can't derive a direction
    fatigue_trend = "stable";
  } else {
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const recentAvg = avg(recentFatigue);
    const priorAvg = avg(priorFatigue);
    const diff = recentAvg - priorAvg;

    if (diff < -0.5) fatigue_trend = "improving";  // fatigue went down ✓
    else if (diff > 0.5) fatigue_trend = "worsening"; // fatigue went up ✗
    else fatigue_trend = "stable";
  }

  // ── pain_flag ─────────────────────────────────────────────────────────────
  const pain_flag = rows.some(
    (r) => r.pain_notes !== null && r.pain_notes.trim() !== ""
  );

  return { top_focus_area, fatigue_trend, pain_flag };
}
