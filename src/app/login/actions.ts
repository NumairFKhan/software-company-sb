"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function sendMagicLink(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    redirect("/login?error=Email+is+required");
  }

  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?message=Check+your+email+for+the+magic+link");
}
