/**
 * /dashboard — Daily training dashboard (Next.js SSR server component).
 *
 * On every full page load:
 *   1. Fetches the player profile (redirects to onboarding if missing).
 *   2. Fetches today's recommendation from the DB (generates via Claude Haiku
 *      if no row exists yet — handled in GET /api/dashboard).
 *   3. Fetches last 3 session summaries.
 *   4. Derives physical status from the most recent recovery log.
 *   5. Renders the recommendation card, status chip, sessions, and quick-actions.
 */

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { PlayerProfile, SessionLog, DailyRecommendation } from "@/types/database";
import type { PhysicalStatus } from "@/types/database";
import { generateRecommendation, derivePhysicalStatus } from "@/lib/recommendation";
import type { RecoveryDetails } from "@/lib/recommendation";
import RefreshButton from "./RefreshButton";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOG_TYPE_LABELS: Record<string, string> = {
  practice: "Practice",
  match: "Match",
  fitness: "Fitness",
  recovery: "Recovery",
};

const LOG_TYPE_ICONS: Record<string, string> = {
  practice: "🎾",
  match: "🏆",
  fitness: "💪",
  recovery: "😴",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function physicalStatusConfig(status: PhysicalStatus): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case "Feeling good":
      return { label: "Feeling good", color: "bg-green-500/15 text-green-400 border-green-500/30", icon: "✅" };
    case "Moderate fatigue":
      return { label: "Moderate fatigue", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: "⚡" };
    case "Recovery day needed":
      return { label: "Recovery day needed", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: "🛑" };
    case "No recent recovery log":
    default:
      return { label: "No recent recovery log", color: "bg-slate-700/40 text-slate-400 border-slate-600", icon: "📋" };
  }
}

// ── Section metadata for the recommendation card ──────────────────────────────

interface RecSection {
  key: keyof DailyRecommendation;
  icon: string;
  label: string;
}

const REC_SECTIONS: RecSection[] = [
  { key: "warmup",          icon: "🔥", label: "Warm-up" },
  { key: "main_block",      icon: "🎾", label: "Main Block" },
  { key: "secondary_drill", icon: "🔄", label: "Secondary Drill" },
  { key: "fitness_note",    icon: "💪", label: "Fitness" },
  { key: "mental_focus",    icon: "🧠", label: "Mental Focus" },
  { key: "cooldown",        icon: "❄️",  label: "Cool-down" },
];

