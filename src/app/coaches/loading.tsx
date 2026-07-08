/**
 * Loading skeleton for /coaches (Browse coaches page).
 * Shown by Next.js App Router while the server component fetches data.
 */

export default function CoachesLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Search / filter bar skeleton */}
        <div className="mb-8 h-12 w-full animate-pulse rounded-xl bg-gray-200" />

        {/* Coach cards grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CoachCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}

function CoachCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* Header strip */}
      <div className="h-20 animate-pulse bg-gray-200" />

      <div className="p-4">
        {/* Avatar */}
        <div className="-mt-8 mb-3 h-16 w-16 animate-pulse rounded-full bg-gray-300 border-4 border-white" />

        {/* Name */}
        <div className="mb-2 h-5 w-2/3 animate-pulse rounded bg-gray-200" />
        {/* Sport badge */}
        <div className="mb-3 h-4 w-1/3 animate-pulse rounded-full bg-gray-200" />
        {/* Rate */}
        <div className="mb-4 h-4 w-1/4 animate-pulse rounded bg-gray-200" />
        {/* CTA button */}
        <div className="h-9 w-full animate-pulse rounded-lg bg-gray-200" />
      </div>
    </div>
  );
}
