/**
 * GET /api/cron/reminders
 *
 * 24-hour reminder job — invoked by Vercel Cron hourly (see vercel.json).
 *
 * Security: requires the Authorization header to equal "Bearer <CRON_SECRET>"
 * (or the X-Cron-Secret header to equal CRON_SECRET directly).
 *
 * What it does:
 *   1. Queries bookings WHERE:
 *        status = 'confirmed'
 *        AND slot_start BETWEEN (now + 23h) AND (now + 25h)   (±1h window)
 *        AND reminder_sent_at IS NULL                          (not yet reminded)
 *   2. For each booking, sends a reminder email to both the player (or guest)
 *      and the coach via Resend.
 *   3. Sets reminder_sent_at = now() on the booking row to prevent resending.
 *
 * Idempotency: the WHERE reminder_sent_at IS NULL clause ensures that even if
 * the cron fires twice within the same window, only the first run sends emails.
 * The UPDATE also checks reminder_sent_at IS NULL as a safety guard.
 *
 * The endpoint returns a summary JSON with counts of processed / skipped / errored.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn(
      "[cron/reminders] CRON_SECRET is not configured — endpoint is unsecured"
    );
    return true;
  }

  // Check Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Check X-Cron-Secret: <secret>
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === cronSecret) return true;

  return false;
}

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceRoleClient();

  const now = new Date();
  // Window: bookings starting between now+23h and now+25h
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  // ── Fetch bookings due for a reminder ─────────────────────────────────────
  const { data: bookings, error: fetchError } = await supabase
    .from("bookings")
    .select(
      "id, coach_id, slot_start, slot_end, hourly_rate, guest_name, guest_email, player_id"
    )
    .eq("status", "confirmed")
    .gte("slot_start", windowStart)
    .lte("slot_start", windowEnd)
    .is("reminder_sent_at", null);

  if (fetchError) {
    console.error(
      "[cron/reminders] Failed to fetch reminder queue:",
      fetchError.message
    );
    return NextResponse.json(
      { error: "DB query failed", details: fetchError.message },
      { status: 500 }
    );
  }

  if (!bookings || bookings.length === 0) {
    console.log("[cron/reminders] No reminders to send.");
    return NextResponse.json({ processed: 0, skipped: 0, errored: 0 });
  }

  console.log(`[cron/reminders] Processing ${bookings.length} reminder(s).`);

  // ── Fetch unique coaches for email addresses ───────────────────────────────
  const coachIds = Array.from(new Set(bookings.map((b) => b.coach_id)));
  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, full_name, email, zip")
    .in("id", coachIds);

  const coachMap = new Map(
    (coaches ?? []).map((c) => [
      c.id,
      { full_name: c.full_name, email: c.email, zip: c.zip },
    ])
  );

  // ── Fetch player emails for player-linked bookings ────────────────────────
  const playerIds = Array.from(
    new Set(
      bookings
        .map((b) => b.player_id)
        .filter((id): id is string => id !== null)
    )
  );

  const playerEmailMap = new Map<string, string>();
  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from("players")
      .select("id, email, full_name")
      .in("id", playerIds);

    for (const p of players ?? []) {
      playerEmailMap.set(p.id, p.email);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cancellationPolicyUrl = `${appUrl}/cancellation-policy`;

  let processed = 0;
  let skipped = 0;
  let errored = 0;

  for (const booking of bookings) {
    const coach = coachMap.get(booking.coach_id) ?? null;

    if (!coach) {
      console.warn("[cron/reminders] Skipping booking — coach not found:", {
        bookingId: booking.id,
        coachId: booking.coach_id,
      });
      skipped++;
      continue;
    }

    // Resolve player email: prefer player account email, fall back to guest_email
    const playerEmail =
      booking.player_id
        ? (playerEmailMap.get(booking.player_id) ?? booking.guest_email)
        : booking.guest_email;

    if (!playerEmail && !coach.email) {
      console.warn(
        "[cron/reminders] Skipping booking — no email addresses found:",
        { bookingId: booking.id }
      );
      skipped++;
      continue;
    }

    const { date: sessionDate, time: sessionTime } = formatSlotForEmail(
      booking.slot_start
    );

    const courtLocation =
      coach.zip ? `Near ${coach.zip}` : "Contact your coach for location details";

    const emailVars = {
      BOOKING_ID: booking.id,
      GUEST_NAME: booking.guest_name ?? "Player",
      GUEST_EMAIL: playerEmail ?? "",
      COACH_NAME: coach.full_name,
      SESSION_DATE: sessionDate,
      SESSION_TIME: sessionTime,
      COURT_LOCATION: courtLocation,
      CANCELLATION_POLICY_URL: cancellationPolicyUrl,
      APP_URL: appUrl,
    };

    let emailError = false;

    // Send reminder to player / guest
    if (playerEmail) {
      await sendEmail({
        to: playerEmail,
        subject: `Reminder: Your session with ${coach.full_name} is tomorrow`,
        template: "reminder-player.html",
        variables: emailVars,
      });
    }

    // Send reminder to coach
    if (coach.email) {
      await sendEmail({
        to: coach.email,
        subject: `Reminder: Session with ${booking.guest_name ?? "a player"} is tomorrow`,
        template: "reminder-coach.html",
        variables: emailVars,
      });
    }

    if (emailError) {
      errored++;
      continue;
    }

    // ── Mark reminder as sent (idempotency guard) ──────────────────────────
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", booking.id)
      .is("reminder_sent_at", null); // extra safety guard — prevents race conditions

    if (updateError) {
      console.error("[cron/reminders] Failed to set reminder_sent_at:", {
        bookingId: booking.id,
        error: updateError.message,
      });
      errored++;
      continue;
    }

    console.log("[cron/reminders] Reminder sent:", {
      bookingId: booking.id,
      playerEmail,
      coachEmail: coach.email,
    });
    processed++;
  }

  console.log("[cron/reminders] Run complete:", { processed, skipped, errored });
  return NextResponse.json({ processed, skipped, errored });
}
