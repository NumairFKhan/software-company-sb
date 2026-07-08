import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT static files, images, and Next internals:
     *   - _next/static  (static chunks)
     *   - _next/image   (image optimisation)
     *   - favicon.ico, manifest.json, icons/**
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
