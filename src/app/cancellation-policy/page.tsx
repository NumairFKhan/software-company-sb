/**
 * /cancellation-policy — CourtSide cancellation and refund policy.
 *
 * Static Next.js page — no API calls needed. Linked from:
 *  - Stripe Checkout session description
 *  - Booking confirmation emails
 * Required before accepting real payments.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cancellation Policy — CourtSide",
  description:
    "CourtSide's cancellation and refund policy for lesson bookings.",
};

export default function CancellationPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            ← Back to CourtSide
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            Cancellation Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Last updated: July 2026
          </p>
        </div>

        <div className="space-y-8 rounded-2xl bg-white p-8 shadow-sm text-sm text-gray-700 leading-relaxed">

          {/* Summary box */}
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-6 py-5">
            <p className="font-semibold text-blue-900 text-base">
              Summary
            </p>
            <ul className="mt-2 space-y-1 text-blue-800">
              <li>✅ Free cancellation up to <strong>24 hours</strong> before your session</li>
              <li>❌ No refund if you cancel within 24 hours of the session start time</li>
            </ul>
          </div>

          {/* Player cancellations */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Player cancellations
            </h2>
            <p>
              You may cancel a confirmed booking for a <strong>full refund</strong> if you
              do so more than 24 hours before the scheduled session start time.
            </p>
            <p className="mt-3">
              If you cancel <strong>within 24 hours</strong> of the session start time, no
              refund will be issued. The full booking amount will be retained by
              CourtSide to compensate the coach for the reserved time.
            </p>
            <p className="mt-3">
              To cancel, visit the booking confirmation page you received by email
              and click &ldquo;Cancel booking&rdquo;. Refunds are processed by Stripe and
              typically appear within 5–10 business days on your original payment method.
            </p>
          </section>

          {/* Coach cancellations */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Coach cancellations
            </h2>
            <p>
              Coaches who need to cancel a confirmed booking must do so as early
              as possible. In the event of a coach-initiated cancellation, the
              player will receive a <strong>full refund</strong> regardless of timing.
            </p>
            <p className="mt-3">
              Coaches who repeatedly cancel confirmed bookings may have their
              account suspended.
            </p>
          </section>

          {/* No-shows */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              No-shows
            </h2>
            <p>
              If a player does not attend the session without prior cancellation,
              no refund will be issued. The coach will receive their full payout.
            </p>
            <p className="mt-3">
              If a coach does not show up for a confirmed booking, please contact
              us at{" "}
              <a
                href="mailto:support@courtside.app"
                className="text-blue-600 hover:underline"
              >
                support@courtside.app
              </a>{" "}
              and we will issue a full refund within 2 business days.
            </p>
          </section>

          {/* Refund processing */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Refund processing
            </h2>
            <p>
              Approved refunds are processed via Stripe to the original payment
              method. Processing times depend on your bank but are typically
              5–10 business days after the refund is issued.
            </p>
          </section>

          {/* Disputes */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Disputes
            </h2>
            <p>
              If you believe a refund has been incorrectly denied, or if you
              have a dispute with your coach, please contact us at{" "}
              <a
                href="mailto:support@courtside.app"
                className="text-blue-600 hover:underline"
              >
                support@courtside.app
              </a>{" "}
              with your booking reference number. We will review the situation
              and respond within 2 business days.
            </p>
          </section>

          {/* Platform fee */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Platform fee
            </h2>
            <p>
              CourtSide charges a 10% platform fee on each booking. This fee is
              deducted from the coach&apos;s payout and is non-refundable in the event
              of a player no-show when the cancellation window has passed.
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <p className="mt-6 text-center text-xs text-gray-400">
          <Link href="/privacy" className="text-blue-500 hover:underline">
            Privacy Policy
          </Link>{" "}
          &middot;{" "}
          <Link href="/coaches" className="text-blue-500 hover:underline">
            Browse Coaches
          </Link>
        </p>
      </div>
    </main>
  );
}
