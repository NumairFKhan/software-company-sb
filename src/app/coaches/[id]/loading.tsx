/**
 * Loading skeleton for /coaches/[id] (Coach profile page).
 * Shown by Next.js App Router while the server component fetches coach data
 * and derives open slots.
 */

export default function CoachProfileLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Profile card skeleton */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-md">
          {/* Header strip */}
          <div className="h-24 animate-pulse bg-gray-200" />

          <div className="px-6 pb-6">
            {/* Avatar */}
            <div className="relative -mt-12 mb-4">
              <div className="h-24 w-24 animate-pulse rounded-full border-4 border-white bg-gray-300" />
            </div>

            {/* Name + badge */}
            <div className="flex items-center gap-2">
              <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-gray-200" />
            </div>

            {/* Location */}
            <div className="mt-2 h-4 w-24 animate-pulse rounded bg-gray-200" />

            {/* Rate */}
            <div className="mt-3 h-5 w-28 animate-pulse rounded bg-gray-200" />

            {/* Bio */}
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>

        {/* Slot picker skeleton */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-md">
          <div className="mb-4 h-5 w-36 animate-pulse rounded bg-gray-200" />

          {/* Week nav */}
          <div className="mb-4 flex items-center justify-between">
            <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-200" />
          </div>

          {/* Slot chips */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-gray-200"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
