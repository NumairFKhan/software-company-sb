/**
 * POST /api/coaches
 *
 * Updates the authenticated coach's profile (display name, bio, hourly rate,
 * zip code, photo URL).  Zip code is geocoded to lat/lng via Nominatim on save.
 *
 * Returns 401 when the request is unauthenticated.
 * Returns 404 when the coach row does not exist for the authenticated user.
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { geocodeZip } from "@/lib/geocode";

export async function POST(request: Request) {
  // 1. Verify authentication
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { display_name, bio, hourly_rate, zip, photo_url } = body as {
    display_name?: string;
    bio?: string;
    hourly_rate?: number;
    zip?: string;
    photo_url?: string;
  };

  // Validate bio length
  if (bio !== undefined && bio.length > 500) {
    return NextResponse.json(
      { error: "bio must be 500 characters or fewer" },
      { status: 422 }
    );
  }

  // 3. Geocode zip code (if provided)
  let lat: number | null = null;
  let lng: number | null = null;
  if (zip) {
    const coords = await geocodeZip(zip);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
    // Non-fatal: if geocoding fails we still save the zip; lat/lng remain null
  }

  // 4. Build update payload (only include provided fields)
  // Use service-role client so we can write even if RLS INSERT policy is absent
  const serviceClient = getSupabaseServiceRoleClient();

  const updatePayload: Record<string, unknown> = {};
  if (display_name !== undefined) updatePayload.full_name = display_name;
  if (bio !== undefined) updatePayload.bio = bio;
  if (hourly_rate !== undefined) updatePayload.hourly_rate = hourly_rate;
  if (zip !== undefined) updatePayload.zip = zip;
  if (lat !== null) updatePayload.lat = lat;
  if (lng !== null) updatePayload.lng = lng;
  if (photo_url !== undefined) updatePayload.photo_url = photo_url;

  // 5. Update the coaches row for this user
  const { data: coach, error: updateError } = await serviceClient
    .from("coaches")
    .update(updatePayload)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === "PGRST116") {
      // No row found for this user
      return NextResponse.json(
        { error: "Coach profile not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ coach }, { status: 200 });
}
