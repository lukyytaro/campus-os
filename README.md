# CampusOS

**Your Academic Life, Organized.**

Aplikasi manajemen akademik pribadi untuk mahasiswa: jadwal kuliah, tugas,
catatan materi, nilai, dan IPK dalam satu tempat. Mobile-first (PWA), nyaman
juga di desktop, seluruh antarmuka berbahasa Indonesia.

## Fitur

- **Autentikasi** — Daftar & masuk dengan email + password (Supabase Auth).
  Data contoh Semester 3 disiapkan otomatis untuk akun baru. Tautan
  konfirmasi yang kedaluwarsa menampilkan pesan jelas dan tombol kirim
  ulang tautan.
- **Dashboard** — IPK, jadwal hari ini, deadline mendekat, progres target
  belajar mingguan, dan progres tugas.
- **Jadwal & Kalender** — Kuliah rutin mingguan (Senin–Jumat) dan kalender
  bulanan untuk UTS, UAS, dan agenda kampus.
- **Tugas & Deadline** — Filter berdasarkan status, prioritas, dan mata
  kuliah; sortir berdasarkan deadline/prioritas/judul; export CSV dan
  Excel (.xlsx).
- **Catatan Materi** — Catatan per mata kuliah dengan lampiran file/gambar
  (Supabase Storage, privat per pengguna).
- **Nilai & IPK** — Kalkulator IP/IPK otomatis dengan bobot SKS
  (IP = Σ(nilai × SKS) / Σ SKS), validasi nilai 0–4, chart perkembangan IP
  per semester, export CSV dan Excel (.xlsx).
- **Target & Statistik** — Target jam belajar per minggu, pencatatan jam
  belajar harian, chart jam belajar per minggu dan progres tugas.
- **Pencarian** — Cari lintas tugas, catatan, jadwal, dan mata kuliah.
  Setiap hasil membuka itemnya langsung (tugas/catatan dibuka di editor,
  jadwal disorot di tempatnya, mata kuliah disorot di halaman nilai).
- **Pengaturan** — Profil (nama, program studi, kampus, semester aktif),
  tema Sistem/Terang/Gelap, pengingat deadline (notifikasi browser —
  diperiksa di halaman mana pun saat aplikasi dibuka dan berkala selama
  aplikasi terbuka), backup data (JSON), dan Reset ke data contoh
  (termasuk lampiran catatan di Storage).
- **Dark mode** mengikuti preferensi sistem (dapat diubah di Pengaturan).
- **PWA** — Dapat diinstal ke layar utama (manifest + service worker
  minimal tanpa caching).

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Supabase (Auth, PostgreSQL + RLS, Storage) · Recharts.

## Setup

> **Sudah tersambung ke Supabase.** Proyek **CampusOS** sudah dibuat
> (region Singapore, paket Free) dan skema database sudah dijalankan —
> kedelapan tabel + bucket Storage `note-attachments` sudah ada.
> File `.env.local` di paket ini sudah berisi Project URL dan anon key,
> jadi langkah 3, 4, dan 6 di bawah sudah selesai. Tinggal install
> dependensi (langkah 2) dan jalankan (langkah 7), lalu daftar akun
> baru di aplikasi. Dashboard proyek:
> https://supabase.com/dashboard/project/njlxlzmwglexgwkxjdkm
>
> Catatan: secara default Supabase mengharuskan konfirmasi email saat
> daftar — cek inbox Gmail dan klik link konfirmasinya sebelum masuk.
> Bila ingin langsung masuk tanpa konfirmasi, matikan **Confirm email**
> di Supabase → Authentication → Sign In / Providers → Email
> (lihat langkah 5).

### 1. Prasyarat

- Node.js 20+ dan npm.
- Akun Supabase gratis di [supabase.com](https://supabase.com).

### 2. Install dependensi

```bash
npm install
```

### 3. Buat proyek Supabase — ✅ sudah selesai

Proyek **CampusOS** sudah dibuat di organisasi CampusOSS (Free,
Singapore). Langkah di bawah ini hanya referensi bila suatu saat
kamu membuat proyek baru:

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard) → **New
   project**. Beri nama (mis. `campus-os`), pilih region terdekat
   (mis. Singapore), dan atur database password.
2. Tunggu hingga proyek selesai dibuat.
3. Buka **Settings → API**, salin:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Jalankan skema database — ✅ sudah selesai

Skema sudah dijalankan di proyek CampusOS (kedelapan tabel +
bucket `note-attachments` terverifikasi ada). Langkah di bawah ini
hanya referensi bila suatu saat kamu membuat proyek baru:

1. Di Dashboard Supabase, buka **SQL Editor → New query**.
2. Tempel seluruh isi file `supabase/schema.sql` dari repo ini.
3. Klik **Run**.

Skema ini membuat:

- Tabel `profiles` (termasuk kolom `seeded_at` — penanda server bahwa
  data contoh sudah pernah di-seed, agar tidak di-seed ulang di
  browser/perangkat baru), `courses`, `schedules`, `tasks`, `notes`,
  `grades`, `goals`, dan `study_logs` (log jam belajar harian — data
  pendukung fitur target belajar & chart jam belajar).
