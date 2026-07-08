import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { PlayerProfile } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Pick<
    PlayerProfile,
    "display_name" | "level" | "goals" | "available_days"
  > | null = null;

  if (user) {
    const { data } = await supabase
      .from("player_profiles")
      .select("display_name, level, goals, available_days")
      .eq("user_id", user.id)
      .maybeSingle();
    profile = data;
  }

  // If no profile yet, prompt to complete onboarding
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
        <h2 className="text-xl font-bold text-white mb-2">
          Complete your profile
        </h2>
        <p className="text-slate-400 text-sm mb-6 max-w-sm">
          Tell CourtCoach about yourself so we can personalise every training
          session.
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

  const levelLabels: Record<string, string> = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    competitive: "Competitive",
    professional: "Professional",
  };

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section className="rounded-2xl bg-gradient-to-br from-green-900/40 to-slate-900 border border-green-800/30 p-6">
        <p className="text-sm text-green-400 font-medium mb-1">Welcome back</p>
        <h1 className="text-2xl font-bold text-white">
          {profile.display_name} 👋
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {levelLabels[profile.level] ?? profile.level} player &bull; Available{" "}
          {profile.available_days.join(", ")}
        </p>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Quick actions
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              href: "/log-session",
              icon: "📋",
              title: "Log a session",
              desc: "Record today's training",
            },
            {
              href: "/ask-coach",
              icon: "🤖",
              title: "Ask Coach",
              desc: "Get AI-powered advice",
            },
            {
              href: "/history",
              icon: "📈",
              title: "History",
              desc: "Review past sessions",
            },
          ].map(({ href, icon, title, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex items-start gap-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 p-4 transition-colors group"
            >
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="font-medium text-white group-hover:text-green-400 transition-colors text-sm">
                  {title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Goals (if any) */}
      {profile.goals && profile.goals.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Your goals
          </h2>
          <div className="flex flex-wrap gap-2">
            {profile.goals.map((goal: string) => (
              <span
                key={goal}
                className="px-3 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300"
              >
                {goal}
              </span>
            ))}
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
