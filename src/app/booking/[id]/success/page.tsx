/**
 * /booking/[id]/success
 *
 * Shown after a successful Stripe Checkout payment.
 * Displays a booking summary: coach name, date/time, amount paid.
 *
 * The Stripe webhook may not have fired yet when this page loads (the player
 * lands here immediately after payment). We display available booking info and
 * show a "pending confirmation" note if the status is still 'pending'.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { formatDate, formatTime } from "@/lib/availability";

interface Props {
  params: { id: string };
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function BookingSuccessPage({ params }: Props) {
  const supabase = getServiceClient();

  // Load booking + coach in one round-trip
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, coach_id, slot_start, slot_end, hourly_rate, status, guest_name, guest_email")
    .eq("id", params.id)
    .single();

  if (error || !booking) {
    notFound();
  }

  // Fetch coach name
  const { data: coach } = await supabase
    .from("coaches")
    .select("full_name, sport")
    .eq("id", booking.coach_id)
    .single();

  // Parse slot times for display
  const slotStartDate = new Date(booking.slot_start);
  const slotEndDate = new Date(booking.slot_end);

  const dateStr = slotStartDate.toISOString().split("T")[0];
  const startHHMM = `${String(slotStartDate.getHours()).padStart(2, "0")}:${String(slotStartDate.getMinutes()).padStart(2, "0")}`;
  const endHHMM = `${String(slotEndDate.getHours()).padStart(2, "0")}:${String(slotEndDate.getMinutes()).padStart(2, "0")}`;

  const displayDate = formatDate(dateStr);
  const displayTime = `${formatTime(startHHMM)} – ${formatTime(endHHMM)}`;
  const amountPaid = `$${Number(booking.hourly_rate).toFixed(2)}`;
  const isConfirmed = booking.status === "confirmed";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="mx-auto max-w-md">
        {/* Success card */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-md">
          {/* Header */}
          <div
            className={`px-6 py-8 text-center ${
              isConfirmed
                ? "bg-gradient-to-r from-green-500 to-emerald-600"
                : "bg-gradient-to-r from-blue-500 to-indigo-600"
            }`}
          >
            <div className="mb-3 text-5xl">
              {isConfirmed ? "🎉" : "⏳"}
            </div>
            <h1 className="text-2xl font-bold text-white">
              {isConfirmed ? "Booking Confirmed!" : "Payment Received"}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {isConfirmed
                ? "Your session is locked in."
                : "We're confirming your booking — this usually takes a few seconds."}
            </p>
          </div>

          {/* Details */}
          <div className="px-6 py-6">
            {booking.guest_name && (
              <p className="mb-4 text-sm text-gray-700">
                Hi <strong>{booking.guest_name}</strong>,{" "}
                {isConfirmed
                  ? "here's a summary of your upcoming session:"
                  : "your payment was received and your booking is being confirmed:"}
              </p>
            )}

            <dl className="space-y-3">
              <Row label="Coach" value={coach?.full_name ?? "—"} />
              {coach?.sport && <Row label="Sport" value={coach.sport} />}
              <Row label="Date" value={displayDate} />
              <Row label="Time" value={displayTime} />
              <Row label="Duration" value="1 hour" />
              <Row label="Amount paid" value={amountPaid} />
              <Row
                label="Status"
                value={
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isConfirmed
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    <span aria-hidden="true">{isConfirmed ? "✓" : "◌"}</span>
                    {isConfirmed ? "Confirmed" : "Pending confirmation"}
                  </span>
                }
              />
            </dl>

            <p className="mt-4 text-xs text-gray-400">
              Booking ref: <span className="font-mono">{booking.id}</span>
            </p>

            {booking.guest_email && (
              <p className="mt-1 text-xs text-gray-400">
                A confirmation email {isConfirmed ? "has been sent" : "will be sent"} to{" "}
                <strong>{booking.guest_email}</strong>.
              </p>
            )}
          </div>

          {/* CTA */}
          <div className="border-t px-6 py-4">
            <Link
              href="/coaches"
              className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Browse more coaches
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Simple definition-list row */
function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="text-right font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
