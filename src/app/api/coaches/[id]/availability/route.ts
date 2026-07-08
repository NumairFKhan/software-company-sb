/**
 * GET  /api/coaches/[id]/availability
 *   Returns the recurring availability slots for a coach (public read).
 *
 * PUT  /api/coaches/[id]/availability
 *   Atomically replaces ALL recurring availability slots for the coach.
 *   Body: { slots: Array<{ day_of_week: 0–6, start_time: "HH:MM", end_time: "HH:MM" }> }
 *
 *   Auth rules:
 *     - 401 if request is unauthenticated
 *     - 403 if the authenticated user does not own this coach profile
 *     - 404 if the coach ID does not exist
 */
import { NextResponse } from "next/server";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

interface SlotInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

// ---------------------------------------------------------------------------
// GET — public read of recurring slots
// ---------------------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const serviceClient = getSupabaseServiceRoleClient();

  const { data, error } = await serviceClient
    .from("availability_slots")
    .select("id, day_of_week, start_time, end_time")
    .eq("coach_id", params.id)
    .eq("is_recurring", true)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ slots: data ?? [] });
}

// ---------------------------------------------------------------------------
// PUT — authenticated, coach-owned replace
// ---------------------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  // 1. Verify authentication
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = getSupabaseServiceRoleClient();

  // 2. Ownership check — the coach row must belong to the authenticated user
  const { data: coach, error: coachError } = await serviceClient
    .from("coaches")
    .select("id, user_id")
    .eq("id", params.id)
    .single();

  if (coachError || !coach) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }

  if (coach.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse request body
  let body: { slots?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.slots)) {
    return NextResponse.json(
      { error: "Request body must include a 'slots' array" },
      { status: 422 }
    );
  }

  const slots = body.slots as SlotInput[];

  // 4. Validate each slot
  const HH_MM = /^\d{2}:\d{2}$/;
  for (const slot of slots) {
    if (
      typeof slot.day_of_week !== "number" ||
      !Number.isInteger(slot.day_of_week) ||
      slot.day_of_week < 0 ||
      slot.day_of_week > 6
    ) {
      return NextResponse.json(
        { error: `Invalid day_of_week: must be an integer 0–6` },
        { status: 422 }
      );
    }
    if (
      typeof slot.start_time !== "string" ||
      !HH_MM.test(slot.start_time) ||
      typeof slot.end_time !== "string" ||
      !HH_MM.test(slot.end_time)
    ) {
      return NextResponse.json(
        { error: "start_time and end_time must be in HH:MM format" },
        { status: 422 }
      );
    }
    if (slot.start_time >= slot.end_time) {
      return NextResponse.json(
        { error: "start_time must be before end_time" },
        { status: 422 }
      );
    }
  }

  // 5. Atomic replace via stored procedure (DELETE + INSERT in one transaction)
  const { error: rpcError } = await serviceClient.rpc(
    "replace_recurring_availability",
    {
      p_coach_id: params.id,
      p_slots: slots,
    }
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // 6. Return the newly saved slots
  const { data: newSlots, error: fetchError } = await serviceClient
    .from("availability_slots")
    .select("id, day_of_week, start_time, end_time")
    .eq("coach_id", params.id)
    .eq("is_recurring", true)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ slots: newSlots ?? [] });
}
