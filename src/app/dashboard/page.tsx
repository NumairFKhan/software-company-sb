/**
 * /dashboard — Coach dashboard home
 *
 * A simple landing page for authenticated coaches with links to:
 *  - Edit their availability (this ticket)
 *  - Edit their profile
 *  - View their public page
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard — CourtSide",
};

export default async function DashboardPage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = getSupabaseServiceRoleClient();

  const { data: coach } = await serviceClient
    .from("coaches")
    .select("id, full_name, onboarding_complete")
    .eq("user_id", user.id)
    .single();

  if (!coach) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {coach.full_name.split(" ")[0]}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your coaching profile and availability from here.
          </p>
        </div>

        {/* Quick-action cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Availability */}
          <Link
            href="/dashboard/availability"
            className="group flex flex-col gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-blue-200"
          >
            <span className="text-2xl" aria-hidden="true">
              🗓️
            </span>
            <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
              Set availability
            </h2>
            <p className="text-sm text-gray-500">
              Configure your weekly recurring schedule so players can book open
              sessions.
            </p>
            <span className="mt-auto text-sm font-medium text-blue-600 group-hover:underline">
              Edit schedule →
            </span>
          </Link>

          {/* Profile */}
          <Link
            href="/onboarding"
            className="group flex flex-col gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-blue-200"
          >
            <span className="text-2xl" aria-hidden="true">
              ✏️
            </span>
            <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
              Edit profile
            </h2>
            <p className="text-sm text-gray-500">
              Update your bio, hourly rate, photo, and payment info.
            </p>
            <span className="mt-auto text-sm font-medium text-blue-600 group-hover:underline">
              Edit profile →
            </span>
          </Link>

          {/* Public profile */}
          {coach.onboarding_complete && (
            <Link
              href={`/coaches/${coach.id}`}
              className="group flex flex-col gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition hover:shadow-md hover:ring-blue-200 sm:col-span-2"
            >
              <span className="text-2xl" aria-hidden="true">
                👤
              </span>
              <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
                View public profile
              </h2>
              <p className="text-sm text-gray-500">
                See how players will discover you on CourtSide.
              </p>
              <span className="mt-auto text-sm font-medium text-blue-600 group-hover:underline">
                View profile →
              </span>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
