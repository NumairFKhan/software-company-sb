/**
 * Coach sign-up endpoint.
 * Creates a Supabase auth user and inserts a coaches row via the service-role
 * client (bypasses RLS for the initial insert).
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email, password, full_name } = await request.json();

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: "email, password and full_name are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();

  // 1. Create auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for simplicity; use magic link in prod
    });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Failed to create user" },
      { status: 400 }
    );
  }

  // 2. Insert coaches profile row
  const { error: profileError } = await supabase.from("coaches").insert({
    user_id: authData.user.id,
    email,
    full_name,
  });

  if (profileError) {
    // Roll back: delete the auth user so we don't leave orphaned rows
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ user_id: authData.user.id }, { status: 201 });
}
