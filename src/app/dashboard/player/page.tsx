/**
 * /dashboard/player — Player lessons dashboard
 *
 * Server Component that:
 *  1. Verifies the player is authenticated.
 *  2. Loads all bookings for the player (by player_id + guest_email match).
 *  3. Renders <PlayerDashboard /> with upcoming and past lessons.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import PlayerDashboard from "./PlayerDashboard";

export const metadata = {
  title: "My Lessons — CourtSide",
};

export const dynamic = "force-dynamic";

interface Booking {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  hourly_rate: number;
  coach_id: string;
  coach_name: string;
  coach_sport: string | null;
  guest_email: string | null;
  notes: string | null;
}

export default async function PlayerDashboardPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login/player");
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // ── Resolve player row ────────────────────────────────────────────────────
  const { data: player } = await serviceClient
    .from("players")
    .select("id, email, full_name")
    .eq("user_id", user.id)
    .single();

  if (!player) {
    // Not a player account — redirect to signup
    redirect("/signup/player");
  }

  // ── Fetch bookings (by player_id + unlinked guest_email) ─────────────────
  const [{ data: byPlayerId }, { data: byGuestEmail }] = await Promise.all([
    serviceClient
      .from("bookings")
      .select(
        "id, coach_id, slot_start, slot_end, status, hourly_rate, guest_email, notes"
      )
      .eq("player_id", player.id)
      .order("slot_start", { ascending: true }),

    serviceClient
      .from("bookings")
      .select(
        "id, coach_id, slot_start, slot_end, status, hourly_rate, guest_email, notes"
      )
      .eq("guest_email", player.email.toLowerCase())
      .is("player_id", null)
      .order("slot_start", { ascending: true }),
  ]);

  // Merge + deduplicate
  const seen = new Set<string>();
  const merged: typeof byPlayerId = [];
  for (const b of [...(byPlayerId ?? []), ...(byGuestEmail ?? [])]) {
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      merged.push(b);
    }
  }
  merged.sort((a, b) =>
    a!.slot_start < b!.slot_start ? -1 : 1
  );

  // Enrich with coach info
  const coachIds = Array.from(new Set(merged.map((b) => b!.coach_id)));
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

  const allBookings: Booking[] = merged.map((b) => ({
    id: b!.id,
    slot_start: b!.slot_start,
    slot_end: b!.slot_end,
    status: b!.status,
    hourly_rate: Number(b!.hourly_rate),
    coach_id: b!.coach_id,
    coach_name: coachMap[b!.coach_id]?.full_name ?? "Unknown coach",
    coach_sport: coachMap[b!.coach_id]?.sport ?? null,
    guest_email: b!.guest_email,
    notes: b!.notes,
  }));

  const now = new Date().toISOString();

  const upcoming = allBookings.filter(
    (b) => b.slot_start > now && b.status !== "cancelled"
  );
  const past = allBookings
    .filter(
      (b) =>
        b.slot_start <= now ||
        b.status === "completed" ||
        b.status === "cancelled"
    )
    .reverse();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Lessons</h1>
            <p className="mt-1 text-sm text-gray-500">
              Hi {player.full_name.split(" ")[0]}! Here are all your CourtSide sessions.
            </p>
          </div>
          <Link
            href="/coaches"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Book a lesson
          </Link>
        </div>

        {/* Dashboard content */}
        <PlayerDashboard upcoming={upcoming} past={past} />
      </div>
    </main>
  );
}
