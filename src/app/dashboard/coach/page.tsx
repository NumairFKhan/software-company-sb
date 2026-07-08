/**
 * /dashboard/coach — Coach bookings & schedule dashboard
 *
 * Server Component that:
 *  1. Verifies the coach is authenticated.
 *  2. Calls GET /api/dashboard/coach to fetch upcoming + past bookings.
 *  3. Renders <CoachCalendar /> (client component) with the fetched data.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import CoachCalendar from "./CoachCalendar";

export const metadata = {
  title: "My Schedule — CourtSide",
};

export const dynamic = "force-dynamic";

interface Booking {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  hourly_rate: number;
  player_name: string | null;
  guest_email: string | null;
  notes: string | null;
}

export default async function CoachSchedulePage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // ── Resolve coach ─────────────────────────────────────────────────────────
  const { data: coach } = await serviceClient
    .from("coaches")
    .select("id, full_name")
    .eq("user_id", user.id)
    .single();

  if (!coach) {
    redirect("/onboarding");
  }

  // ── Fetch bookings ────────────────────────────────────────────────────────
  const { data: rawBookings } = await serviceClient
    .from("bookings")
    .select(
      "id, slot_start, slot_end, status, hourly_rate, guest_name, guest_email, player_id, notes, created_at"
    )
    .eq("coach_id", coach.id)
    .order("slot_start", { ascending: true });

  const allRaw = rawBookings ?? [];

  // Enrich with player full_name
  const playerIds = Array.from(
    new Set(
      allRaw
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

  const allBookings: Booking[] = allRaw.map((b) => ({
    id: b.id,
    slot_start: b.slot_start,
    slot_end: b.slot_end,
    status: b.status,
    hourly_rate: Number(b.hourly_rate),
    player_name:
      b.player_id && playerMap[b.player_id]
        ? playerMap[b.player_id]
        : b.guest_name ?? null,
    guest_email: b.guest_email,
    notes: b.notes,
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

  // ── Stats ─────────────────────────────────────────────────────────────────
  const confirmedUpcoming = upcoming.filter((b) => b.status === "confirmed");
  const totalRevenue = allBookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((sum, b) => sum + Number(b.hourly_rate), 0);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
            <p className="mt-1 text-sm text-gray-500">
              Welcome back, {coach.full_name.split(" ")[0]}. Here are your upcoming sessions.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            label="Upcoming sessions"
            value={String(confirmedUpcoming.length)}
            accent="blue"
          />
          <StatCard
            label="Past sessions"
            value={String(past.filter((b) => b.status !== "cancelled").length)}
            accent="green"
          />
          <StatCard
            label="Total confirmed revenue"
            value={`$${totalRevenue.toFixed(0)}`}
            accent="purple"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Calendar */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <CoachCalendar upcoming={upcoming} past={past} />
        </div>

        {/* Upcoming list below calendar */}
        {upcoming.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Upcoming sessions ({upcoming.length})
            </h2>
            <div className="flex flex-col gap-3">
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            </div>
          </section>
        )}

        {/* Past list */}
        {past.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Past & cancelled ({past.length})
            </h2>
            <div className="flex flex-col gap-3">
              {past.slice(0, 10).map((b) => (
                <BookingRow key={b.id} booking={b} muted />
              ))}
              {past.length > 10 && (
                <p className="text-center text-xs text-gray-400">
                  Showing 10 of {past.length} past sessions.
                </p>
              )}
            </div>
          </section>
        )}

        {upcoming.length === 0 && past.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
            No bookings yet. Share your{" "}
            <Link href={`/coaches/${coach.id}`} className="text-blue-600 hover:underline">
              public profile
            </Link>{" "}
            to start getting sessions booked.
          </div>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  accent: "blue" | "green" | "purple";
  className?: string;
}) {
  const colours = {
    blue:   "bg-blue-50 text-blue-700",
    green:  "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-xl p-4 ${colours[accent]} ${className}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

function BookingRow({
  booking: b,
  muted = false,
}: {
  booking: Booking;
  muted?: boolean;
}) {
  const d = new Date(b.slot_start);
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const statusColors: Record<string, string> = {
    confirmed:  "bg-blue-100 text-blue-700",
    pending:    "bg-yellow-100 text-yellow-700",
    cancelled:  "bg-gray-100 text-gray-500",
    completed:  "bg-green-100 text-green-700",
  };
  const badgeClass = statusColors[b.status] ?? "bg-gray-100 text-gray-500";

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm ${
        muted ? "opacity-60" : ""
      }`}
    >
      {/* Date/time */}
      <div className="shrink-0 text-sm">
        <div className="font-medium text-gray-800">{dateStr}</div>
        <div className="text-xs text-gray-400">{timeStr}</div>
      </div>

      {/* Player */}
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium text-gray-900">
          {b.player_name ?? "Guest"}
        </div>
        {b.guest_email && (
          <div className="truncate text-xs text-gray-400">{b.guest_email}</div>
        )}
      </div>

      {/* Rate */}
      <div className="shrink-0 text-sm font-semibold text-gray-700">
        ${Number(b.hourly_rate).toFixed(0)}
      </div>

      {/* Status badge */}
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
      >
        {b.status}
      </span>
    </div>
  );
}
