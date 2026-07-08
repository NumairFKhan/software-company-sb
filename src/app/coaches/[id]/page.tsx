/**
 * /coaches/[id] — Public coach profile page.
 *
 * - Returns 404 when the coach does not exist or onboarding_complete = false.
 * - Displays an "Unverified coach" badge with tooltip for all live profiles
 *   (Stripe KYC is complete, but the platform has not performed additional
 *   credential verification).
 * - Derives open booking slots for the next 4 weeks from recurring
 *   availability_slots, excluding times already covered by confirmed bookings.
 */
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Coach, RecurringSlot } from "@/lib/database.types";
import { deriveOpenSlots } from "@/lib/availability";
import SlotPicker from "./SlotPicker";

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

/**
 * generateMetadata — SSR <head> for SEO on the public coach profile page.
 * Provides coach name and bio in <title> and <meta description>.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = getAnonClient();

  const { data: coach } = await supabase
    .from("coaches")
    .select("full_name, bio, sport, zip")
    .eq("id", params.id)
    .eq("onboarding_complete", true)
    .single();

  if (!coach) {
    return { title: "Coach Not Found | CourtSide" };
  }

  const sportLabel = coach.sport ? `${coach.sport} ` : "";
  const locationLabel = coach.zip ? ` near ${coach.zip}` : "";
  const title = `${coach.full_name} — ${sportLabel}Coach${locationLabel} | CourtSide`;

  const description =
    coach.bio && coach.bio.length > 0
      ? coach.bio.length <= 160
        ? coach.bio
        : `${coach.bio.slice(0, 157)}…`
      : `Book a lesson with ${coach.full_name} on CourtSide.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
    },
  };
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

  // Load recurring availability slots and confirmed bookings server-side
  const serviceClient = getSupabaseServiceRoleClient();

  const [{ data: slotsData }, { data: bookingsData }] = await Promise.all([
    serviceClient
      .from("availability_slots")
      .select("id, coach_id, day_of_week, start_time, end_time")
      .eq("coach_id", params.id)
      .eq("is_recurring", true),
    serviceClient
      .from("bookings")
      .select("slot_start, slot_end")
      .eq("coach_id", params.id)
      .eq("status", "confirmed")
      .gte("slot_end", new Date().toISOString()),
  ]);

  const recurringSlots: RecurringSlot[] = (slotsData ?? []).filter(
    (s): s is RecurringSlot =>
      s.day_of_week !== null && s.start_time !== null && s.end_time !== null
  );

  const confirmedBookings = (bookingsData ?? []).filter(
    (b): b is { slot_start: string; slot_end: string } =>
      typeof b.slot_start === "string" && typeof b.slot_end === "string"
  );

  const openSlots = deriveOpenSlots(recurringSlots, confirmedBookings, 4);

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

          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Interactive slot picker — select a slot and book as a guest       */}
        {/* ---------------------------------------------------------------- */}
        {recurringSlots.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-md">
            <h2 className="text-base font-semibold text-gray-900">Book a session</h2>
            <p className="mt-3 text-sm text-gray-500">
              This coach hasn&apos;t set their availability yet.
            </p>
          </div>
        ) : (
          <SlotPicker coachId={typedCoach.id} openSlots={openSlots} />
        )}
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
