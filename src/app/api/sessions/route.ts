import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { validateSessionInput, VALID_LOG_TYPES } from "@/lib/session-validation";
import { computeSessionSummary } from "@/lib/session-summary";
import type { LogType } from "@/types/database";

// ── GET /api/sessions ─────────────────────────────────────────────────────────
// Returns paginated session logs for the authenticated user, newest-first,
// along with a server-computed 14-day summary (top focus area, fatigue trend,
// pain flag). Filterable by `log_type` query param.
//
// Query params:
//   limit    (number, 1–100, default 20)
//   offset   (number, ≥0,    default 0)
//   log_type (string, one of VALID_LOG_TYPES — omit for all types)

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Auth guard
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse query params ──────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const logTypeParam = searchParams.get("log_type");

  const limit = Math.max(1, Math.min(100, parseInt(limitRaw ?? "20", 10) || 20));
  const offset = Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0);

  // Validate optional log_type filter
  const log_type: LogType | null =
    logTypeParam && (VALID_LOG_TYPES as readonly string[]).includes(logTypeParam)
      ? (logTypeParam as LogType)
      : null;

  if (logTypeParam && !log_type) {
    return NextResponse.json(
      {
        error: `Invalid log_type. Must be one of: ${VALID_LOG_TYPES.join(", ")}`,
        field: "log_type",
      },
      { status: 400 }
    );
  }

  // ── Build paginated list query ──────────────────────────────────────────
  let listQuery = supabase
    .from("session_logs")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (log_type) {
    listQuery = listQuery.eq("log_type", log_type);
  }

  // ── Build 14-day summary query (always all types) ───────────────────────
  // Fetch only the columns needed for summary computation; never pulled
  // client-side — computation happens here in the API handler.
  const since14 = new Date();
  since14.setUTCDate(since14.getUTCDate() - 14);
  const since14Str = since14.toISOString().slice(0, 10);

  const summaryQuery = supabase
    .from("session_logs")
    .select("log_date, log_type, fatigue, pain_notes, details")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .gte("log_date", since14Str);

  // Run both queries in parallel for efficiency
  const [listResult, summaryResult] = await Promise.all([
    listQuery,
    summaryQuery,
  ]);

  if (listResult.error) {
    console.error("[GET /api/sessions] list query error:", listResult.error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }

  if (summaryResult.error) {
    console.error(
      "[GET /api/sessions] summary query error:",
      summaryResult.error
    );
    return NextResponse.json(
      { error: "Failed to fetch summary data" },
      { status: 500 }
    );
  }

  // ── Compute 14-day summary server-side ──────────────────────────────────
  const summary = computeSessionSummary(
    (summaryResult.data ?? []).map((r) => ({
      log_date: r.log_date,
      log_type: r.log_type as LogType,
      fatigue: r.fatigue,
      pain_notes: r.pain_notes,
      details: (r.details ?? {}) as Record<string, unknown>,
    }))
  );

  return NextResponse.json({
    sessions: listResult.data ?? [],
    total: listResult.count ?? 0,
    summary,
  });
}

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
