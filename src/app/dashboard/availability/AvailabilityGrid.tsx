"use client";

/**
 * AvailabilityGrid — interactive 7-day × 14-hour toggle grid.
 *
 * Columns  = days of week (Sun–Sat)
 * Rows     = 1-hour blocks from 7 AM to 9 PM (14 slots)
 *
 * Clicking a cell toggles it available / unavailable.
 * Pressing "Save availability" PUTs the full grid to the API.
 */

import { useState } from "react";
import type { RecurringSlot } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DAYS = [
  { label: "Sun", short: "Su" },
  { label: "Mon", short: "Mo" },
  { label: "Tue", short: "Tu" },
  { label: "Wed", short: "We" },
  { label: "Thu", short: "Th" },
  { label: "Fri", short: "Fr" },
  { label: "Sat", short: "Sa" },
] as const;

export const HOURS: Array<{ label: string; start: string; end: string }> =
  Array.from({ length: 14 }, (_, i) => {
    const hour = 7 + i; // 7 … 20
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = `${String(hour + 1).padStart(2, "0")}:00`;
    const period = hour < 12 ? "AM" : "PM";
    const h12 = hour === 12 ? 12 : hour > 12 ? hour - 12 : hour;
    return { label: `${h12} ${period}`, start, end };
  });

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  coachId: string;
  initialSlots: RecurringSlot[];
}

/** Slot key format: "dayIndex|HH:MM" — e.g. "1|08:00" for Mon 8 AM */
function toKey(day: number, start: string) {
  return `${day}|${start}`;
}

export default function AvailabilityGrid({ coachId, initialSlots }: Props) {
  // Build the initial selection set from existing recurring slots
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        initialSlots
          .filter((s) => s.start_time !== null)
          .map((s) => toKey(s.day_of_week, s.start_time))
      )
  );

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Toggle a cell ---
  function toggle(dayIndex: number, hour: (typeof HOURS)[number]) {
    const key = toKey(dayIndex, hour.start);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    // Clear any stale status when the user starts editing again
    if (saveStatus !== "idle") setSaveStatus("idle");
  }

  // --- Save to API ---
  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    setErrorMsg(null);

    const slots = Array.from(selected).map((key) => {
      const [dayStr, startTime] = key.split("|");
      const dayIndex = parseInt(dayStr, 10);
      const hour = HOURS.find((h) => h.start === startTime);
      return {
        day_of_week: dayIndex,
        start_time: startTime,
        end_time: hour ? hour.end : startTime, // fallback — should always match
      };
    });

    try {
      const res = await fetch(`/api/coaches/${coachId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }

      setSaveStatus("success");
    } catch (err) {
      setSaveStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <div data-testid="availability-grid">
      {/* ------------------------------------------------------------------ */}
      {/* Legend */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-blue-500" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-gray-200 bg-gray-100" />
          Unavailable
        </span>
        <span className="ml-auto text-gray-400">
          {selectedCount} slot{selectedCount !== 1 ? "s" : ""} selected
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Grid */}
      {/* ------------------------------------------------------------------ */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              {/* Time label column header */}
              <th className="w-16 px-2 py-2 text-left text-xs font-medium text-gray-400" />
              {DAYS.map((day) => (
                <th
                  key={day.label}
                  scope="col"
                  className="px-1 py-2 text-center text-xs font-semibold text-gray-600"
                >
                  <span className="hidden sm:inline">{day.label}</span>
                  <span className="sm:hidden">{day.short}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {HOURS.map((hour, hourIdx) => (
              <tr
                key={hour.start}
                className={
                  hourIdx < HOURS.length - 1 ? "border-b border-gray-50" : ""
                }
              >
                {/* Time label */}
                <td className="px-2 py-0.5 text-right text-xs text-gray-400 whitespace-nowrap">
                  {hour.label}
                </td>

                {/* Day cells */}
                {DAYS.map((day, dayIdx) => {
                  const key = toKey(dayIdx, hour.start);
                  const isActive = selected.has(key);
                  return (
                    <td key={day.label} className="px-0.5 py-0.5">
                      <button
                        type="button"
                        onClick={() => toggle(dayIdx, hour)}
                        aria-label={`${day.label} ${hour.label}: ${isActive ? "available — click to remove" : "unavailable — click to add"}`}
                        aria-pressed={isActive}
                        data-testid={`cell-${dayIdx}-${hour.start}`}
                        className={`h-8 w-full rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
                          isActive
                            ? "bg-blue-500 hover:bg-blue-600"
                            : "bg-gray-100 hover:bg-blue-100"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Actions */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save availability"}
        </button>

        {saveStatus === "success" && (
          <p
            role="status"
            className="text-sm font-medium text-green-600"
            data-testid="save-success"
          >
            ✓ Availability saved
          </p>
        )}

        {saveStatus === "error" && (
          <p
            role="alert"
            className="text-sm text-red-600"
            data-testid="save-error"
          >
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}
