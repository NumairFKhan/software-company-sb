"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="ml-2 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
    >
      Sign out
    </button>
  );
}
