import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-green-400 text-lg shrink-0 mr-auto"
            aria-label="CourtCoach AI home"
          >
            {/* Tennis ball icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" className="text-green-500" />
              <path
                d="M2 12a10 10 0 0 0 7.07 9.53A10 10 0 0 0 9.07 2.47 10 10 0 0 0 2 12z"
                fill="white"
                opacity="0.2"
              />
              <path
                d="M22 12a10 10 0 0 0-7.07-9.53A10 10 0 0 0 14.93 21.53 10 10 0 0 0 22 12z"
                fill="white"
                opacity="0.2"
              />
            </svg>
            CourtCoach
          </Link>

          {/* Nav links */}
          <Link
            href="/log-session"
            className="text-sm text-slate-300 hover:text-green-400 transition-colors hidden sm:block"
          >
            Log Session
          </Link>
          <Link
            href="/ask-coach"
            className="text-sm text-slate-300 hover:text-green-400 transition-colors hidden sm:block"
          >
            Ask Coach
          </Link>
          <Link
            href="/history"
            className="text-sm text-slate-300 hover:text-green-400 transition-colors hidden sm:block"
          >
            History
          </Link>

          {/* Sign out */}
          <SignOutButton />
        </nav>

        {/* Mobile bottom bar */}
        <div className="sm:hidden flex border-t border-slate-800">
          <Link
            href="/log-session"
            className="flex-1 py-2 text-center text-xs text-slate-400 hover:text-green-400 transition-colors"
          >
            Log Session
          </Link>
          <Link
            href="/ask-coach"
            className="flex-1 py-2 text-center text-xs text-slate-400 hover:text-green-400 transition-colors"
          >
            Ask Coach
          </Link>
          <Link
            href="/history"
            className="flex-1 py-2 text-center text-xs text-slate-400 hover:text-green-400 transition-colors"
          >
            History
          </Link>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} CourtCoach AI
      </footer>
    </div>
  );
}
