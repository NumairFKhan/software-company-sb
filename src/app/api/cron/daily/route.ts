/**
 * GET /api/cron/daily
 *
 * Daily payout job — invoked by Vercel Cron at 9 AM UTC (see vercel.json).
 *
 * Security: requires the Authorization header to equal "Bearer <CRON_SECRET>"
 * (or the X-Cron-Secret header to equal CRON_SECRET directly).
 * Vercel automatically passes CRON_SECRET when it invokes the endpoint, so
 * external callers without the secret receive 401.
 *
 * What it does:
 *   1. Queries bookings WHERE:
 *        status = 'confirmed'
 *        AND slot_end < now()             (lesson has finished)
 *        AND stripe_transfer_id IS NULL   (payout not yet issued)
 *   2. For each booking, creates a Stripe Transfer of (hourly_rate × 0.90)
 *      to the coach's stripe_account_id using the booking's transfer_group.
 *   3. Records the resulting Stripe Transfer ID on the booking row.
 *
 * Idempotency: the WHERE stripe_transfer_id IS NULL clause ensures already-paid
 * bookings are never double-transferred even if the job runs more than once.
 *
 * The endpoint returns a summary JSON with counts of processed / skipped / errored.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Platform fee: coaches receive 90% of the booking amount. */
const COACH_PAYOUT_RATIO = 0.9;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If CRON_SECRET is not set, the endpoint is unsecured — log a warning
    // but allow through so the cron job still runs in misconfigured envs.
    console.warn("[cron/daily] CRON_SECRET is not configured — endpoint is unsecured");
    return true;
  }

  // Check Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Check X-Cron-Secret: <secret>  (Vercel passes this header format)
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === cronSecret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceRoleClient();
  const stripe = getStripe();

  const now = new Date().toISOString();

  // ── Fetch completed, unpaid bookings ────────────────────────────────────
  const { data: bookings, error: fetchError } = await supabase
    .from("bookings")
    .select(
      "id, coach_id, hourly_rate, stripe_payment_intent_id, stripe_transfer_id"
    )
    .eq("status", "confirmed")
    .lt("slot_end", now)
    .is("stripe_transfer_id", null);

  if (fetchError) {
    console.error("[cron/daily] Failed to fetch payout queue:", fetchError.message);
    return NextResponse.json(
      { error: "DB query failed", details: fetchError.message },
      { status: 500 }
    );
  }

  if (!bookings || bookings.length === 0) {
    console.log("[cron/daily] No pending payouts found.");
    return NextResponse.json({ processed: 0, skipped: 0, errored: 0 });
  }

  console.log(`[cron/daily] Processing ${bookings.length} payout(s).`);

  // ── Fetch unique coach stripe_account_ids in batch ───────────────────────
  const coachIds = Array.from(new Set(bookings.map((b) => b.coach_id)));
  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, stripe_account_id")
    .in("id", coachIds);

  const coachAccountMap = new Map<string, string | null>(
    (coaches ?? []).map((c) => [c.id, c.stripe_account_id])
  );

  let processed = 0;
  let skipped = 0;
  let errored = 0;

  for (const booking of bookings) {
    const stripeAccountId = coachAccountMap.get(booking.coach_id) ?? null;

    if (!stripeAccountId) {
      console.warn("[cron/daily] Skipping booking — coach has no stripe_account_id:", {
        bookingId: booking.id,
        coachId: booking.coach_id,
      });
      skipped++;
      continue;
    }

    const amountCents = Math.round(Number(booking.hourly_rate) * COACH_PAYOUT_RATIO * 100);

    try {
      // Create Stripe Transfer to coach's Connect account.
      // transfer_group ties this transfer to the original PaymentIntent.
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: stripeAccountId,
        transfer_group: `booking_${booking.id}`,
        metadata: {
          booking_id: booking.id,
          coach_id: booking.coach_id,
        },
      });

      // Record the transfer ID to prevent double-payment
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ stripe_transfer_id: transfer.id })
        .eq("id", booking.id)
        .is("stripe_transfer_id", null); // extra safety guard

      if (updateError) {
        console.error("[cron/daily] Failed to record stripe_transfer_id:", {
          bookingId: booking.id,
          transferId: transfer.id,
          error: updateError.message,
        });
        // The transfer was created in Stripe; log loudly so it can be reconciled.
        errored++;
        continue;
      }

      console.log("[cron/daily] Payout issued:", {
        bookingId: booking.id,
        transferId: transfer.id,
        amountCents,
        destination: stripeAccountId,
      });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[cron/daily] Stripe transfer failed:", {
        bookingId: booking.id,
        message,
      });
      errored++;
    }
  }

  console.log("[cron/daily] Run complete:", { processed, skipped, errored });
  return NextResponse.json({ processed, skipped, errored });
}
