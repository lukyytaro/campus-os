import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateInputValue } from "./format";

/**
 * Data contoh Semester 3 — dimasukkan otomatis ke akun baru (karena RLS
 * membatasi data per pengguna, seed harus berjalan sebagai pengguna itu
 * sendiri) dan dipakai ulang oleh tombol "Reset ke data contoh".
 *
 * Tanggal dibuat relatif terhadap hari seed agar deadline, jadwal UTS/UAS,
 * dan log belajar selalu terasa "saat ini", bukan tanggal basi.
 */

const SEEDED_FLAG = "campusos:seeded";

function daysFromNow(days: number, hour = 23, minute = 59): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

/** True bila akun ini pernah di-seed di browser ini. */
export function wasSeeded(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(`${SEEDED_FLAG}:${userId}`) === "1";
}

function markSeeded(userId: string): void {
  window.localStorage.setItem(`${SEEDED_FLAG}:${userId}`, "1");
}

/** Baca penanda seed dari server (profiles.seeded_at). Null bila belum
 *  pernah di-seed — atau bila kolom belum ada (schema.sql lama). */
async function getSeededAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("seeded_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return (data.seeded_at as string | null) ?? null;
  } catch {
    return null;
  }
}

/** Tandai akun sudah di-seed di server (best-effort). */
async function markSeededServer(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ seeded_at: new Date().toISOString() })
      .eq("id", userId);
  } catch {
    // Abaikan: penanda localStorage tetap mencegah seed ulang di browser ini.
  }
}

/** True bila pengguna sudah punya mata kuliah (dipakai sebagai penanda
 *  "sudah punya data"). */
