import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// ── DELETE /api/sessions/:id ──────────────────────────────────────────────────
// Soft-deletes a session log by setting `deleted_at` to the current timestamp.
// Only the owner of the log can delete it (enforced by RLS + explicit check).

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  // Auth guard
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  // Soft-delete: set deleted_at.
  // RLS ensures user_id must match, so other users' rows are invisible.
  const { data, error } = await supabase
    .from("session_logs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)   // idempotent: skip already-deleted rows
    .select()
    .maybeSingle();

  if (error) {
    console.error("[DELETE /api/sessions/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }

  if (!data) {
    // Either not found or already deleted
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: data }, { status: 200 });
}
