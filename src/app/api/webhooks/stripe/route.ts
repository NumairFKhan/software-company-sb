/**
 * POST /api/webhooks/stripe
 *
 * Unified Stripe webhook handler.
 *
 * Security: verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET
 * using stripe.webhooks.constructEvent(). Returns 400 on invalid signatures.
 *
 * Events handled:
 *   checkout.session.completed — confirms a pending booking, persists
 *   stripe_payment_intent_id, and sends confirmation emails to both
 *   the player (guest) and the coach via Resend.
 *
 * Idempotency: the UPDATE uses .eq("status", "pending") so re-delivering the
 * same event for an already-confirmed booking is a no-op.
 *
 * All events are logged (event id, type, outcome) to structured console output.
 *
 * Register this URL in the Stripe Dashboard as a webhook endpoint listening
 * for: checkout.session.completed
 */

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";
import type Stripe from "stripe";

// Stripe requires the raw request body for signature verification.
export const dynamic = "force-dynamic";

/** Format a slot_start ISO string into human-readable date and time strings. */
function formatSlotForEmail(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { date, time };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  // ── Signature verification ────────────────────────────────────────────────
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? "", webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[webhooks/stripe] Signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // ── Structured event logging ──────────────────────────────────────────────
  const logCtx = { event_id: event.id, event_type: event.type };
  console.log("[webhooks/stripe] Received event:", logCtx);

  let outcome = "unhandled";

  try {
    // ── Handle checkout.session.completed ─────────────────────────────────
    if (event.type === "checkout.session.completed") {
      outcome = await handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhooks/stripe] Handler threw:", { ...logCtx, message });
    // Return 500 so Stripe retries the event.
    return NextResponse.json({ error: "Internal handler error" }, { status: 500 });
  }

  console.log("[webhooks/stripe] Processed event:", { ...logCtx, outcome });
  return NextResponse.json({ received: true, outcome });
}

// ── Handler: checkout.session.completed ──────────────────────────────────────

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<string> {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) {
    console.warn(
      "[webhooks/stripe] checkout.session.completed missing booking_id in metadata — skipping"
    );
    return "skipped_no_booking_id";
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  const supabase = getSupabaseServiceRoleClient();

  // ── 1. Confirm the booking (idempotency: only update pending rows) ────────
  const { data: booking, error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    })
    .eq("id", bookingId)
    .eq("status", "pending") // idempotency guard — skip already-confirmed bookings
    .select(
      "id, coach_id, slot_start, slot_end, hourly_rate, guest_name, guest_email"
    )
    .single();

  if (updateError || !booking) {
    // Either already confirmed (idempotent retry) or booking not found.
    console.warn(
      "[webhooks/stripe] Could not update booking to confirmed:",
      updateError?.message ?? "no pending row found (possibly already confirmed)"
    );
    return "skipped_already_confirmed_or_not_found";
  }

  // ── 2. Load coach for email notification ──────────────────────────────────
  const { data: coach } = await supabase
    .from("coaches")
    .select("full_name, email")
    .eq("id", booking.coach_id)
    .single();

  // ── 3. Send confirmation emails ───────────────────────────────────────────
  const { date: sessionDate, time: sessionTime } = formatSlotForEmail(
    booking.slot_start
  );
  const amountPaid = `$${Number(booking.hourly_rate).toFixed(2)}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const emailVars = {
    BOOKING_ID: booking.id,
    GUEST_NAME: booking.guest_name ?? "Player",
    GUEST_EMAIL: booking.guest_email ?? "",
    COACH_NAME: coach?.full_name ?? "your coach",
    SESSION_DATE: sessionDate,
    SESSION_TIME: sessionTime,
    AMOUNT_PAID: amountPaid,
    APP_URL: appUrl,
  };

  // Player confirmation
  if (booking.guest_email) {
    await sendEmail({
      to: booking.guest_email,
      subject: `Your session with ${coach?.full_name ?? "your coach"} is confirmed!`,
      template: "booking-player.html",
      variables: emailVars,
    });
  }

  // Coach notification
  if (coach?.email) {
    await sendEmail({
      to: coach.email,
      subject: `New booking: ${booking.guest_name ?? "A player"} on ${sessionDate}`,
      template: "booking-coach.html",
      variables: emailVars,
    });
  }

  return "confirmed";
}
