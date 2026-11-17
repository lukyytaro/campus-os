/**
 * Pemeta pesan error ke Bahasa Indonesia (M5).
 *
 * Seluruh teks UI CampusOS berbahasa Indonesia — termasuk pesan error.
 * Supabase / PostgREST / fetch melempar pesan berbahasa Inggris mentah
 * ("Failed to fetch", "duplicate key value violates unique constraint",
 * "new row violates row-level security policy", ...). Jangan pernah
 * menempel `error.message` mentah ke toast, banner, atau form: lewatkan
 * selalu lewat `translateError` di sini.
 *
 * Aturan pemetaan: kenali pola pesan yang umum, kembalikan kalimat
 * Indonesia yang menjelaskan apa yang terjadi dan apa yang bisa
 * dilakukan pengguna. Pesan yang tidak dikenali jatuh ke fallback
 * generik berbahasa Indonesia — tidak pernah bocor mentah.
 */

const GENERIC_MESSAGE = "Terjadi kesalahan. Coba lagi.";

interface ErrorPattern {
  match: RegExp;
  message: string;
}

const PATTERNS: ErrorPattern[] = [
  // -- Jaringan ---------------------------------------------------------
  {
    match: /failed to fetch|network request failed|networkerror|fetch failed|timeout|timed out/i,
    message:
      "Tidak dapat terhubung ke server. Periksa koneksi internetmu, lalu coba lagi.",
  },
  {
    match: /load failed|connection refused|econnrefused|enotfound|socket/i,
    message:
      "Tidak dapat terhubung ke server. Periksa koneksi internetmu, lalu coba lagi.",
  },
  // -- Sesi / autentikasi -----------------------------------------------
  {
    match: /invalid login credentials|invalid email or password/i,
    message: "Email atau kata sandi salah. Periksa kembali, lalu coba lagi.",
  },
  {
    match: /email not confirmed/i,
    message:
      "Email belum dikonfirmasi. Buka tautan konfirmasi yang dikirim ke emailmu.",
  },
  {
    match: /user already registered|already registered|email address.*already/i,
    message: "Email ini sudah terdaftar. Silakan masuk.",
  },
  {
    match: /invalid email|unable to validate email/i,
    message: "Format email tidak valid. Periksa kembali alamat emailmu.",
  },
  {
    match: /password should be|password.*at least \d+ characters|weak password/i,
    message: "Kata sandi minimal 6 karakter.",
  },
  {
    match: /same password/i,
    message: "Kata sandi baru tidak boleh sama dengan kata sandi lama.",
  },
  {
    match: /email rate limit|too many requests|rate limit exceeded|too many login attempts/i,
    message:
      "Terlalu banyak percobaan dalam waktu singkat. Tunggu sebentar, lalu coba lagi.",
  },
  {
    match: /otp expired|expired.*otp|invalid.*otp|token.*expired|expired.*token/i,
    message:
      "Tautan atau kode sudah kedaluwarsa. Minta tautan baru, lalu coba lagi.",
  },
  {
    match: /jwt expired|invalid jwt|auth session missing|session.*expired|not authenticated|user not found/i,
    message: "Sesimu sudah berakhir. Silakan masuk kembali.",
  },
  {
    match: /email link is invalid|invalid.*confirmation/i,
    message:
      "Tautan konfirmasi tidak valid atau sudah kedaluwarsa. Minta tautan baru.",
  },
  // -- PostgREST / database ---------------------------------------------
  {
    match: /duplicate key value|unique constraint|already exists/i,
    message: "Data ini sudah ada. Periksa kembali isianmu.",
  },
  {
    match: /row-level security|rls|permission denied|not authorized|unauthorized/i,
    message:
      "Kamu tidak punya akses ke data ini. Coba muat ulang halaman atau masuk kembali.",
  },
  {
    match: /violates check constraint|check constraint/i,
    message:
      "Isian tidak memenuhi aturan yang berlaku (mis. nilai di luar rentang). Periksa kembali isianmu.",
  },
  {
    match: /violates foreign key|foreign key constraint/i,
    message: "Data terkait tidak ditemukan. Muat ulang halaman, lalu coba lagi.",
  },
  {
    match: /violates not-null constraint|null value in column/i,
    message: "Ada kolom wajib yang masih kosong. Lengkapi isianmu.",
  },
  {
    match: /result contains 0 rows|pgrst116|no rows|not found/i,
    message: "Data tidak ditemukan. Mungkin sudah dihapus.",
  },
  {
    match: /relation .* does not exist|table .* does not exist|schema.*not.*exist|42p01/i,
    message:
      "Tabel database belum dibuat. Jalankan file supabase/schema.sql di SQL Editor Supabase.",
  },
  {
    match: /invalid input syntax|invalid.*uuid|22p02/i,
    message: "Format data tidak valid. Periksa kembali isianmu.",
  },
  // -- Storage ----------------------------------------------------------
  {
    match: /bucket not found|bucket.*does not exist/i,
    message:
      "Bucket penyimpanan belum dibuat. Jalankan file supabase/schema.sql di SQL Editor Supabase.",
  },
  {
    match: /file.*too large|exceeds.*limit|payload too large/i,
    message: "Ukuran file terlalu besar. Pilih file yang lebih kecil.",
  },
  {
    match: /storage.*not found|object not found/i,
    message: "File tidak ditemukan. Mungkin sudah dihapus.",
  },
];

/**
 * Terjemahkan error apa pun (Error, PostgrestError, string, unknown)
 * menjadi pesan Bahasa Indonesia yang aman ditampilkan ke pengguna.
 * `fallback` dipakai bila tidak ada pola yang cocok.
 */
export function translateError(
  err: unknown,
  fallback: string = GENERIC_MESSAGE,
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  if (!raw) return fallback;
  for (const { match, message } of PATTERNS) {
    if (match.test(raw)) return message;
  }
  return fallback;
}
