import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True bila env var Supabase sudah diisi. Aplikasi tetap me-render
 *  pesan setup yang jelas bila false — tidak pernah crash. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let browserClient: SupabaseClient | null | undefined;

/** Client Supabase untuk komponen client. Mengembalikan null bila
 *  env var belum diisi. */
export function createClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient === undefined) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
