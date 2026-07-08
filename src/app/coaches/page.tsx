/**
 * /coaches — Coach discovery browse page.
 *
 * - No login required.
 * - Filters (zip, radius, minRate, maxRate) are reflected in the URL query
 *   string and survive page refresh.
 * - Results are paginated 12 per page with Previous / Next page controls.
 * - SSR: initial render is server-side for SEO; filter changes push a new URL
 *   via the CoachesFilters client component which triggers a fresh server render.
 */
import type { Metadata } from "next";
import Link from "next/link";
import CoachesFilters from "./CoachesFilters";
import CoachCard from "./CoachCard";
import { searchCoaches } from "@/lib/searchCoaches";

export const metadata: Metadata = {
  title: "Find a Coach Near You | CourtSide",
  description:
    "Browse verified tennis and sports coaches near you. Filter by location, price, and more — no account required.",
};

interface PageProps {
  searchParams: {
    zip?: string;
    radius?: string;
    minRate?: string;
    maxRate?: string;
    page?: string;
  };
}

export default async function CoachesPage({ searchParams }: PageProps) {
  const zip = searchParams.zip?.trim() ?? "";
  const radius = searchParams.radius ? parseInt(searchParams.radius, 10) : 10;
  const minRate = searchParams.minRate ? parseFloat(searchParams.minRate) : null;
  const maxRate = searchParams.maxRate ? parseFloat(searchParams.maxRate) : null;
  const page = searchParams.page ? parseInt(searchParams.page, 10) : 1;

  // Run search only when a zip is present
  const searchResult = zip
    ? await searchCoaches({ zip, radius, minRate, maxRate, page })
    : null;

  // Build query string helper for pagination links (preserves existing filters)
  function buildPageHref(targetPage: number) {
    const params = new URLSearchParams({ zip, radius: String(radius), page: String(targetPage) });
    if (searchParams.minRate) params.set("minRate", searchParams.minRate);
    if (searchParams.maxRate) params.set("maxRate", searchParams.maxRate);
    return `/coaches?${params.toString()}`;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Find a Coach</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enter your zip code to discover coaches near you.
          </p>
        </div>

        {/* Filter form */}
        <CoachesFilters
          zip={zip}
          radius={String(radius)}
          minRate={searchParams.minRate ?? ""}
          maxRate={searchParams.maxRate ?? ""}
        />

        {/* Results area */}
        {!zip && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-md">
            <p className="text-4xl">🎾</p>
            <p className="mt-3 text-base font-medium text-gray-700">
              Enter a zip code above to find coaches near you.
            </p>
          </div>
        )}

        {zip && searchResult && !searchResult.ok && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {searchResult.error.kind === "missing_zip" &&
              "Please enter a zip code to search."}
            {searchResult.error.kind === "invalid_radius" &&
              `Invalid radius: ${searchResult.error.given} miles. Choose 5, 10, or 25.`}
            {searchResult.error.kind === "geocode_failed" &&
              `We couldn't find the location for zip code "${searchResult.error.zip}". Please double-check and try again.`}
            {searchResult.error.kind === "db_error" &&
              "A database error occurred. Please try again later."}
          </div>
        )}

        {zip && searchResult && searchResult.ok && (
          <>
            {/* Result count */}
            <p className="text-sm text-gray-500">
              {searchResult.data.total === 0 ? (
                "No coaches found matching your search."
              ) : (
                <>
                  Showing{" "}
                  <span className="font-semibold text-gray-700">
                    {Math.min(
                      (page - 1) * 12 + 1,
                      searchResult.data.total
                    )}
                    –
                    {Math.min(page * 12, searchResult.data.total)}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-gray-700">
                    {searchResult.data.total}
                  </span>{" "}
                  coach{searchResult.data.total !== 1 ? "es" : ""} within{" "}
                  {radius} miles of {zip}
                </>
              )}
            </p>

            {/* Coach grid */}
            {searchResult.data.coaches.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {searchResult.data.coaches.map((coach) => (
                  <CoachCard key={coach.id} coach={coach} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-10 text-center shadow-md">
                <p className="text-4xl">🔍</p>
                <p className="mt-3 text-base font-medium text-gray-700">
                  No coaches found within {radius} miles of {zip}.
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Try expanding your search radius or adjusting your price range.
                </p>
              </div>
            )}

            {/* Pagination controls */}
            {searchResult.data.totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="flex items-center justify-between border-t border-gray-200 pt-4"
              >
                {page > 1 ? (
                  <Link
                    href={buildPageHref(page - 1)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}

                <span className="text-sm text-gray-500">
                  Page {page} of {searchResult.data.totalPages}
                </span>

                {page < searchResult.data.totalPages ? (
                  <Link
                    href={buildPageHref(page + 1)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  );
}
