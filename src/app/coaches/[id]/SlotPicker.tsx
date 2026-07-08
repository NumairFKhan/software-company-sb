"use client";

/**
 * SlotPicker — interactive booking widget for the public coach profile page.
 *
 * Flow:
 *  1. Displays open slots grouped by date as clickable time buttons.
 *  2. On slot click → shows an inline guest-checkout form (name + email).
 *  3. On form submit → POST /api/bookings → redirect to Stripe Checkout.
 *
 * This is a Client Component because it manages selection and form state.
 * The parent Server Component fetches open slots and passes them as props.
 */

import { useState } from "react";
import type { OpenSlot } from "@/lib/database.types";
import { groupSlotsByDate, formatDate, formatTime } from "@/lib/availability";

interface Props {
  coachId: string;
  openSlots: OpenSlot[];
}

interface BookingState {
  loading: boolean;
  error: string | null;
}

export default function SlotPicker({ coachId, openSlots }: Props) {
  const [selectedSlot, setSelectedSlot] = useState<OpenSlot | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [state, setState] = useState<BookingState>({ loading: false, error: null });

  const slotsByDate = groupSlotsByDate(openSlots).slice(0, 14);

  function selectSlot(slot: OpenSlot) {
    setSelectedSlot(slot);
    setState({ loading: false, error: null });
    // Scroll the form into view on mobile
    setTimeout(() => {
      document
        .getElementById("booking-form")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setState({ loading: true, error: null });

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          slotStart: selectedSlot.start_datetime,
          slotEnd: selectedSlot.end_datetime,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({
          loading: false,
          error: data.error ?? "Something went wrong. Please try again.",
        });
        // If the slot was taken, deselect it so the user picks another
        if (res.status === 409) setSelectedSlot(null);
        return;
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        setState({ loading: false, error: "Unexpected response from server." });
      }
    } catch {
      setState({ loading: false, error: "Network error. Please try again." });
    }
  }

  if (slotsByDate.length === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-base font-semibold text-gray-900">Book a session</h2>
        <p className="mt-3 text-sm text-gray-500">
          No open sessions available in the next 4 weeks.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-base font-semibold text-gray-900">Book a session</h2>
      <p className="mt-1 text-xs text-gray-400">
        Select an available time slot below.
      </p>

      {/* ── Slot grid ──────────────────────────────────────────────────────── */}
      <div className="mt-4 space-y-4">
        {slotsByDate.map(({ date, slots }) => (
          <div key={date}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {formatDate(date)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {slots.map((slot) => {
                const isSelected =
                  selectedSlot?.start_datetime === slot.start_datetime;
                return (
                  <button
                    key={slot.start_datetime}
                    type="button"
                    onClick={() => selectSlot(slot)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-500 hover:bg-blue-100"
                    }`}
                  >
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Guest checkout form (shown once a slot is selected) ────────────── */}
      {selectedSlot && (
        <form
          id="booking-form"
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4"
        >
          <p className="mb-3 text-sm font-medium text-blue-900">
            Booking{" "}
            <strong>
              {formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}
            </strong>{" "}
            on{" "}
            <strong>{formatDate(selectedSlot.date)}</strong>
          </p>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="guestName"
                className="block text-xs font-medium text-gray-700"
              >
                Your name
              </label>
              <input
                id="guestName"
                type="text"
                required
                autoComplete="name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Jane Smith"
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="guestEmail"
                className="block text-xs font-medium text-gray-700"
              >
                Your email
              </label>
              <input
                id="guestEmail"
                type="email"
                required
                autoComplete="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="jane@example.com"
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {state.error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {state.error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={state.loading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {state.loading ? "Redirecting to payment…" : "Book & Pay →"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSlot(null);
                setState({ loading: false, error: null });
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-400">
            You&apos;ll be redirected to Stripe to complete your payment securely.
          </p>
        </form>
      )}
    </div>
  );
}
