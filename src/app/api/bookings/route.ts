/**
 * POST /api/bookings
 *
 * Guest checkout booking flow:
 *  1. Rate-limit to 5 requests/min per IP (in-memory, see lib/ratelimit.ts).
 *  2. Validate request body — coachId, slotStart, slotEnd, guestName, guestEmail.
 *  3. Verify the coach exists and has completed onboarding.
 *  4. Atomically check slot availability + insert pending booking via the
 *     create_booking_if_available() Postgres function (BEGIN/COMMIT transaction).
 *  5. Create a Stripe Checkout Session; store the session ID and payment intent ID
 *     on the booking row.
 *  6. Return { bookingId, url } — the client redirects to the Stripe-hosted page.
 *
 * Returns 409 if the slot is already taken, 429 if rate-limited.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Default cancellation policy shown verbatim in the Stripe product description
const CANCELLATION_POLICY =
  "Free cancellation up to 24 hours before your session. No refunds within 24 hours of the start time.";

interface BookingRequestBody {
  coachId: string;
  slotStart: string; // ISO datetime
  slotEnd: string;   // ISO datetime
  guestName: string;
  guestEmail: string;
}

export async function POST(request: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a minute." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // ── Parse & validate request body ─────────────────────────────────────────
  let body: BookingRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { coachId, slotStart, slotEnd, guestName, guestEmail } = body;

  if (!coachId || !slotStart || !slotEnd || !guestName || !guestEmail) {
    return NextResponse.json(
      { error: "Missing required fields: coachId, slotStart, slotEnd, guestName, guestEmail" },
      { status: 400 }
    );
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Slot must be in the future
  const slotStartDate = new Date(slotStart);
  if (isNaN(slotStartDate.getTime())) {
    return NextResponse.json({ error: "Invalid slotStart datetime" }, { status: 400 });
  }
  if (slotStartDate <= new Date()) {
    return NextResponse.json({ error: "Cannot book a slot in the past" }, { status: 400 });
  }

  const slotEndDate = new Date(slotEnd);
  if (isNaN(slotEndDate.getTime()) || slotEndDate <= slotStartDate) {
    return NextResponse.json({ error: "Invalid slotEnd datetime" }, { status: 400 });
  }

  // ── Fetch coach ────────────────────────────────────────────────────────────
  const supabase = getSupabaseServiceRoleClient();

  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("id, full_name, email, hourly_rate, stripe_account_id, sport, onboarding_complete")
    .eq("id", coachId)
    .eq("onboarding_complete", true)
    .single();

  if (coachError || !coach) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }

  if (coach.hourly_rate === null) {
    return NextResponse.json(
      { error: "This coach has not set their hourly rate" },
      { status: 400 }
    );
  }

  // ── Atomic slot check + booking insert (stored procedure) ─────────────────
  // The RPC wraps the conflict check + INSERT inside a BEGIN/COMMIT transaction
  // and handles concurrent unique_violation races.
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "create_booking_if_available",
    {
      p_coach_id: coachId,
      p_slot_start: slotStart,
      p_slot_end: slotEnd,
      p_hourly_rate: Number(coach.hourly_rate),
      p_guest_name: guestName.trim(),
      p_guest_email: guestEmail.trim().toLowerCase(),
    }
  );

  if (rpcError) {
    console.error("[POST /api/bookings] RPC error:", rpcError);
    return NextResponse.json(
      { error: "Failed to reserve slot" },
      { status: 500 }
    );
  }

  const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

  if (!result || result.conflict === true) {
    return NextResponse.json(
      { error: "This time slot is no longer available. Please choose another." },
      { status: 409 }
    );
  }

  const bookingId: string = result.booking_id;

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const sportLabel = coach.sport ? `${coach.sport} ` : "";
  const productName = `1-hour ${sportLabel}session with ${coach.full_name}`;
  const unitAmountCents = Math.round(Number(coach.hourly_rate) * 100);

  let checkoutSession: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              description: `Cancellation policy: ${CANCELLATION_POLICY}`,
            },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        },
      ],
      customer_email: guestEmail.trim().toLowerCase(),
      success_url: `${appUrl}/booking/${bookingId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/coaches/${coachId}`,
      payment_intent_data: {
        // transfer_group links this charge to the coach's booking for the later
        // payout to their Stripe Connect account (handled in a subsequent ticket).
        transfer_group: `booking_${bookingId}`,
      },
      metadata: {
        booking_id: bookingId,
        coach_id: coachId,
      },
    });
  } catch (stripeErr) {
    console.error("[POST /api/bookings] Stripe error:", stripeErr);
    // Leave booking as 'pending' — it will remain unclaimed and can be cleaned
    // up by a scheduled job. Do not expose Stripe error details to the client.
    return NextResponse.json(
      { error: "Failed to create payment session. Please try again." },
      { status: 500 }
    );
  }

  // ── Persist Stripe IDs onto the booking row ────────────────────────────────
  // payment_intent is created immediately by Stripe for payment-mode sessions.
  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : (checkoutSession.payment_intent as { id?: string } | null)?.id ?? null;

  await supabase
    .from("bookings")
    .update({
      stripe_checkout_session_id: checkoutSession.id,
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", bookingId);

  return NextResponse.json(
    { bookingId, url: checkoutSession.url },
    { status: 201 }
  );
}
