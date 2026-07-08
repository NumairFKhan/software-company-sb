/**
 * GET /api/dashboard/player
 *
 * Returns all bookings for the authenticated player, split into upcoming and
 * past, ordered by slot_start ascending within each group.
 *
 * Matching strategy:
 *   1. By player_id — bookings created after the player made an account.
 *   2. By guest_email — guest bookings with the same email (made before
 *      account creation, or via the guest checkout flow).
 *
 * Response shape:
 * {
 *   upcoming: BookingWithCoach[],
 *   past:     BookingWithCoach[],
 *   playerId: string,
 * }
 *
 * Each booking includes: id, slot_start, slot_end, status, hourly_rate,
 * guest_name, coach_id, notes, created_at, plus coach.full_name, coach.sport.
 *
 * Auth: requires a valid Supabase session cookie (player only).
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

  // ── Resolve player row ───────────────────────────────────────────────────
  const { data: player, error: playerError } = await serviceClient
    .from("players")
    .select("id, email, full_name")
    .eq("user_id", user.id)
    .single();

  if (playerError || !player) {
    return NextResponse.json(
      { error: "Player profile not found" },
      { status: 404 }
    );
  }

  // ── Fetch bookings by player_id ──────────────────────────────────────────
  const { data: byPlayerId } = await serviceClient
    .from("bookings")
    .select(
      "id, coach_id, slot_start, slot_end, status, hourly_rate, guest_name, guest_email, notes, created_at"
    )
    .eq("player_id", player.id)
    .order("slot_start", { ascending: true });

  // ── Fetch bookings by guest_email (not yet linked to player_id) ──────────
  const { data: byGuestEmail } = await serviceClient
    .from("bookings")
    .select(
      "id, coach_id, slot_start, slot_end, status, hourly_rate, guest_name, guest_email, notes, created_at"
    )
    .eq("guest_email", player.email.toLowerCase())
    .is("player_id", null)
    .order("slot_start", { ascending: true });

  // ── Merge + deduplicate ───────────────────────────────────────────────────
  const seen = new Set<string>();
  const allBookings: typeof byPlayerId = [];

  for (const b of [...(byPlayerId ?? []), ...(byGuestEmail ?? [])]) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      allBookings.push(b);
    }
  }

  // Sort merged list by slot_start ascending
  allBookings.sort((a, b) =>
    a.slot_start < b.slot_start ? -1 : a.slot_start > b.slot_start ? 1 : 0
  );

  // ── Enrich with coach info ────────────────────────────────────────────────
  const coachIds = Array.from(new Set(allBookings.map((b) => b.coach_id)));

  let coachMap: Record<string, { full_name: string; sport: string | null }> = {};
  if (coachIds.length > 0) {
    const { data: coaches } = await serviceClient
      .from("coaches")
      .select("id, full_name, sport")
      .in("id", coachIds);

    coachMap = Object.fromEntries(
      (coaches ?? []).map((c) => [c.id, { full_name: c.full_name, sport: c.sport }])
    );
  }

  const enriched = allBookings.map((b) => ({
    ...b,
    coach_name: coachMap[b.coach_id]?.full_name ?? "Unknown coach",
    coach_sport: coachMap[b.coach_id]?.sport ?? null,
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

  return NextResponse.json({ upcoming, past, playerId: player.id });
}
