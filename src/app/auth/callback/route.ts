import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Universal auth callback — handles both magic-link and Google OAuth sign-ins.
 *
 * Both flows use Supabase's PKCE code exchange, so a single `code` param lands
 * here after the user authenticates.  After exchanging the code for a session:
 *
 *  1. If provider tokens are present (Google OAuth), persist them to the
 *     `google_tokens` table.  Supabase does not retain provider_token /
 *     provider_refresh_token across page loads, so we must capture them here.
 *
 *  2. Check whether the user already has a player profile:
 *     • New user  → /onboarding
 *     • Returning → /dashboard (or the `next` query param if set)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // ── 1. Persist Google provider tokens if available ─────────────────────
      // provider_token and provider_refresh_token are only present immediately
      // after a Google OAuth sign-in.  They are absent for magic-link sign-ins.
      const providerToken = sessionData?.session?.provider_token ?? null;
      const providerRefreshToken =
        sessionData?.session?.provider_refresh_token ?? null;

      // ── 2. Determine new-vs-returning user ─────────────────────────────────
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Persist Google tokens (upsert so repeated sign-ins refresh the token)
        if (providerToken) {
          // Non-fatal: log but don't block sign-in if token persistence fails.
          const { error: tokenError } = await supabase
            .from("google_tokens")
            .upsert(
              {
                user_id: user.id,
                access_token: providerToken,
                refresh_token: providerRefreshToken,
              },
              { onConflict: "user_id" }
            );

          if (tokenError) {
            console.error(
              "[auth/callback] Failed to persist Google tokens:",
              tokenError.message
            );
          }
        }

        // Profile check — new user → onboarding, returning → dashboard
        const { data: profile } = await supabase
          .from("player_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        const destination = profile ? next : "/onboarding";
        return NextResponse.redirect(`${origin}${destination}`);
      }
    }
  }

  // Something went wrong — redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
