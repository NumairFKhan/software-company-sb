/**
 * Loading skeleton for /dashboard/player (Player lessons dashboard).
 * Shown while the server component verifies auth and loads bookings.
 */

export default function PlayerDashboardLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="h-7 w-36 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-52 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
        </div>

        {/* Upcoming section */}
        <section className="mb-8">
          <div className="mb-3 h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <LessonRowSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* Past section */}
        <section>
          <div className="mb-3 h-4 w-28 animate-pulse rounded bg-gray-200" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <LessonRowSkeleton key={i} muted />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function LessonRowSkeleton({ muted = false }: { muted?: boolean }) {
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm ${
        muted ? "opacity-50" : ""
      }`}
    >
      <div className="shrink-0">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-3 w-14 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-3 w-16 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="h-4 w-10 animate-pulse rounded bg-gray-200" />
      <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200" />
    </div>
  );
}
