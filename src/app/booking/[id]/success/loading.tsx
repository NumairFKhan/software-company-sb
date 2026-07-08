/**
 * Loading skeleton for /booking/[id]/success (post-payment confirmation page).
 * Shown while the server component fetches booking and coach data.
 */

export default function BookingSuccessLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-2xl bg-white shadow-md">
          {/* Header */}
          <div className="px-6 py-8 text-center bg-gradient-to-r from-gray-200 to-gray-300 animate-pulse">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-300" />
            <div className="mx-auto mb-2 h-6 w-48 rounded bg-gray-300" />
            <div className="mx-auto h-4 w-64 rounded bg-gray-300" />
          </div>

          {/* Details */}
          <div className="px-6 py-6 space-y-3">
            <div className="mb-4 h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="border-t px-6 py-4">
            <div className="h-10 w-full animate-pulse rounded-lg bg-gray-200" />
          </div>
        </div>
      </div>
    </main>
  );
}