export async function hasAnyData(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Seed data contoh Semester 3. Idempotent dalam arti: pemanggil
 *  memastikan dulu akun belum punya data (hasAnyData / wasSeeded). */
export async function seedSampleData(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // -- Mata kuliah -------------------------------------------------------
  // Semester 1–2: riwayat ringan supaya chart IP per semester punya
  // lebih dari satu titik.
  const coursesToInsert = [
    // Semester 1
    { user_id: userId, name: "Pengantar Teknologi Informasi", code: "IF101", lecturer: "Dr. Rina Kartika, M.Kom.", semester: 1, sks: 3, color: "#059669" },
    { user_id: userId, name: "Algoritma dan Pemrograman", code: "IF102", lecturer: "Agus Pratama, M.T.", semester: 1, sks: 4, color: "#2563EB" },
    { user_id: userId, name: "Matematika Diskrit", code: "IF103", lecturer: "Dewi Lestari, M.Si.", semester: 1, sks: 3, color: "#D97706" },
    { user_id: userId, name: "Bahasa Indonesia", code: "MKU101", lecturer: "Sari Wulandari, M.Pd.", semester: 1, sks: 2, color: "#0891B2" },
    // Semester 2
    { user_id: userId, name: "Struktur Data", code: "IF201", lecturer: "Agus Pratama, M.T.", semester: 2, sks: 3, color: "#2563EB" },
    { user_id: userId, name: "Organisasi Komputer", code: "IF202", lecturer: "Bambang Setiawan, M.Kom.", semester: 2, sks: 3, color: "#DC2626" },
    { user_id: userId, name: "Kalkulus", code: "IF203", lecturer: "Dewi Lestari, M.Si.", semester: 2, sks: 3, color: "#D97706" },
    { user_id: userId, name: "Pendidikan Kewarganegaraan", code: "MKU201", lecturer: "Hendra Gunawan, M.H.", semester: 2, sks: 2, color: "#059669" },
    // Semester 3 (semester aktif)
    { user_id: userId, name: "Basis Data", code: "IF301", lecturer: "Dr. Ahmad Santoso, M.Kom.", semester: 3, sks: 3, color: "#2563EB" },
    { user_id: userId, name: "Pemrograman Web", code: "IF302", lecturer: "Siti Rahmawati, M.T.", semester: 3, sks: 3, color: "#059669" },
    { user_id: userId, name: "Sistem Informasi Manajemen", code: "IF303", lecturer: "Budi Hartono, M.M.", semester: 3, sks: 2, color: "#D97706" },
    { user_id: userId, name: "Statistika", code: "IF304", lecturer: "Dewi Lestari, M.Si.", semester: 3, sks: 3, color: "#DC2626" },
    { user_id: userId, name: "Bahasa Inggris", code: "MKU305", lecturer: "John Wijaya, M.Pd.", semester: 3, sks: 2, color: "#0891B2" },
  ];

  const { data: courses, error: courseError } = await supabase
    .from("courses")
    .insert(coursesToInsert)
    .select("id, name, semester");
  if (courseError) throw courseError;
  if (!courses) throw new Error("Gagal membuat mata kuliah contoh.");

  const byName = new Map(courses.map((c) => [c.name, c.id]));
  const courseId = (name: string): string => {
    const id = byName.get(name);
    if (!id) throw new Error(`Mata kuliah contoh tidak ditemukan: ${name}`);
    return id;
  };

  // -- Jadwal kuliah rutin Senin–Jumat -----------------------------------
  const schedulesToInsert = [
    { user_id: userId, course_id: courseId("Basis Data"), title: "Kuliah Basis Data", type: "kuliah", day_of_week: 1, event_date: null, start_time: "08:00", end_time: "09:40", room: "R. 301" },
    { user_id: userId, course_id: courseId("Pemrograman Web"), title: "Kuliah Pemrograman Web", type: "kuliah", day_of_week: 1, event_date: null, start_time: "10:00", end_time: "11:40", room: "Lab 2" },
    { user_id: userId, course_id: courseId("Statistika"), title: "Kuliah Statistika", type: "kuliah", day_of_week: 2, event_date: null, start_time: "08:00", end_time: "09:40", room: "R. 205" },
    { user_id: userId, course_id: courseId("Sistem Informasi Manajemen"), title: "Kuliah Sistem Informasi Manajemen", type: "kuliah", day_of_week: 2, event_date: null, start_time: "13:00", end_time: "14:40", room: "R. 102" },
    { user_id: userId, course_id: courseId("Pemrograman Web"), title: "Kuliah Pemrograman Web", type: "kuliah", day_of_week: 3, event_date: null, start_time: "08:00", end_time: "09:40", room: "Lab 2" },
    { user_id: userId, course_id: courseId("Basis Data"), title: "Kuliah Basis Data", type: "kuliah", day_of_week: 3, event_date: null, start_time: "10:00", end_time: "11:40", room: "R. 301" },
    { user_id: userId, course_id: courseId("Sistem Informasi Manajemen"), title: "Kuliah Sistem Informasi Manajemen", type: "kuliah", day_of_week: 4, event_date: null, start_time: "08:00", end_time: "09:40", room: "R. 102" },
    { user_id: userId, course_id: courseId("Bahasa Inggris"), title: "Kuliah Bahasa Inggris", type: "kuliah", day_of_week: 4, event_date: null, start_time: "10:00", end_time: "11:40", room: "R. 401" },
    { user_id: userId, course_id: courseId("Statistika"), title: "Kuliah Statistika", type: "kuliah", day_of_week: 5, event_date: null, start_time: "08:00", end_time: "09:40", room: "R. 205" },
    { user_id: userId, course_id: courseId("Bahasa Inggris"), title: "Kuliah Bahasa Inggris", type: "kuliah", day_of_week: 5, event_date: null, start_time: "13:00", end_time: "14:40", room: "R. 401" },
    // Agenda bertanggal: UTS, UAS, dan agenda kampus
    { user_id: userId, course_id: courseId("Basis Data"), title: "UTS Basis Data", type: "uts", day_of_week: null, event_date: dateDaysFromNow(14), start_time: "08:00", end_time: "10:00", room: "R. 301" },
    { user_id: userId, course_id: courseId("Statistika"), title: "UTS Statistika", type: "uts", day_of_week: null, event_date: dateDaysFromNow(16), start_time: "08:00", end_time: "10:00", room: "R. 205" },
    { user_id: userId, course_id: courseId("Pemrograman Web"), title: "UTS Pemrograman Web", type: "uts", day_of_week: null, event_date: dateDaysFromNow(18), start_time: "10:00", end_time: "12:00", room: "Lab 2" },
    { user_id: userId, course_id: null, title: "Seminar: Karier di Bidang Data", type: "agenda", day_of_week: null, event_date: dateDaysFromNow(10), start_time: "13:00", end_time: "15:00", room: "Aula Utama" },
    { user_id: userId, course_id: courseId("Basis Data"), title: "UAS Basis Data", type: "uas", day_of_week: null, event_date: dateDaysFromNow(42), start_time: "08:00", end_time: "10:00", room: "R. 301" },
  ];
  const { error: scheduleError } = await supabase
    .from("schedules")
    .insert(schedulesToInsert);
  if (scheduleError) throw scheduleError;

  // -- Tugas (8) ----------------------------------------------------------
  const tasksToInsert = [
    { user_id: userId, course_id: courseId("Statistika"), title: "Kuis Statistika bab 4: distribusi peluang", description: "Kuis 10 soal pilihan ganda di e-learning. Materi: distribusi binomial dan normal. Kerjakan sebelum kuliah dimulai.", due_date: daysFromNow(1, 7, 30), priority: "tinggi", status: "belum" },
    { user_id: userId, course_id: courseId("Basis Data"), title: "Laporan praktikum normalisasi basis data", description: "Normalisasi skema perpustakaan sampai 3NF, sertakan diagram relasi dan penjelasan setiap langkah.", due_date: daysFromNow(2), priority: "tinggi", status: "proses" },
    { user_id: userId, course_id: courseId("Sistem Informasi Manajemen"), title: "Presentasi studi kasus ERP", description: "Kelompok 4, presentasi 15 menit: implementasi ERP di perusahaan manufaktur. Siapkan slide dan contoh alur proses bisnis.", due_date: daysFromNow(4, 12, 0), priority: "sedang", status: "belum" },
    { user_id: userId, course_id: courseId("Pemrograman Web"), title: "Tugas kelompok: wireframe aplikasi web", description: "Buat wireframe 5 halaman untuk aplikasi pemesanan kantin. Kumpulkan file Figma dan tautan prototipe.", due_date: daysFromNow(5), priority: "sedang", status: "belum" },
    { user_id: userId, course_id: courseId("Basis Data"), title: "Tugas individu: ERD sistem perpustakaan", description: "Gambar ERD lengkap dengan kardinalitas: anggota, buku, peminjaman, dan denda.", due_date: daysFromNow(6), priority: "sedang", status: "belum" },
    { user_id: userId, course_id: courseId("Bahasa Inggris"), title: "Essay: technology in education", description: "Essay 500 kata tentang peran teknologi dalam pendidikan. Perhatikan struktur paragraf dan sitasi.", due_date: daysFromNow(7), priority: "rendah", status: "belum" },
    { user_id: userId, course_id: courseId("Statistika"), title: "Latihan soal regresi linear", description: "Kerjakan soal 1–8 dari buku paket bab 6. Tuliskan langkah perhitungan, bukan hanya jawaban akhir.", due_date: daysFromNow(9), priority: "rendah", status: "belum" },
    { user_id: userId, course_id: courseId("Pemrograman Web"), title: "Proyek akhir: CRUD dengan PHP & MySQL", description: "Aplikasi CRUD inventaris lab: tambah, ubah, hapus, dan cari data barang. Sertakan laporan singkat dan demo.", due_date: daysFromNow(12), priority: "tinggi", status: "belum" },
  ];
  const { error: taskError } = await supabase.from("tasks").insert(tasksToInsert);
  if (taskError) throw taskError;

  // -- Catatan materi (3) -------------------------------------------------
  const notesToInsert = [
    {
      user_id: userId,
      course_id: courseId("Basis Data"),
      title: "Normalisasi: 1NF sampai 3NF",
      content: `Normalisasi adalah proses menyusun skema tabel agar terhindar dari anomali penyisipan, pembaruan, dan penghapusan.

1NF (First Normal Form)
- Setiap sel berisi nilai atomik, tidak ada grup berulang.
- Contoh: kolom "no_hp" yang berisi dua nomor harus dipecah menjadi tabel terpisah.

2NF (Second Normal Form)
- Sudah 1NF, dan tidak ada ketergantungan parsial terhadap kunci primer komposit.
- Atribut non-kunci harus bergantung penuh pada seluruh kunci primer.

3NF (Third Normal Form)
- Sudah 2NF, dan tidak ada ketergantungan transitif.
- Contoh: tabel Mahasiswa (nim, nama, kode_jurusan, nama_jurusan) — nama_jurusan bergantung pada kode_jurusan, bukan langsung pada nim, jadi harus dipindah ke tabel Jurusan.

Tips ujian: selalu tentukan dulu kunci primer dan ketergantungan fungsionalnya, baru uji satu per satu bentuk normalnya.`,
    },
    {
      user_id: userId,
      course_id: courseId("Pemrograman Web"),
      title: "HTTP methods & REST API",
      content: `REST API memakai method HTTP untuk menyatakan aksi terhadap sebuah resource.

- GET — membaca data. Aman dan idempotent, tidak mengubah keadaan server.
- POST — membuat resource baru. Tidak idempotent: mengirim dua kali bisa membuat dua data.
- PUT — mengganti seluruh resource. Idempotent.
- PATCH — mengubah sebagian field resource.
- DELETE — menghapus resource.

Kode status yang sering muncul:
- 200 OK, 201 Created, 204 No Content
- 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found
- 500 Internal Server Error

Praktik baik: nama endpoint memakai kata benda jamak (/mahasiswa, bukan /ambilMahasiswa), dan respons error selalu menyertakan pesan yang jelas.`,
    },
    {
      user_id: userId,
      course_id: courseId("Statistika"),
      title: "Uji hipotesis & distribusi normal",
      content: `Langkah uji hipotesis:
1. Tentukan H0 (hipotesis nol) dan H1 (hipotesis alternatif).
2. Pilih taraf signifikansi, biasanya alpha = 0,05.
3. Hitung statistik uji (z atau t) dari data sampel.
4. Bandingkan dengan nilai kritis, atau lihat p-value.
5. Keputusan: tolak H0 bila p-value < alpha.

Distribusi normal:
- Berbentuk lonceng, simetris terhadap rata-rata.
- Aturan empiris: 68% data dalam 1 simpangan baku, 95% dalam 2 simpangan baku, 99,7% dalam 3 simpangan baku.
- Nilai z = (x - rata-rata) / simpangan baku, dipakai untuk menghitung peluang lewat tabel z.

Catatan: uji-t dipakai saat simpangan baku populasi tidak diketahui dan sampel kecil (n < 30).`,
    },
  ];
  const { error: noteError } = await supabase.from("notes").insert(notesToInsert);
  if (noteError) throw noteError;

  // -- Nilai ----------------------------------------------------------------
  // Semester 1: IP 3,54 | Semester 2: IP 3,27 | Semester 3: IP 3,42
  const gradesToInsert = [
    { user_id: userId, course_id: courseId("Pengantar Teknologi Informasi"), semester: 1, score: 3.5 },
    { user_id: userId, course_id: courseId("Algoritma dan Pemrograman"), semester: 1, score: 3.75 },
    { user_id: userId, course_id: courseId("Matematika Diskrit"), semester: 1, score: 3.0 },
    { user_id: userId, course_id: courseId("Bahasa Indonesia"), semester: 1, score: 4.0 },
    { user_id: userId, course_id: courseId("Struktur Data"), semester: 2, score: 3.25 },
    { user_id: userId, course_id: courseId("Organisasi Komputer"), semester: 2, score: 3.5 },
    { user_id: userId, course_id: courseId("Kalkulus"), semester: 2, score: 2.75 },
    { user_id: userId, course_id: courseId("Pendidikan Kewarganegaraan"), semester: 2, score: 3.75 },
    { user_id: userId, course_id: courseId("Basis Data"), semester: 3, score: 3.5 },
    { user_id: userId, course_id: courseId("Pemrograman Web"), semester: 3, score: 3.75 },
    { user_id: userId, course_id: courseId("Sistem Informasi Manajemen"), semester: 3, score: 3.0 },
    { user_id: userId, course_id: courseId("Statistika"), semester: 3, score: 3.25 },
    { user_id: userId, course_id: courseId("Bahasa Inggris"), semester: 3, score: 3.5 },
  ];
  const { error: gradeError } = await supabase.from("grades").insert(gradesToInsert);
  if (gradeError) throw gradeError;

  // -- Target belajar: 10 jam per minggu ------------------------------------
  const { error: goalError } = await supabase.from("goals").insert({
    user_id: userId,
    semester: 3,
    target_hours_per_week: 10,
  });
  if (goalError) throw goalError;

  // -- Log belajar: minggu ini (7,5 jam dari target 10 jam) + 2 minggu lalu --
  const logsToInsert = [
    { user_id: userId, course_id: courseId("Basis Data"), log_date: dateDaysFromNow(-6), minutes: 60 },
    { user_id: userId, course_id: courseId("Pemrograman Web"), log_date: dateDaysFromNow(-5), minutes: 90 },
    { user_id: userId, course_id: courseId("Statistika"), log_date: dateDaysFromNow(-4), minutes: 45 },
    { user_id: userId, course_id: courseId("Basis Data"), log_date: dateDaysFromNow(-3), minutes: 120 },
    { user_id: userId, course_id: courseId("Pemrograman Web"), log_date: dateDaysFromNow(-2), minutes: 75 },
    { user_id: userId, course_id: courseId("Bahasa Inggris"), log_date: dateDaysFromNow(-1), minutes: 60 },
    { user_id: userId, course_id: courseId("Statistika"), log_date: dateDaysFromNow(-8), minutes: 90 },
    { user_id: userId, course_id: courseId("Pemrograman Web"), log_date: dateDaysFromNow(-9), minutes: 120 },
    { user_id: userId, course_id: courseId("Basis Data"), log_date: dateDaysFromNow(-10), minutes: 60 },
    { user_id: userId, course_id: courseId("Sistem Informasi Manajemen"), log_date: dateDaysFromNow(-12), minutes: 45 },
    { user_id: userId, course_id: courseId("Statistika"), log_date: dateDaysFromNow(-15), minutes: 120 },
    { user_id: userId, course_id: courseId("Pemrograman Web"), log_date: dateDaysFromNow(-16), minutes: 90 },
  ];
  const { error: logError } = await supabase.from("study_logs").insert(logsToInsert);
  if (logError) throw logError;

  // -- Profil: isi program studi & kampus contoh bila masih kosong ----------
  const { data: profile } = await supabase
    .from("profiles")
    .select("program, campus, active_semester")
    .eq("id", userId)
    .maybeSingle();
  if (profile) {
    await supabase
      .from("profiles")
      .update({
        program: profile.program || "Teknik Informatika",
        campus: profile.campus || "Universitas Brawijaya",
        active_semester: 3,
        seeded_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  markSeeded(userId);
}

/** Hapus semua data pengguna, lalu seed ulang data contoh.
 *  Dipanggil tombol "Reset ke data contoh" setelah dialog konfirmasi. */
export async function resetToSampleData(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Urutan penting: hapus tabel anak dulu (FK mengarah ke courses).
  const tables = [
    "study_logs",
    "grades",
    "tasks",
    "notes",
    "schedules",
    "goals",
    "courses",
  ] as const;
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId);
    if (error) throw error;
  }
  // Hapus juga lampiran catatan di Storage agar tidak yatim (m13).
  // Best-effort: kegagalan membersihkan Storage tidak menggagalkan reset.
  try {
    const { data: files } = await supabase.storage
      .from("note-attachments")
      .list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      await supabase.storage
        .from("note-attachments")
        .remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch {
    // Abaikan — file lama di bucket privat hanya bisa diakses pemiliknya.
  }
  await seedSampleData(supabase, userId);
}

/** Seed otomatis untuk akun baru: hanya bila belum pernah di-seed —
 *  dicek lewat penanda server (profiles.seeded_at) agar bertahan di
 *  browser/perangkat baru, lalu penanda lokal, lalu keberadaan data. */
export async function seedIfNewUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (wasSeeded(userId)) return false;
  if (await getSeededAt(supabase, userId)) {
    markSeeded(userId);
    return false;
  }
  if (await hasAnyData(supabase, userId)) {
    await markSeededServer(supabase, userId);
    markSeeded(userId);
    return false;
  }
  await seedSampleData(supabase, userId);
  return true;
}
