-- ============================================================================
-- CampusOS — Skema Database PostgreSQL (Supabase)
-- ============================================================================
-- Cara pakai:
--   1. Buat proyek baru di Supabase (https://supabase.com/dashboard).
--   2. Buka SQL Editor di proyek tersebut, tempel seluruh isi file ini,
--      lalu klik Run.
--   3. Selesai — tabel, RLS, trigger, dan bucket Storage sudah dibuat.
--
-- Prinsip: setiap baris data dimiliki oleh satu pengguna (kolom user_id).
-- Row Level Security (RLS) memastikan pengguna hanya bisa melihat dan
-- mengubah datanya sendiri. Semua query dari aplikasi berjalan sebagai
-- peran "authenticated" dengan auth.uid() = id pengguna yang login.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------------

-- Perbarui kolom updated_at secara otomatis setiap kali baris diubah.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Buat baris profil otomatis saat pengguna baru mendaftar lewat Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, program, campus, active_semester)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'program', ''),
    coalesce(new.raw_user_meta_data ->> 'campus', ''),
    coalesce((new.raw_user_meta_data ->> 'active_semester')::int, 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — profil pengguna (1 baris per pengguna, id = auth.users.id)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  program text not null default '',        -- program studi, mis. Teknik Informatika
  campus text not null default '',          -- nama kampus
  active_semester int not null default 1 check (active_semester between 1 and 14),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  -- Kapan data contoh di-seed ke akun ini (null = belum pernah).
  -- Penanda di server agar pengguna yang sengaja menghapus semua data
  -- tidak di-seed ulang saat login dari browser/perangkat baru.
  seeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Untuk database yang dibuat dari schema.sql versi lama (tanpa kolom ini):
alter table public.profiles add column if not exists seeded_at timestamptz;

-- ---------------------------------------------------------------------------
-- courses — mata kuliah yang diambil pengguna
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,                       -- mis. Basis Data
  code text not null default '',            -- kode MK, mis. IF301
  lecturer text not null default '',        -- nama dosen pengampu
  semester int not null default 1 check (semester between 1 and 14),
  sks int not null default 2 check (sks between 1 and 6),
  color text not null default '#2563EB',    -- warna label di kalender
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists courses_user_semester_idx
  on public.courses (user_id, semester);

-- ---------------------------------------------------------------------------
-- schedules — jadwal kuliah mingguan + agenda bertanggal (UTS/UAS/agenda)
--   * Jadwal kuliah rutin: isi day_of_week (1=Senin .. 7=Minggu),
--     event_date dibiarkan null.
--   * Agenda bertanggal (UTS, UAS, agenda kampus): isi event_date,
--     day_of_week dibiarkan null.
-- ---------------------------------------------------------------------------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null,                      -- judul, mis. "Kuliah Basis Data" / "UTS Statistika"
  type text not null default 'kuliah'
    check (type in ('kuliah', 'uts', 'uas', 'agenda')),
  day_of_week int check (day_of_week between 1 and 7),
  event_date date,                          -- tanggal khusus untuk uts/uas/agenda
  start_time time not null,                 -- mis. 08:00
  end_time time not null,                   -- mis. 09:40
  room text not null default '',            -- ruangan, mis. R. 301 / Lab 2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_time_order check (end_time > start_time),
  constraint schedules_day_or_date
    check (
      (day_of_week is not null and event_date is null)
      or (day_of_week is null and event_date is not null)
    )
);
create index if not exists schedules_user_idx on public.schedules (user_id);
create index if not exists schedules_user_date_idx
  on public.schedules (user_id, event_date);

