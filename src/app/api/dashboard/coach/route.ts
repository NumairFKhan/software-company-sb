/**
 * GET /api/dashboard/coach
 *
 * Returns all bookings for the authenticated coach, split into upcoming and
 * past, ordered by slot_start ascending within each group.
 *
 * Response shape:
 * {
 *   upcoming: Booking[],   // slot_start > now, status != cancelled
 *   past:     Booking[],   // slot_start <= now or status == completed/cancelled
 *   coachId:  string,
 * }
 *
 * Each booking includes: id, slot_start, slot_end, status, hourly_rate,
 * guest_name, guest_email, player_id, notes, created_at
 * (plus player.full_name when a player account exists).
 *
 * Auth: requires a valid Supabase session cookie (coach only).
 * Data read via service-role client so RLS doesn't block server-side reads.
 */

import { NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Authenticate ─────────────────────────────────────────────────────────
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // ── Resolve coach row ────────────────────────────────────────────────────
  const { data: coach, error: coachError } = await serviceClient
    .from("coaches")
    .select("id, full_name")
    .eq("user_id", user.id)
    .single();

  if (coachError || !coach) {
    return NextResponse.json(
      { error: "Coach profile not found" },
      { status: 404 }
    );
  }

  // ── Fetch all bookings for this coach ─────────────────────────────────────
  const { data: bookings, error: bookingsError } = await serviceClient
    .from("bookings")
    .select(
      "id, slot_start, slot_end, status, hourly_rate, guest_name, guest_email, player_id, notes, created_at"
    )
    .eq("coach_id", coach.id)
    .order("slot_start", { ascending: true });

  if (bookingsError) {
    console.error("[dashboard/coach] bookings query error:", bookingsError.message);
    return NextResponse.json(
      { error: "Failed to load bookings" },
      { status: 500 }
    );
  }

  const allBookings = bookings ?? [];

  // ── Enrich with player full_name where player_id is set ─────────────────
  const playerIds = Array.from(
    new Set(
      allBookings
        .map((b) => b.player_id)
        .filter((id): id is string => id !== null)
    )
  );

  let playerMap: Record<string, string> = {};
  if (playerIds.length > 0) {
    const { data: players } = await serviceClient
      .from("players")
      .select("id, full_name")
      .in("id", playerIds);

    playerMap = Object.fromEntries(
      (players ?? []).map((p) => [p.id, p.full_name])
    );
  }

  // Attach player_name to each booking
  const enriched = allBookings.map((b) => ({
    ...b,
    player_name:
      b.player_id && playerMap[b.player_id]
        ? playerMap[b.player_id]
        : b.guest_name ?? null,
  }));

  // ── Split into upcoming / past ────────────────────────────────────────────
  const now = new Date().toISOString();

  const upcoming = enriched.filter(
    (b) => b.slot_start > now && b.status !== "cancelled"
  );
  const past = enriched
    .filter(
      (b) =>
        b.slot_start <= now ||
        b.status === "completed" ||
        b.status === "cancelled"
    )
    .reverse(); // most recent first for past bookings

  return NextResponse.json({ upcoming, past, coachId: coach.id });
}
