/**
 * POST /api/bookings/[id]/cancel
 *
 * Cancels a confirmed (or pending) booking and handles the refund:
 *
 *   > 24 hrs before slot_start:
 *     • Issues a full Stripe Refund via the stripe_payment_intent_id.
 *     • Updates booking status → cancelled.
 *     • Emails both player and coach with refund confirmation.
 *
 *   ≤ 24 hrs before slot_start:
 *     • No refund issued (per cancellation policy).
 *     • Updates booking status → cancelled.
 *     • Emails both player and coach noting no refund.
 *
 * Request body:
 *   { guestEmail: string }   — required for guest bookings to verify ownership
 *
 * Idempotency: if the booking is already cancelled, returns 200 immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const bookingId = params.id;

  // ── Parse request body ───────────────────────────────────────────────────
  let body: { guestEmail?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional; allow empty JSON bodies
  }

  const supabase = getSupabaseServiceRoleClient();

  // ── Fetch booking ────────────────────────────────────────────────────────
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select(
      "id, coach_id, slot_start, slot_end, status, hourly_rate, guest_name, guest_email, stripe_payment_intent_id"
    )
    .eq("id", bookingId)
    .single();

  if (fetchError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // ── Idempotency: already cancelled ───────────────────────────────────────
  if (booking.status === "cancelled") {
    return NextResponse.json({ cancelled: true, refunded: false, message: "Already cancelled" });
  }

  // ── Verify guest email ownership (for guest bookings) ────────────────────
  if (booking.guest_email) {
    const providedEmail = body.guestEmail?.trim().toLowerCase();
    const expectedEmail = booking.guest_email.toLowerCase();
    if (!providedEmail || providedEmail !== expectedEmail) {
      return NextResponse.json(
        { error: "Provide the email address used when booking to cancel." },
        { status: 403 }
      );
    }
  }

  // ── Determine refund eligibility ──────────────────────────────────────────
  const now = Date.now();
  const slotStart = new Date(booking.slot_start).getTime();
  const isEligibleForRefund = slotStart - now > TWENTY_FOUR_HOURS_MS;

  let refundIssued = false;
  let refundError: string | null = null;

  if (isEligibleForRefund && booking.stripe_payment_intent_id) {
    // ── Issue full Stripe Refund ───────────────────────────────────────────
    const stripe = getStripe();
    try {
      await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        // No amount specified → full refund
      });
      refundIssued = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[bookings/cancel] Stripe refund failed:", { bookingId, message });
      refundError = message;
      // Continue to mark cancelled even if refund fails; log for manual resolution.
    }
  }

  // ── Mark booking as cancelled ─────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (updateError) {
    console.error("[bookings/cancel] DB update failed:", updateError.message);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 }
    );
  }

  // ── Load coach for emails ─────────────────────────────────────────────────
  const { data: coach } = await supabase
    .from("coaches")
    .select("full_name, email")
    .eq("id", booking.coach_id)
    .single();

  // ── Send cancellation emails ──────────────────────────────────────────────
  const { date: sessionDate, time: sessionTime } = formatSlotForEmail(
    booking.slot_start
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const refundNote = isEligibleForRefund
    ? "A full refund has been issued to your original payment method. Please allow 5–10 business days for it to appear."
    : "Per our cancellation policy, sessions cancelled within 24 hours of the start time are not eligible for a refund.";

  const emailVars = {
    BOOKING_ID: booking.id,
    GUEST_NAME: booking.guest_name ?? "Player",
    GUEST_EMAIL: booking.guest_email ?? "",
    COACH_NAME: coach?.full_name ?? "your coach",
    SESSION_DATE: sessionDate,
    SESSION_TIME: sessionTime,
    REFUND_NOTE: refundNote,
    APP_URL: appUrl,
  };

  // Player cancellation email
  if (booking.guest_email) {
    await sendEmail({
      to: booking.guest_email,
      subject: `Your session on ${sessionDate} has been cancelled`,
      template: "cancellation-player.html",
      variables: emailVars,
    });
  }

  // Coach cancellation email
  if (coach?.email) {
    await sendEmail({
      to: coach.email,
      subject: `Booking cancelled: ${booking.guest_name ?? "A player"} on ${sessionDate}`,
      template: "cancellation-coach.html",
      variables: emailVars,
    });
  }

  console.log("[bookings/cancel] Booking cancelled:", {
    bookingId,
    refundIssued,
    isEligibleForRefund,
    refundError,
  });

  return NextResponse.json({
    cancelled: true,
    refunded: refundIssued,
    eligibleForRefund: isEligibleForRefund,
    ...(refundError ? { refundError } : {}),
  });
}