- Menjalankan ulang `schema.sql` di proyek lama aman (idempotent) dan
  menambahkan kolom `seeded_at` bila belum ada.
- **Row Level Security (RLS)** di semua tabel: tiap pengguna hanya bisa
  mengakses datanya sendiri (`auth.uid() = user_id`).
- Trigger pembuatan profil otomatis saat signup dan trigger `updated_at`.
- Bucket Storage privat `note-attachments` beserta policy-nya (tiap
  pengguna hanya mengakses file di foldernya sendiri).

### 5. Atur Authentication

1. Buka **Authentication → Sign In / Providers**.
2. Pastikan **Email** aktif.
3. (Opsional) Di **Authentication → Sign In / Providers → Email**, matikan
   **Confirm email** bila ingin pengguna bisa langsung masuk setelah
   daftar tanpa konfirmasi email. Bila tetap aktif, aplikasi sudah
   menangani alur konfirmasi lewat `/auth/confirm`.
4. Di **Authentication → URL Configuration**, pastikan **Site URL** berisi
   URL aplikasimu (mis. `http://localhost:3000` saat development, atau
   domain Vercel saat production).

### 6. Isi variabel lingkungan — ✅ sudah selesai

File `.env.local` di paket ini sudah berisi Project URL dan anon key
proyek CampusOS. Bila suatu saat kamu membuat proyek baru, salin
`.env.example` menjadi `.env.local` dan isi:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 7. Jalankan lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000), daftar akun baru, dan
data contoh Semester 3 akan disiapkan otomatis.

> **Catatan:** Bila `.env.local` belum diisi, aplikasi tetap berjalan dan
> menampilkan panduan setup di halaman utama — tidak crash.

## Deploy ke Vercel

1. Push repo ini ke GitHub/GitLab/Bitbucket.
2. Di [vercel.com](https://vercel.com), pilih **Add New → Project** dan
   import repo tersebut.
3. Di **Environment Variables**, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Klik **Deploy**.
5. Setelah deploy, kembali ke Supabase → **Authentication → URL
   Configuration**, isi **Site URL** dengan domain Vercel-mu
   (mis. `https://campus-os.vercel.app`) dan tambahkan domain itu ke
   **Redirect URLs**.

## Struktur proyek

```
campus-os/
├── supabase/schema.sql          # Skema PostgreSQL + RLS + Storage
├── public/
│   ├── manifest.json            # Manifest PWA
│   ├── sw.js                    # Service worker minimal (tanpa caching)
│   └── icons/                   # Ikon aplikasi
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Layout root (tema, font, metadata PWA)
│   │   ├── (auth)/login         # Halaman masuk
│   │   ├── (auth)/register      # Halaman daftar
│   │   ├── auth/confirm/        # Route konfirmasi email
│   │   └── (main)/              # Halaman terproteksi login
│   │       ├── page.tsx         # Dashboard
│   │       ├── jadwal/          # Jadwal & Kalender
│   │       ├── tugas/           # Tugas & Deadline
│   │       ├── catatan/         # Catatan Materi
│   │       ├── nilai/           # Nilai & IPK
│   │       ├── target/          # Target & Statistik
│   │       ├── cari/            # Pencarian
│   │       └── pengaturan/      # Pengaturan
│   ├── components/              # AppShell, UI kit, ikon SVG, chart
│   ├── lib/
│   │   ├── supabase/            # Client browser/server + proxy sesi
│   │   ├── seed.ts              # Data contoh Semester 3 + reset
│   │   ├── gpa.ts               # Perhitungan IP/IPK (bobot SKS)
│   │   ├── csv.ts               # Export CSV & backup JSON
│   │   ├── xlsx.ts              # Export .xlsx (writer ZIP/XML tanpa dependensi)
│   │   ├── errors.ts            # Pemeta pesan error ke Bahasa Indonesia
│   │   ├── reminders.ts         # Pengingat deadline (Notification API)
│   │   └── format.ts            # Format tanggal/angka id-ID
│   └── proxy.ts                 # Refresh sesi Supabase (Next.js 16)
└── README.md
```

## Perintah

| Perintah          | Kegunaan                        |
| ----------------- | ------------------------------- |
| `npm run dev`     | Server development              |
| `npm run build`   | Build production (type-check)   |
| `npm run start`   | Jalankan hasil build production |
| `npm run lint`    | Lint dengan ESLint              |

## Data contoh

Akun baru otomatis menerima data contoh Semester 3 (Teknik Informatika):

- 5 mata kuliah: Basis Data, Pemrograman Web, Sistem Informasi Manajemen,
  Statistika, Bahasa Inggris — plus riwayat ringan Semester 1–2 agar
  chart IP punya lebih dari satu titik.
- Jadwal kuliah Senin–Jumat, UTS/UAS, dan agenda kampus.
- 8 tugas dengan prioritas dan deadline berbeda.
- Nilai per mata kuliah dengan SKS, 3 catatan materi, dan target belajar
  10 jam/minggu.

Tombol **Reset ke data contoh** di Pengaturan menghapus semua data
pengguna lalu memasukkan ulang data contoh ini (dengan dialog konfirmasi).
