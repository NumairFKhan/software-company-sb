import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase sends the user back here after they click the magic link.
 * The `code` param is exchanged for a session, then we redirect to either
 * /onboarding (new user) or /dashboard (returning user).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if the user already has a profile
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("player_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        // New user → onboarding; existing user → wherever they were going (or dashboard)
        const destination = profile ? next : "/onboarding";
        return NextResponse.redirect(`${origin}${destination}`);
      }
    }
  }

  // Something went wrong — redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
