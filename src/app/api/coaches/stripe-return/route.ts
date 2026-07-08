/**
 * GET /api/coaches/stripe-return
 *
 * Handles the redirect back from Stripe after a coach completes (or partially
 * completes) the Connect Express onboarding flow.
 *
 * Checks the account's details_submitted flag via the Stripe API.  If true,
 * marks onboarding_complete = true on the coaches row.
 *
 * Always redirects the browser to the dashboard (or an error page) — never
 * returns a raw JSON response, since this is a browser redirect target.
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  // 1. Verify authentication
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (authError || !user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // 2. Fetch the coach row with Stripe account ID
  const { data: coach, error: fetchError } = await serviceClient
    .from("coaches")
    .select("id, stripe_account_id, onboarding_complete")
    .eq("user_id", user.id)
    .single();

  if (fetchError || !coach || !coach.stripe_account_id) {
    return NextResponse.redirect(`${appUrl}/onboarding?stripe_error=no_account`);
  }

  // 3. Verify Stripe account state
  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(
      coach.stripe_account_id as string
    );

    if (account.details_submitted) {
      // Mark onboarding complete
      await serviceClient
        .from("coaches")
        .update({ onboarding_complete: true })
        .eq("id", coach.id);

      return NextResponse.redirect(`${appUrl}/dashboard?onboarding=complete`);
    }

    // Details not yet submitted — send back to onboarding with a message
    return NextResponse.redirect(
      `${appUrl}/onboarding?stripe_incomplete=1`
    );
  } catch {
    return NextResponse.redirect(`${appUrl}/onboarding?stripe_error=retrieve_failed`);
  }
}
