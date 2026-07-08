/**
 * Shared search logic for GET /api/coaches and the /coaches browse page.
 *
 * Uses the anon Supabase client (respects RLS: only onboarding_complete coaches
 * are visible) combined with server-side Haversine distance filtering so that
 * no PostGIS extension is required at MVP scale.
 */
import { createClient } from "@supabase/supabase-js";
import { geocodeZip } from "@/lib/geocode";
import { haversineDistance } from "@/lib/haversine";
import type { Coach } from "@/lib/database.types";

export const PAGE_SIZE = 12;
export const VALID_RADII = [5, 10, 25] as const;
export type Radius = (typeof VALID_RADII)[number];

export interface CoachWithDistance extends Coach {
  /** Distance from the search zip code in miles (rounded to 1 decimal). */
  distance: number;
}

export interface CoachSearchParams {
  zip: string;
  /** Search radius in miles — must be 5, 10, or 25; defaults to 10. */
  radius?: number;
  minRate?: number | null;
  maxRate?: number | null;
  /** 1-based page number; defaults to 1. */
  page?: number;
}

export interface CoachSearchResult {
  coaches: CoachWithDistance[];
  /** Total coaches matching the search (before pagination). */
  total: number;
  /** Current 1-based page number. */
  page: number;
  /** Total number of pages. */
  totalPages: number;
}

export type CoachSearchError =
  | { kind: "missing_zip" }
  | { kind: "invalid_radius"; given: number }
  | { kind: "geocode_failed"; zip: string }
  | { kind: "db_error"; message: string };

/** Build an anon Supabase client (no auth cookies required — uses public key). */
function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Search for coaches near a zip code.
 *
 * Returns a discriminated union so callers can surface helpful error messages.
 */
export async function searchCoaches(
  params: CoachSearchParams
): Promise<{ ok: true; data: CoachSearchResult } | { ok: false; error: CoachSearchError }> {
  const {
    zip,
    radius = 10,
    minRate = null,
    maxRate = null,
    page = 1,
  } = params;

  // Validate zip
  if (!zip || !zip.trim()) {
    return { ok: false, error: { kind: "missing_zip" } };
  }

  // Validate radius
  if (!VALID_RADII.includes(radius as Radius)) {
    return { ok: false, error: { kind: "invalid_radius", given: radius } };
  }

  // Geocode zip
  const coords = await geocodeZip(zip.trim());
  if (!coords) {
    return { ok: false, error: { kind: "geocode_failed", zip: zip.trim() } };
  }

  // Fetch onboarded coaches that have geocoded coordinates from Supabase.
  // The anon RLS policy already restricts to onboarding_complete = true.
  const supabase = getAnonClient();

  let query = supabase
    .from("coaches")
    .select("*")
    .eq("onboarding_complete", true)
    .not("lat", "is", null)
    .not("lng", "is", null);

  if (minRate !== null) {
    query = query.gte("hourly_rate", minRate);
  }
  if (maxRate !== null) {
    query = query.lte("hourly_rate", maxRate);
  }

  const { data: rows, error: dbError } = await query;

  if (dbError) {
    return { ok: false, error: { kind: "db_error", message: dbError.message } };
  }

  // Compute Haversine distance and filter to radius
  const withDistance: CoachWithDistance[] = (rows ?? [])
    .map((coach) => ({
      ...(coach as Coach),
      distance:
        Math.round(
          haversineDistance(coords.lat, coords.lng, coach.lat!, coach.lng!) * 10
        ) / 10,
    }))
    .filter((coach) => coach.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  const total = withDistance.length;
  const safePage = Math.max(1, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (safePage - 1) * PAGE_SIZE;
  const coaches = withDistance.slice(start, start + PAGE_SIZE);

  return {
    ok: true,
    data: { coaches, total, page: safePage, totalPages },
  };
}
