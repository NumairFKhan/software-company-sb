import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { validateProfileInput } from "@/lib/profile-validation";

// ── GET /api/profile ──────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();

  // Auth guard — must be authenticated before any DB query
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("player_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[GET /api/profile]", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ profile: null }, { status: 200 });
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}

// ── PUT /api/profile ──────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient();

  // Auth guard — must be authenticated before any DB query
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate
  const validation = validateProfileInput(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error.message, field: validation.error.field },
      { status: 422 }
    );
  }

  const {
    display_name,
    level,
    handedness,
    backhand_type,
    goals,
    technical_focus,
    available_days,
    session_length_minutes,
    known_injuries,
  } = validation.data;

  // ── Upsert profile ────────────────────────────────────────────────────────
  // Insert on first save; update on subsequent saves (conflict on user_id)
  const { data, error } = await supabase
    .from("player_profiles")
    .upsert(
      {
        user_id: user.id,
        display_name,
        level,
        handedness,
        backhand_type,
        goals,
        technical_focus,
        available_days,
        session_length_minutes,
        known_injuries,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[PUT /api/profile]", error);
    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}
