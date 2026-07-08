import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Root page — immediately redirects:
 *  - Authenticated users → /dashboard
 *  - Unauthenticated users → /login  (middleware also handles this, belt & suspenders)
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
