import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

/** Next.js 16: file convention `middleware` diganti `proxy`.
 *  Satu-satunya tugas proxy di sini adalah menyegarkan sesi Supabase;
 *  pengalihan ke /login ditangani AppShell di sisi client. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Jalankan di semua route kecuali aset statis dan file internal Next.
     * Pola resmi dari dokumentasi Supabase untuk Next.js.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