// ── Page component ────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Profile check ───────────────────────────────────────────────────────────
  let profile: PlayerProfile | null = null;
  if (user) {
    const { data } = await supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    profile = data as PlayerProfile | null;
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-8 h-8 text-green-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Complete your profile</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-sm">
          Tell CourtCoach about yourself so we can personalise every training session.
        </p>
        <Link
          href="/onboarding"
          className="bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
        >
          Set up my profile →
        </Link>
      </div>
    );
  }

  // ── Fetch sessions + recommendation in parallel ──────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().slice(0, 10);

  const [sessionsResult, existingRecResult] = await Promise.all([
    supabase
      .from("session_logs")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("daily_recommendations")
      .select("*")
      .eq("user_id", user!.id)
      .eq("recommendation_date", todayStr)
      .maybeSingle(),
  ]);

  const allSessions = (sessionsResult.data as SessionLog[]) ?? [];
  const last14Days = allSessions.filter((s) => s.log_date >= fourteenDaysAgoStr);
  const recent_sessions = allSessions.slice(0, 3);

  // ── Physical status ─────────────────────────────────────────────────────────
  const latestRecovery = allSessions.find((s) => s.log_type === "recovery");
  const physical_status = derivePhysicalStatus(
    latestRecovery ? (latestRecovery.details as RecoveryDetails) : null
  );

  // ── Recommendation (cached or freshly generated) ────────────────────────────
  let recommendation: DailyRecommendation | null =
    existingRecResult.data as DailyRecommendation | null;

  if (!recommendation) {
    try {
      const content = await generateRecommendation(profile, last14Days, todayStr);
      const { data: inserted } = await supabase
        .from("daily_recommendations")
        .upsert(
          { user_id: user!.id, recommendation_date: todayStr, ...content },
          { onConflict: "user_id,recommendation_date" }
        )
        .select()
        .single();
      recommendation = inserted as DailyRecommendation | null;
    } catch (err) {
      console.error("[DashboardPage] recommendation generation error:", err);
      // Render page without recommendation rather than throwing
      recommendation = null;
    }
  }

  // ── Status chip config ──────────────────────────────────────────────────────
  const statusConfig = physicalStatusConfig(physical_status);

  // ── Level labels ────────────────────────────────────────────────────────────
  const levelLabels: Record<string, string> = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    competitive: "Competitive",
    professional: "Professional",
  };

  return (
    <div className="space-y-8">
      {/* ── Welcome banner ── */}
      <section className="rounded-2xl bg-gradient-to-br from-green-900/40 to-slate-900 border border-green-800/30 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-green-400 font-medium mb-1">Welcome back</p>
            <h1 className="text-2xl font-bold text-white">{profile.display_name} 👋</h1>
            <p className="text-slate-400 text-sm mt-1">
              {levelLabels[profile.level] ?? profile.level} player &bull; Available{" "}
              {profile.available_days.join(", ")}
            </p>
          </div>
          {/* Physical status chip */}
          <div
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${statusConfig.color}`}
          >
            <span aria-hidden="true">{statusConfig.icon}</span>
            <span>{statusConfig.label}</span>
          </div>
        </div>
      </section>

      {/* ── Today's Recommendation Card ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Today&apos;s Training Plan
          </h2>
          <RefreshButton />
        </div>

        {recommendation ? (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {/* Goal header */}
            <div className="bg-gradient-to-r from-green-900/50 to-slate-900/50 border-b border-slate-800 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">
                    🎯 Session Goal
                  </p>
                  <p className="text-white font-medium leading-snug">
                    {recommendation.session_goal}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500">Duration</p>
                  <p className="text-lg font-bold text-white">
                    {recommendation.estimated_duration_mins}
                    <span className="text-sm font-normal text-slate-400">min</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Sections grid */}
            <div className="divide-y divide-slate-800">
              {REC_SECTIONS.map(({ key, icon, label }) => {
                const value = recommendation![key];
                if (typeof value !== "string" || !value) return null;
                return (
                  <div key={key} className="px-5 py-3.5">
                    <p className="text-xs font-semibold text-slate-400 mb-1">
                      <span aria-hidden="true">{icon} </span>
                      {label}
                    </p>
                    <p className="text-sm text-slate-200 leading-relaxed">{value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center">
            <p className="text-slate-400 text-sm">
              Could not generate today&apos;s recommendation. Try refreshing.
            </p>
          </div>
        )}
      </section>

      {/* ── Quick actions ── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/log-session"
            className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-green-600 py-4 px-3 transition-colors group"
          >
            <span className="text-2xl" aria-hidden="true">📋</span>
            <span className="text-xs font-medium text-slate-300 group-hover:text-green-400 transition-colors text-center">
              Log Session
            </span>
          </Link>
          <Link
            href="/chat"
            className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-green-600 py-4 px-3 transition-colors group"
          >
            <span className="text-2xl" aria-hidden="true">🤖</span>
            <span className="text-xs font-medium text-slate-300 group-hover:text-green-400 transition-colors text-center">
              Ask Coach
            </span>
          </Link>
          <Link
            href="/history"
            className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-green-600 py-4 px-3 transition-colors group"
          >
            <span className="text-2xl" aria-hidden="true">📈</span>
            <span className="text-xs font-medium text-slate-300 group-hover:text-green-400 transition-colors text-center">
              View History
            </span>
          </Link>
        </div>
      </section>

      {/* ── Recent sessions ── */}
      {recent_sessions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Recent Sessions
            </h2>
            <Link
              href="/history"
              className="text-xs text-slate-500 hover:text-green-400 transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {recent_sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 rounded-xl bg-slate-900 border border-slate-800 px-4 py-3"
              >
                <span className="text-lg" aria-hidden="true">
                  {LOG_TYPE_ICONS[session.log_type] ?? "📝"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    {LOG_TYPE_LABELS[session.log_type] ?? session.log_type}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(session.log_date)} &bull; {session.duration_mins} min
                    {session.intensity !== null && ` &bull; Intensity ${session.intensity}/5`}
                  </p>
                </div>
                {session.fatigue !== null && (
                  <span className="text-xs text-slate-500 shrink-0">
                    Fatigue {session.fatigue}/5
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {recent_sessions.length === 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Recent Sessions
          </h2>
          <div className="rounded-xl bg-slate-900 border border-slate-800 border-dashed p-6 text-center">
            <p className="text-slate-500 text-sm">No sessions logged yet.</p>
            <Link
              href="/log-session"
              className="inline-block mt-2 text-xs text-green-500 hover:text-green-400 transition-colors"
            >
              Log your first session →
            </Link>
          </div>
        </section>
      )}

      {/* Profile shortcut */}
      <section className="pt-2">
        <Link
          href="/onboarding"
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          Edit profile →
        </Link>
      </section>
    </div>
  );
}
