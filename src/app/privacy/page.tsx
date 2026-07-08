/**
 * /privacy — Plain-English privacy policy for CourtSide.
 *
 * Static Next.js page — no API calls needed. Covers PII handling to meet
 * legal minimums before accepting real payments.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — CourtSide",
  description:
    "How CourtSide collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">
            Last updated: July 2026
          </p>
        </div>

        <div className="space-y-8 rounded-2xl bg-white p-8 shadow-sm text-sm text-gray-700 leading-relaxed">

          {/* Introduction */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Who we are
            </h2>
            <p>
              CourtSide is an online marketplace that connects independent sports
              coaches with players for one-on-one lessons. When you use CourtSide
              to book a session or register as a coach, you share some personal
              information with us. This policy explains exactly what we collect,
              why we collect it, and how we protect it.
            </p>
          </section>

          {/* What we collect */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              What information we collect
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Email address</strong> — collected when you book a
                session (guest checkout) or create an account. We store your
                email in our <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">bookings</code> table
                to send you booking confirmations, reminders, and cancellation
                notices.
              </li>
              <li>
                <strong>Name</strong> — collected at checkout so your coach
                knows who to expect.
              </li>
              <li>
                <strong>Payment information</strong> — processed entirely by
                Stripe. CourtSide never sees or stores your full card number,
                CVC, or bank account details. See{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Stripe&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Coach profile data</strong> — if you register as a
                coach, we store your name, bio, sport, zip code, hourly rate,
                and profile photo so players can find and book you.
              </li>
            </ul>
          </section>

          {/* How we use it */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              How we use your information
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Booking confirmations</strong> — we email you a receipt
                and session summary when your payment goes through.
              </li>
              <li>
                <strong>24-hour reminders</strong> — we send one automated
                reminder email the day before your session.
              </li>
              <li>
                <strong>Cancellations</strong> — we email you if a booking is
                cancelled (by you or your coach) and note refund eligibility.
              </li>
              <li>
                <strong>Coach payouts</strong> — we pass your booking amount
                (less our platform fee) to the coach via Stripe Connect.
              </li>
              <li>
                <strong>No marketing without consent</strong> — we do not add
                you to any marketing list. We do not sell your email address or
                personal data to third parties.
              </li>
            </ul>
          </section>

          {/* Data storage */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Where your data is stored
            </h2>
            <p>
              Booking and account data is stored in a Supabase PostgreSQL
              database hosted on AWS infrastructure in the United States.
              Access is restricted to server-side application code using a
              service role key; the database is not accessible from the public
              internet.
            </p>
          </section>

          {/* Data retention */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              How long we keep your data
            </h2>
            <p>
              Booking records (including your email and name) are retained for
              up to 3 years for accounting and dispute resolution purposes. If
              you would like your data deleted sooner, contact us at the address
              below and we will process your request within 30 days.
            </p>
          </section>

          {/* Your rights */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Your rights
            </h2>
            <p>You have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Request a copy of the personal data we hold about you.</li>
              <li>Ask us to correct inaccurate information.</li>
              <li>
                Ask us to delete your data (subject to any legal retention
                obligations).
              </li>
              <li>Opt out of any future communications.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a
                href="mailto:privacy@courtside.app"
                className="text-blue-600 hover:underline"
              >
                privacy@courtside.app
              </a>
              .
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Cookies
            </h2>
            <p>
              CourtSide uses a single session cookie (set by Supabase Auth) to
              keep you logged in. We do not use advertising or tracking cookies.
              No third-party analytics scripts are loaded on CourtSide pages.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Changes to this policy
            </h2>
            <p>
              If we make material changes, we will update the &ldquo;Last
              updated&rdquo; date at the top of this page. Continued use of
              CourtSide after a change constitutes acceptance of the updated
              policy.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Contact
            </h2>
            <p>
              Questions about this policy? Email us at{" "}
              <a
                href="mailto:privacy@courtside.app"
                className="text-blue-600 hover:underline"
              >
                privacy@courtside.app
              </a>
              .
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <p className="mt-6 text-center text-xs text-gray-400">
          <Link href="/cancellation-policy" className="text-blue-500 hover:underline">
            Cancellation Policy
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
