"use client";

/**
 * GoogleSignInButton
 *
 * Initiates a Supabase Google OAuth flow that requests the user's profile +
 * email (default) PLUS calendar.readonly, so the app can later pull upcoming
 * matches from Google Calendar.
 *
 * access_type=offline and prompt=consent are required to receive a refresh
 * token from Google on the very first consent screen — without them Google
 * only returns a short-lived access token and we cannot call the Calendar API
 * after the user closes the tab.
 *
 * Visibility:
 *   Rendered only when NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true.
 *   When the env var is absent or false the button is hidden and no error is
 *   thrown (the login page degrades gracefully to magic-link only).
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Evaluated once at module load — safe to use as a compile-time gate.
// Exported so tests can read the resolved value without re-requiring the module.
export const GOOGLE_OAUTH_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

interface GoogleSignInButtonProps {
  /**
   * Override whether Google OAuth is enabled.
   * Defaults to the NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED env var.
   * Exposed for testing only — do not pass in production code.
   */
  enabled?: boolean;
}

export function GoogleSignInButton({
  enabled = GOOGLE_OAUTH_ENABLED,
}: GoogleSignInButtonProps = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Hidden when Google OAuth is not yet configured ────────────────────────
  if (!enabled) {
    return null;
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Request calendar.readonly in addition to the default profile+email
        // scopes that Supabase always adds.
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: {
          // Required for refresh token delivery from Google
          access_type: "offline",
          // Force the consent screen every time so the refresh token is
          // re-issued even when the user has consented before.
          prompt: "consent",
        },
        // Must match the Supabase Auth → Google provider redirect URI and the
        // URI registered in Google Cloud Console.
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
      return;
    }

    // If no error, Supabase redirects the browser to Google's consent page.
    // We leave the loading state active so the button stays disabled during
    // the redirect — the component will unmount once navigation completes.
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-red-400 text-xs text-center">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        aria-label="Sign in with Google"
        className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        {/* Google "G" logo */}
        <GoogleLogo aria-hidden={true} />
        {loading ? "Redirecting to Google…" : "Sign in with Google"}
      </button>
    </div>
  );
}

// ── Google brand logo (SVG) ───────────────────────────────────────────────────

function GoogleLogo({ "aria-hidden": ariaHidden }: { "aria-hidden"?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden={ariaHidden}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5836-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71c-.18-.54-.2827-1.1182-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9574C.3477 6.1732 0 7.5482 0 9s.3477 2.8268.9574 4.0418L3.964 10.71z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4409 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z"
        fill="#EA4335"
      />
    </svg>
  );
}
