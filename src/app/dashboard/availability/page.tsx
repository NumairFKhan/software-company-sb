/**
 * /dashboard/availability — Coach availability editor
 *
 * Server Component that:
 *  1. Verifies the coach is authenticated (redirects to /login otherwise).
 *  2. Looks up the coach row for the authenticated user.
 *  3. Fetches existing recurring availability slots.
 *  4. Renders the <AvailabilityGrid /> client component pre-loaded with those slots.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import AvailabilityGrid from "./AvailabilityGrid";
import type { RecurringSlot } from "@/lib/database.types";

export const metadata = {
  title: "Availability — CourtSide",
};

export default async function AvailabilityPage() {
  // 1. Auth check
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // 2. Load coach row
  const { data: coach } = await serviceClient
    .from("coaches")
    .select("id, full_name")
    .eq("user_id", user.id)
    .single();

  if (!coach) {
    // No coach profile yet — send them to onboarding
    redirect("/onboarding");
  }

  // 3. Load existing recurring slots
  const { data: slots } = await serviceClient
    .from("availability_slots")
    .select("id, coach_id, day_of_week, start_time, end_time")
    .eq("coach_id", coach.id)
    .eq("is_recurring", true)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  const initialSlots: RecurringSlot[] = (slots ?? []).filter(
    (s): s is RecurringSlot =>
      s.day_of_week !== null && s.start_time !== null && s.end_time !== null
  );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Weekly availability
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Toggle the hour blocks when you&apos;re free to take bookings.
              Changes apply every week until you update them.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>
        </div>

        {/* Grid card */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <AvailabilityGrid coachId={coach.id} initialSlots={initialSlots} />
        </div>

        {/* Help text */}
        <p className="mt-4 text-center text-xs text-gray-400">
          Your public profile will show open sessions based on this schedule,
          minus any already-confirmed bookings.
        </p>
      </div>
    </main>
  );
}
