import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { validateSessionInput } from "@/lib/session-validation";

// ── POST /api/sessions ────────────────────────────────────────────────────────
// Creates a new session log entry for the authenticated user.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Auth guard
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
  const validation = validateSessionInput(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error.message, field: validation.error.field },
      { status: 422 }
    );
  }

  const {
    log_date,
    log_type,
    duration_mins,
    intensity,
    fatigue,
    pain_notes,
    free_notes,
    details,
  } = validation.data;

  // Insert
  const { data, error } = await supabase
    .from("session_logs")
    .insert({
      user_id: user.id,
      log_date,
      log_type,
      duration_mins,
      intensity,
      fatigue,
      pain_notes,
      free_notes,
      details,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/sessions]", error);
    return NextResponse.json(
      { error: "Failed to save session" },
      { status: 500 }
    );
  }

  return NextResponse.json({ session: data }, { status: 201 });
}
