/**
 * /coaches/[id] — Public coach profile page.
 *
 * - Returns 404 when the coach does not exist or onboarding_complete = false.
 * - Displays an "Unverified coach" badge with tooltip for all live profiles
 *   (Stripe KYC is complete, but the platform has not performed additional
 *   credential verification).
 */
import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import type { Coach } from "@/lib/database.types";

/** We use the anon key (no cookies needed) to read public coach rows. */
function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

interface Props {
  params: { id: string };
}

export default async function CoachProfilePage({ params }: Props) {
  const supabase = getAnonClient();

  const { data: coach, error } = await supabase
    .from("coaches")
    .select("*")
    .eq("id", params.id)
    .eq("onboarding_complete", true)
    .single();

  // RLS returns no row if onboarding_complete = false, or if the ID doesn't exist
  if (error || !coach) {
    notFound();
  }

  const typedCoach = coach as Coach;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Profile card */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-md">
          {/* Header strip */}
          <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-600" />

          <div className="px-6 pb-6">
            {/* Avatar */}
            <div className="relative -mt-12 mb-4">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-gray-200 shadow">
                {typedCoach.photo_url ? (
                  <Image
                    src={typedCoach.photo_url}
                    alt={typedCoach.full_name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-4xl text-gray-400">
                    👤
                  </span>
                )}
              </div>
            </div>

            {/* Name + badge */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                {typedCoach.full_name}
              </h1>
              <UnverifiedBadge />
            </div>

            {/* Location */}
            {typedCoach.zip && (
              <p className="mt-1 text-sm text-gray-500">
                📍 {typedCoach.zip}
              </p>
            )}

            {/* Rate */}
            {typedCoach.hourly_rate !== null && (
              <p className="mt-2 text-base font-semibold text-blue-600">
                ${Number(typedCoach.hourly_rate).toFixed(2)} / hour
              </p>
            )}

            {/* Bio */}
            {typedCoach.bio && (
              <div className="mt-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                  About
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                  {typedCoach.bio}
                </p>
              </div>
            )}

            {/* Sport */}
            {typedCoach.sport && (
              <div className="mt-4">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                  {typedCoach.sport}
                </span>
              </div>
            )}

            {/* CTA placeholder — booking flow is in a later ticket */}
            <div className="mt-6 border-t pt-6">
              <button
                disabled
                className="w-full cursor-not-allowed rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-50"
                title="Booking coming soon"
              >
                Book a session
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Inline badge component — tooltip via the HTML title attribute */
function UnverifiedBadge() {
  return (
    <span
      title="This coach has completed Stripe identity verification but has not been independently credentialed by CourtSide."
      className="inline-flex cursor-help items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800"
    >
      <span aria-hidden="true">⚠️</span>
      Unverified coach
    </span>
  );
}
