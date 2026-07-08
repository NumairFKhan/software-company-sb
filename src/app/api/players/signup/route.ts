/**
 * POST /api/players/signup
 *
 * Creates a new player account:
 *  1. Creates a Supabase auth user (email + password, auto-confirmed).
 *  2. Inserts a players profile row.
 *  3. Links any existing guest bookings with the same email to the new
 *     player_id:
 *       UPDATE bookings
 *          SET player_id = <new_player_id>
 *        WHERE guest_email = <email>
 *          AND player_id IS NULL
 *
 * Request body: { email: string, password: string, full_name: string }
 * Response:     { player_id: string }  (201)
 */

import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; password?: string; full_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password, full_name } = body;

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: "email, password, and full_name are required" },
      { status: 400 }
    );
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  // ── 1. Create auth user ──────────────────────────────────────────────────
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    // Supabase returns a specific error for duplicate emails
    const msg = authError?.message ?? "Failed to create user";
    const status =
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("duplicate")
        ? 409
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  const authUserId = authData.user.id;

  // ── 2. Insert players profile ────────────────────────────────────────────
  const { data: playerRow, error: profileError } = await supabase
    .from("players")
    .insert({
      user_id: authUserId,
      email: normalizedEmail,
      full_name: full_name.trim(),
    })
    .select("id")
    .single();

  if (profileError || !playerRow) {
    // Roll back auth user to avoid orphan
    await supabase.auth.admin.deleteUser(authUserId);
    return NextResponse.json(
      { error: profileError?.message ?? "Failed to create player profile" },
      { status: 500 }
    );
  }

  // ── 3. Link guest bookings ────────────────────────────────────────────────
  // Best-effort: don't block the response if this fails
  const { error: linkError } = await supabase
    .from("bookings")
    .update({ player_id: playerRow.id })
    .eq("guest_email", normalizedEmail)
    .is("player_id", null);

  if (linkError) {
    console.warn(
      "[players/signup] Failed to link guest bookings:",
      linkError.message
    );
  }

  return NextResponse.json({ player_id: playerRow.id }, { status: 201 });
}
