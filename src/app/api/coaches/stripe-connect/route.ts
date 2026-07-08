/**
 * GET /api/coaches/stripe-connect
 *
 * Creates (or reuses) a Stripe Express account for the authenticated coach,
 * then generates an Account Link and redirects the browser to Stripe's
 * hosted onboarding flow.
 *
 * Returns 401 when the request is unauthenticated.
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

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // 2. Fetch the coach row
  const { data: coach, error: fetchError } = await serviceClient
    .from("coaches")
    .select("id, email, full_name, stripe_account_id")
    .eq("user_id", user.id)
    .single();

  if (fetchError || !coach) {
    return NextResponse.json(
      { error: "Coach profile not found" },
      { status: 404 }
    );
  }

  const stripe = getStripe();

  // 3. Create or reuse a Stripe Express account
  let stripeAccountId = coach.stripe_account_id as string | null;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: coach.email,
      metadata: { coach_id: coach.id, user_id: user.id },
    });
    stripeAccountId = account.id;

    // Persist the Stripe account ID immediately
    const { error: saveErr } = await serviceClient
      .from("coaches")
      .update({ stripe_account_id: stripeAccountId })
      .eq("id", coach.id);

    if (saveErr) {
      return NextResponse.json(
        { error: "Failed to save Stripe account ID" },
        { status: 500 }
      );
    }
  }

  // 4. Build return / refresh URLs
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl  = `${appUrl}/api/coaches/stripe-return`;
  const refreshUrl = `${appUrl}/api/coaches/stripe-connect`;

  // 5. Create the Account Link
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  // 6. Redirect the coach to Stripe's hosted onboarding
  return NextResponse.redirect(accountLink.url);
}
