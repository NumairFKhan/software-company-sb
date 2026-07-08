/**
 * Loading skeleton for /dashboard/coach (Coach schedule dashboard).
 * Shown while the server component verifies auth and loads bookings.
 */

export default function CoachDashboardLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="h-7 w-36 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-xl p-4 animate-pulse bg-gray-200 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}
            >
              <div className="h-7 w-12 rounded bg-gray-300" />
              <div className="mt-1 h-3 w-24 rounded bg-gray-300" />
            </div>
          ))}
        </div>

        {/* Calendar placeholder */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
        </div>

        {/* Booking rows */}
        <section className="mt-8">
          <div className="mb-3 h-4 w-36 animate-pulse rounded bg-gray-200" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <BookingRowSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function BookingRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <div className="shrink-0">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-3 w-14 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-3 w-24 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="h-4 w-10 animate-pulse rounded bg-gray-200" />
      <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200" />
    </div>
  );
}
