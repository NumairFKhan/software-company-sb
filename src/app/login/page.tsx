import { sendMagicLink } from "./actions";

interface LoginPageProps {
  searchParams: Promise<{ message?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { message, error } = await searchParams;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950">
      {/* Logo / branding */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-9 h-9 text-green-400"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path
              d="M2 12a10 10 0 0 0 7.07 9.53A10 10 0 0 0 9.07 2.47 10 10 0 0 0 2 12z"
              fill="white"
              opacity="0.3"
            />
            <path
              d="M22 12a10 10 0 0 0-7.07-9.53A10 10 0 0 0 14.93 21.53 10 10 0 0 0 22 12z"
              fill="white"
              opacity="0.3"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white">CourtCoach AI</h1>
        <p className="mt-2 text-slate-400 text-sm">
          Your personal AI tennis coach
        </p>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <h2 className="text-xl font-semibold text-white mb-1">Sign in</h2>
        <p className="text-sm text-slate-400 mb-6">
          Enter your email and we&apos;ll send you a magic link — no password
          needed.
        </p>

        {/* Feedback messages */}
        {message && (
          <div
            role="status"
            className="mb-4 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm px-4 py-3"
          >
            {message}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm px-4 py-3"
          >
            {error}
          </div>
        )}

        <form action={sendMagicLink} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            Send magic link
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-slate-600 text-center max-w-xs">
        By signing in you agree to our{" "}
        <a href="#" className="underline hover:text-slate-400">
          Terms
        </a>{" "}
        and{" "}
        <a href="#" className="underline hover:text-slate-400">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
