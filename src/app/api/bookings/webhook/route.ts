/**
 * POST /api/bookings/webhook
 *
 * Stripe webhook endpoint for the booking payment flow.
 * Listens for checkout.session.completed events to:
 *  1. Move the booking status from 'pending' → 'confirmed'.
 *  2. Persist the final stripe_payment_intent_id (in case it wasn't available
 *     at session creation time).
 *  3. Send confirmation emails to the player (guest) and the coach via Resend.
 *
 * Webhook secret: STRIPE_BOOKING_WEBHOOK_SECRET (separate from the coach
 * onboarding webhook at /api/coaches/stripe-webhook).
 *
 * Register this endpoint in the Stripe Dashboard as a separate webhook,
 * listening for: checkout.session.completed
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
  const webhookSecret = process.env.STRIPE_BOOKING_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[bookings/webhook] STRIPE_BOOKING_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig ?? "", webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[bookings/webhook] Signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // ── Handle checkout.session.completed ────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const bookingId = session.metadata?.booking_id;
    if (!bookingId) {
      console.error("[bookings/webhook] checkout.session.completed missing booking_id in metadata");
      // Return 200 to prevent Stripe from retrying an event we can't handle
      return NextResponse.json({ received: true });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

    const supabase = getSupabaseServiceRoleClient();

    // ── 1. Confirm the booking ─────────────────────────────────────────────
    const { data: booking, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      })
      .eq("id", bookingId)
      .eq("status", "pending") // idempotency guard
      .select("id, coach_id, slot_start, slot_end, hourly_rate, guest_name, guest_email")
      .single();

    if (updateError || !booking) {
      // The booking might already be confirmed (idempotent webhook retry) — log but
      // do NOT return 5xx so Stripe doesn't keep retrying.
      console.warn(
        "[bookings/webhook] Could not update booking to confirmed:",
        updateError?.message ?? "no row returned (possibly already confirmed)"
      );
      return NextResponse.json({ received: true });
    }

    // ── 2. Load coach for email notification ──────────────────────────────
    const { data: coach } = await supabase
      .from("coaches")
      .select("full_name, email")
      .eq("id", booking.coach_id)
      .single();

    // ── 3. Send emails ────────────────────────────────────────────────────
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
  }

  return NextResponse.json({ received: true });
}