-- ---------------------------------------------------------------------------
-- tasks — tugas & deadline
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null,
  description text not null default '',
  due_date timestamptz not null,
  priority text not null default 'sedang'
    check (priority in ('rendah', 'sedang', 'tinggi')),
  status text not null default 'belum'
    check (status in ('belum', 'proses', 'selesai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_due_idx
  on public.tasks (user_id, due_date);
create index if not exists tasks_user_status_idx
  on public.tasks (user_id, status);

-- ---------------------------------------------------------------------------
-- notes — catatan materi, dengan lampiran opsional di Supabase Storage
--   attachment_path berisi path di bucket "note-attachments",
--   format: <user_id>/<nama-file>. File diakses lewat signed URL.
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null,
  content text not null default '',
  attachment_path text,                     -- null bila tanpa lampiran
  attachment_name text,                     -- nama file asli untuk ditampilkan
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes (user_id);

-- ---------------------------------------------------------------------------
-- grades — nilai per mata kuliah (skala 0–4, sesuai bobot SKS di courses)
-- ---------------------------------------------------------------------------
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  semester int not null check (semester between 1 and 14),
  score numeric(3, 2) not null check (score between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grades_one_per_course unique (user_id, course_id)
);
create index if not exists grades_user_semester_idx
  on public.grades (user_id, semester);

-- ---------------------------------------------------------------------------
-- goals — target belajar per semester (jam per minggu)
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  semester int not null check (semester between 1 and 14),
  target_hours_per_week numeric(4, 1) not null default 10
    check (target_hours_per_week between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_one_per_semester unique (user_id, semester)
);

-- ---------------------------------------------------------------------------
-- study_logs — catatan jam belajar harian.
--   Bukan fitur terpisah: data ini yang mengisi progres target belajar
--   dan chart "jam belajar per minggu".
-- ---------------------------------------------------------------------------
create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  log_date date not null default current_date,
  minutes int not null check (minutes between 1 and 1440),
  created_at timestamptz not null default now()
);
create index if not exists study_logs_user_date_idx
  on public.study_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.courses;
create trigger set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.schedules;
create trigger set_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.notes;
create trigger set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.grades;
create trigger set_updated_at
  before update on public.grades
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.goals;
create trigger set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger pembuatan profil otomatis saat signup
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Aturan untuk semua tabel: pengguna hanya bisa mengakses baris miliknya
-- sendiri (user_id = auth.uid(), atau id = auth.uid() untuk profiles).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.schedules enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.grades enable row level security;
alter table public.goals enable row level security;
alter table public.study_logs enable row level security;

-- profiles
drop policy if exists "Pengguna mengelola profilnya sendiri" on public.profiles;
create policy "Pengguna mengelola profilnya sendiri"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- courses
drop policy if exists "Pengguna mengelola mata kuliahnya sendiri" on public.courses;
create policy "Pengguna mengelola mata kuliahnya sendiri"
  on public.courses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- schedules
drop policy if exists "Pengguna mengelola jadwalnya sendiri" on public.schedules;
create policy "Pengguna mengelola jadwalnya sendiri"
  on public.schedules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tasks
drop policy if exists "Pengguna mengelola tugasnya sendiri" on public.tasks;
create policy "Pengguna mengelola tugasnya sendiri"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- notes
drop policy if exists "Pengguna mengelola catatannya sendiri" on public.notes;
create policy "Pengguna mengelola catatannya sendiri"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- grades
drop policy if exists "Pengguna mengelola nilainya sendiri" on public.grades;
create policy "Pengguna mengelola nilainya sendiri"
  on public.grades for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- goals
drop policy if exists "Pengguna mengelola targetnya sendiri" on public.goals;
create policy "Pengguna mengelola targetnya sendiri"
  on public.goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- study_logs
drop policy if exists "Pengguna mengelola log belajarnya sendiri" on public.study_logs;
create policy "Pengguna mengelola log belajarnya sendiri"
  on public.study_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Supabase Storage — bucket lampiran catatan
--   Bucket privat "note-attachments". File disimpan di folder per pengguna:
--   <user_id>/<nama-file>, sehingga policy foldername() membatasi akses
--   hanya ke file milik pengguna itu sendiri.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('note-attachments', 'note-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Pengguna mengunggah lampirannya sendiri"
  on storage.objects;
create policy "Pengguna mengunggah lampirannya sendiri"
  on storage.objects for insert
  with check (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Pengguna melihat lampirannya sendiri"
  on storage.objects;
create policy "Pengguna melihat lampirannya sendiri"
  on storage.objects for select
  using (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Pengguna memperbarui lampirannya sendiri"
  on storage.objects;
create policy "Pengguna memperbarui lampirannya sendiri"
  on storage.objects for update
  using (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Pengguna menghapus lampirannya sendiri"
  on storage.objects;
create policy "Pengguna menghapus lampirannya sendiri"
  on storage.objects for delete
  using (
    bucket_id = 'note-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
