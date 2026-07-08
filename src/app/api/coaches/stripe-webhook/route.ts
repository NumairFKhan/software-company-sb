/**
 * POST /api/coaches/stripe-webhook
 *
 * Receives Stripe webhook events.  Specifically handles the `account.updated`
 * event to mark a coach's onboarding as complete once Stripe reports that
 * charges are enabled on their Express account.
 *
 * Stripe signature verification is always enforced when STRIPE_WEBHOOK_SECRET
 * is set in the environment.
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Stripe requires the raw body for signature verification — do not parse JSON.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  let event: ReturnType<typeof stripe.webhooks.constructEvent>;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? "", webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // Handle account.updated — fires when Stripe processes KYC
  if (event.type === "account.updated") {
    const account = event.data.object as {
      id: string;
      charges_enabled: boolean;
    };

    if (account.charges_enabled) {
      const serviceClient = getSupabaseServiceRoleClient();

      const { error } = await serviceClient
        .from("coaches")
        .update({ onboarding_complete: true })
        .eq("stripe_account_id", account.id);

      if (error) {
        // Return 500 so Stripe retries the webhook
        return NextResponse.json(
          { error: "DB update failed" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
