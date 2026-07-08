"use client";

/**
 * CoachCalendar — Day/Week toggle view for the coach bookings dashboard.
 *
 * Props:
 *   upcoming  — future non-cancelled bookings ordered by slot_start
 *   past      — past/cancelled bookings ordered most-recent-first
 *
 * View modes:
 *   week — 7-column CSS grid showing the current week.  Each day shows booked
 *           sessions as coloured cards (blue=confirmed, yellow=pending,
 *           grey=cancelled).  Click a day to switch to day view.
 *   day  — Single-day detail list; navigate with prev/next arrows.
 */

import { useState, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface Props {
  upcoming: Booking[];
  past: Booking[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function isoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatSlotRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "confirmed":  return "bg-blue-100 text-blue-800";
    case "pending":    return "bg-yellow-100 text-yellow-800";
    case "cancelled":  return "bg-gray-100 text-gray-500 line-through";
    case "completed":  return "bg-green-100 text-green-800";
    default:           return "bg-gray-100 text-gray-600";
  }
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoachCalendar({ upcoming, past }: Props) {
  const allBookings = useMemo(
    () => [...upcoming, ...past],
    [upcoming, past]
  );

  // Build a map: "YYYY-MM-DD" → Booking[]
  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const b of allBookings) {
      const key = isoDateStr(new Date(b.slot_start));
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [allBookings]);

  // View state
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView] = useState<"week" | "day">("week");
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  // ── Week view ──────────────────────────────────────────────────────────────
  const weekStart = useMemo(() => {
    const d = startOfWeek(today);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDays: Date[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    const end = weekDays[6];
    const startM = MONTH_NAMES[weekStart.getMonth()];
    const endM   = MONTH_NAMES[end.getMonth()];
    if (startM === endM) {
      return `${startM} ${weekStart.getDate()}–${end.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${startM} ${weekStart.getDate()} – ${endM} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekStart, weekDays]);

  function openDay(d: Date) {
    setSelectedDate(d);
    setView("day");
  }

  // ── Day view ──────────────────────────────────────────────────────────────
  const dayKey = isoDateStr(selectedDate);
  const dayBookings = bookingsByDate[dayKey] ?? [];

  const dayLabel = `${DAY_FULL[selectedDate.getDay()]}, ${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  function prevDay() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  }
  function nextDay() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toggle + navigation bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Week/Day toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
          <button
            onClick={() => setView("week")}
            className={`px-4 py-1.5 transition-colors ${
              view === "week"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView("day")}
            className={`px-4 py-1.5 transition-colors ${
              view === "day"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Day
          </button>
        </div>

        {/* Navigation */}
        {view === "week" ? (
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setWeekOffset((n) => n - 1)}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
              aria-label="Previous week"
            >
              ‹
            </button>
            <span className="font-medium text-gray-700">{weekLabel}</span>
            <button
              onClick={() => setWeekOffset((n) => n + 1)}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
              aria-label="Next week"
            >
              ›
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="ml-1 text-xs text-blue-600 hover:underline"
              >
                Today
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={prevDay}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
              aria-label="Previous day"
            >
              ‹
            </button>
            <span className="font-medium text-gray-700">{dayLabel}</span>
            <button
              onClick={nextDay}
              className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
              aria-label="Next day"
            >
              ›
            </button>
            <button
              onClick={() => setSelectedDate(today)}
              className="ml-1 text-xs text-blue-600 hover:underline"
            >
              Today
            </button>
          </div>
        )}
      </div>

      {/* ── WEEK VIEW ──────────────────────────────────────────────────────── */}
      {view === "week" && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const key = isoDateStr(day);
            const isToday = key === isoDateStr(today);
            const dayBkgs = bookingsByDate[key] ?? [];
            const nonCancelledCount = dayBkgs.filter(
              (b) => b.status !== "cancelled"
            ).length;

            return (
              <button
                key={key}
                onClick={() => openDay(day)}
                className={`flex min-h-[90px] flex-col rounded-xl border p-2 text-left transition hover:shadow-md ${
                  isToday
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-100 bg-white hover:border-blue-200"
                }`}
              >
                {/* Day label */}
                <div className="mb-1 flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    {DAY_LABELS[day.getDay()]}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isToday ? "text-blue-600" : "text-gray-800"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Booking chips */}
                <div className="flex flex-col gap-0.5">
                  {dayBkgs.slice(0, 3).map((b) => (
                    <span
                      key={b.id}
                      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${statusBadge(b.status)}`}
                    >
                      {formatTime(b.slot_start)}
                      {b.player_name ? ` · ${b.player_name.split(" ")[0]}` : ""}
                    </span>
                  ))}
                  {dayBkgs.length > 3 && (
                    <span className="text-[10px] text-gray-400">
                      +{dayBkgs.length - 3} more
                    </span>
                  )}
                  {dayBkgs.length === 0 && (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>

                {nonCancelledCount > 0 && (
                  <span className="mt-auto text-[10px] font-semibold text-blue-600">
                    {nonCancelledCount} session{nonCancelledCount > 1 ? "s" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── DAY VIEW ───────────────────────────────────────────────────────── */}
      {view === "day" && (
        <div>
          {dayBookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
              No sessions on this day.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {dayBookings
                .slice()
                .sort((a, b) =>
                  a.slot_start < b.slot_start ? -1 : 1
                )
                .map((b) => (
                  <div
                    key={b.id}
                    className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    {/* Time column */}
                    <div className="shrink-0 text-center">
                      <div className="text-sm font-semibold text-gray-800">
                        {formatTime(b.slot_start)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatTime(b.slot_end)}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">
                          {b.player_name ?? "Guest"}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(b.status)}`}
                        >
                          {b.status}
                        </span>
                      </div>

                      {b.guest_email && (
                        <div className="mt-0.5 text-xs text-gray-400 truncate">
                          {b.guest_email}
                        </div>
                      )}

                      <div className="mt-1 text-xs text-gray-500">
                        {formatSlotRange(b.slot_start, b.slot_end)} ·{" "}
                        ${Number(b.hourly_rate).toFixed(0)}/hr
                      </div>

                      {b.notes && (
                        <div className="mt-1 text-xs italic text-gray-400">
                          &ldquo;{b.notes}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
