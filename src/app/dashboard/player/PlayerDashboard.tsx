"use client";

/**
 * PlayerDashboard — Client component for the player's lesson view.
 *
 * Renders upcoming and past bookings with:
 *   - Coach name, sport, date/time
 *   - Status badge
 *   - Cancel button (upcoming, non-cancelled bookings only)
 *
 * Cancel flow: POST /api/bookings/[id]/cancel with credentials:"include"
 * so the auth cookie is sent.  On success the UI is updated optimistically.
 */

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  hourly_rate: number;
  coach_name: string;
  coach_sport: string | null;
  guest_email: string | null;
  notes: string | null;
}

interface Props {
  upcoming: Booking[];
  past: Booking[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { date, time };
}

function statusBadge(status: string): string {
  switch (status) {
    case "confirmed":  return "bg-blue-100 text-blue-700";
    case "pending":    return "bg-yellow-100 text-yellow-700";
    case "cancelled":  return "bg-gray-100 text-gray-500";
    case "completed":  return "bg-green-100 text-green-700";
    default:           return "bg-gray-100 text-gray-600";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerDashboard({ upcoming: initial, past }: Props) {
  // Track live statuses for upcoming bookings (for optimistic cancel)
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((b) => [b.id, b.status]))
  );
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleCancel(bookingId: string) {
    if (cancelling.has(bookingId)) return;

    setCancelling((prev) => new Set(prev).add(bookingId));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[bookingId];
      return next;
    });

    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.ok && data.cancelled) {
        setStatuses((prev) => ({ ...prev, [bookingId]: "cancelled" }));
      } else {
        setErrors((prev) => ({
          ...prev,
          [bookingId]: data.error ?? "Failed to cancel. Please try again.",
        }));
      }
    } catch {
      setErrors((prev) => ({
        ...prev,
        [bookingId]: "Network error. Please try again.",
      }));
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  }

  const liveUpcoming = initial.filter((b) => statuses[b.id] !== "cancelled");
  const liveCancelled = initial.filter((b) => statuses[b.id] === "cancelled");
  const allPast = [
    ...liveCancelled.map((b) => ({ ...b, status: "cancelled" as const })),
    ...past,
  ].sort((a, b) => (a.slot_start < b.slot_start ? 1 : -1));

  return (
    <div>
      {/* ── Upcoming ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Upcoming lessons ({liveUpcoming.length})
        </h2>

        {liveUpcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
            No upcoming lessons.{" "}
            <a href="/coaches" className="text-blue-600 hover:underline">
              Browse coaches
            </a>{" "}
            to book your next session.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {liveUpcoming.map((b) => {
              const currentStatus = statuses[b.id] ?? b.status;
              const isCancelling = cancelling.has(b.id);
              const canCancel =
                currentStatus !== "cancelled" && currentStatus !== "completed";
              const { date, time } = formatDateTime(b.slot_start);

              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          {b.coach_name}
                        </span>
                        {b.coach_sport && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {b.coach_sport}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(currentStatus)}`}
                        >
                          {currentStatus}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm text-gray-600">{date}</div>
                      <div className="text-sm text-gray-500">{time}</div>
                      <div className="mt-1 text-sm font-medium text-gray-700">
                        ${Number(b.hourly_rate).toFixed(0)}/hr
                      </div>
                      {b.notes && (
                        <p className="mt-1 text-xs italic text-gray-400">
                          &ldquo;{b.notes}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Cancel button */}
                    {canCancel && (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => handleCancel(b.id)}
                          disabled={isCancelling}
                          className={`rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 ${
                            isCancelling ? "cursor-wait" : ""
                          }`}
                        >
                          {isCancelling ? "Cancelling…" : "Cancel booking"}
                        </button>
                        <span className="text-[11px] text-gray-400">
                          Free if &gt;24 hrs away
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Error */}
                  {errors[b.id] && (
                    <p className="mt-2 text-xs text-red-600">{errors[b.id]}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Past / Cancelled ─────────────────────────────────────────────── */}
      {allPast.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Past &amp; cancelled ({allPast.length})
          </h2>
          <div className="flex flex-col gap-3">
            {allPast.slice(0, 10).map((b) => {
              const { date, time } = formatDateTime(b.slot_start);
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-5 py-3 opacity-70 shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800">{b.coach_name}</span>
                      {b.coach_sport && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {b.coach_sport}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {date} · {time}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(b.status)}`}
                  >
                    {b.status}
                  </span>
                </div>
              );
            })}
            {allPast.length > 10 && (
              <p className="text-center text-xs text-gray-400">
                Showing 10 of {allPast.length} past sessions.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
