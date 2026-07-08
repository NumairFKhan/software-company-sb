/**
 * GET /api/dashboard
 *
 * Returns the dashboard payload for the authenticated user:
 *   - today's recommendation (generates + caches if not yet done)
 *   - last 3 session summaries
 *   - physical_status derived from the most recent recovery log
 *
 * Caching strategy:
 *   On each call, the route checks `daily_recommendations` for a row with
 *   (user_id, recommendation_date = today). If one exists, it is returned
 *   immediately. If not, Claude Haiku is invoked, the result is stored, and
 *   the stored value is returned. The dashboard server component calls this
 *   on every full-page SSR load, so the recommendation is always fresh for
 *   the day without redundant LLM calls.
 *
 * Response shape:
 *   {
 *     recommendation: DailyRecommendation,
 *     recent_sessions: SessionLog[],   // last 3, newest-first
 *     physical_status: PhysicalStatus,
 *   }
 *
 * Error responses:
 *   401 – unauthenticated
 *   500 – upstream error
 */

import { createClient } from "@/lib/supabase/server";
import { generateRecommendation, derivePhysicalStatus } from "@/lib/recommendation";
import type { PlayerProfile, SessionLog } from "@/types/database";
import type { RecoveryDetails } from "@/lib/recommendation";

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET() {
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

  // ── Fetch all needed data in parallel ──────────────────────────────────────
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().slice(0, 10);

  const [profileResult, sessionsResult, existingRecResult] = await Promise.all([
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
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50), // more than enough for last-3 + last-14-days
    supabase
      .from("daily_recommendations")
      .select("*")
      .eq("user_id", user.id)
      .eq("recommendation_date", todayStr)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    console.error("[GET /api/dashboard] profile fetch error:", profileResult.error);
  }
  if (sessionsResult.error) {
    console.error("[GET /api/dashboard] sessions fetch error:", sessionsResult.error);
  }

  const profile = (profileResult.data as PlayerProfile | null) ?? null;
  const allSessions = (sessionsResult.data as SessionLog[]) ?? [];

  // Last 3 sessions for the UI summary
  const recent_sessions = allSessions.slice(0, 3);

  // Last 14 days for the recommendation context
  const last14Days = allSessions.filter((s) => s.log_date >= fourteenDaysAgoStr);

  // ── Physical status ─────────────────────────────────────────────────────────
  // Find the most recent recovery log
  const latestRecovery = allSessions.find((s) => s.log_type === "recovery");
  const physical_status = derivePhysicalStatus(
    latestRecovery ? (latestRecovery.details as RecoveryDetails) : null
  );

  // ── Recommendation (cached or freshly generated) ────────────────────────────
  let recommendation = existingRecResult.data;

  if (!recommendation) {
    // Generate a new recommendation via Claude Haiku
    try {
      const content = await generateRecommendation(profile, last14Days, todayStr);

      const { data: inserted, error: insertError } = await supabase
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

      if (insertError) {
        console.error(
          "[GET /api/dashboard] failed to store recommendation:",
          insertError
        );
        // Return the generated content even if storage fails
        return new Response(
          JSON.stringify({
            recommendation: {
              id: "ephemeral",
              user_id: user.id,
              recommendation_date: todayStr,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...content,
            },
            recent_sessions,
            physical_status,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      recommendation = inserted;
    } catch (err) {
      console.error("[GET /api/dashboard] recommendation generation error:", err);
      return new Response(
        JSON.stringify({
          error: "Failed to generate daily recommendation",
          detail: (err as Error).message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({ recommendation, recent_sessions, physical_status }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
