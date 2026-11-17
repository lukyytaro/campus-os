import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Tujuan tautan konfirmasi email Supabase (?code=...).
 * Menukar code menjadi sesi, lalu mengarahkan ke Beranda.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Code tidak valid / kedaluwarsa / Supabase belum dikonfigurasi.
  return NextResponse.redirect(`${origin}/login?confirmed=0`);
}
