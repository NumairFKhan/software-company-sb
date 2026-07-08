/**
 * POST /api/dashboard/recommendation/refresh
 *
 * Force-regenerates today's daily recommendation for the authenticated user,
 * replacing any cached row for today. Returns the new recommendation.
 *
 * Auth-gated: 401 if not authenticated.
 *
 * Use cases:
 *   - "Refresh" button on the dashboard
 *   - Nightly Vercel Cron sweep (out of scope for this ticket, but the
 *     endpoint is ready for it — just call with the user's server-side
 *     session context).
 *
 * Response shape:
 *   { recommendation: DailyRecommendation }
 *
 * Error responses:
 *   401 – unauthenticated
 *   500 – upstream error
 */

import { createClient } from "@/lib/supabase/server";
import { generateRecommendation } from "@/lib/recommendation";
import type { PlayerProfile, SessionLog } from "@/types/database";

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient();

  // ── Auth guard ──────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // ── Fetch player context ────────────────────────────────────────────────────
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().slice(0, 10);

  const [profileResult, sessionsResult] = await Promise.all([
    supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("session_logs")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .gte("log_date", fourteenDaysAgoStr)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) {
    console.error(
      "[POST /api/dashboard/recommendation/refresh] profile fetch error:",
      profileResult.error
    );
  }
  if (sessionsResult.error) {
    console.error(
      "[POST /api/dashboard/recommendation/refresh] sessions fetch error:",
      sessionsResult.error
    );
  }

  const profile = (profileResult.data as PlayerProfile | null) ?? null;
  const recentSessions = (sessionsResult.data as SessionLog[]) ?? [];

  // ── Generate fresh recommendation ───────────────────────────────────────────
  let content;
  try {
    content = await generateRecommendation(profile, recentSessions, todayStr);
  } catch (err) {
    console.error(
      "[POST /api/dashboard/recommendation/refresh] generation error:",
      err
    );
    return new Response(
      JSON.stringify({
        error: "Failed to generate recommendation",
        detail: (err as Error).message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Upsert (replace) today's cached row ─────────────────────────────────────
  const { data: recommendation, error: upsertError } = await supabase
    .from("daily_recommendations")
    .upsert(
      {
        user_id: user.id,
        recommendation_date: todayStr,
        ...content,
      },
      { onConflict: "user_id,recommendation_date" }
    )
    .select()
    .single();

  if (upsertError) {
    console.error(
      "[POST /api/dashboard/recommendation/refresh] upsert error:",
      upsertError
    );
    return new Response(
      JSON.stringify({ error: "Failed to store refreshed recommendation" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ recommendation }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
