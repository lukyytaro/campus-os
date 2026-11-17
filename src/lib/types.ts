/** Tipe baris database — nama kolom mengikuti supabase/schema.sql. */

export type ThemeChoice = "system" | "light" | "dark";
export type TaskPriority = "rendah" | "sedang" | "tinggi";
export type TaskStatus = "belum" | "proses" | "selesai";
export type ScheduleType = "kuliah" | "uts" | "uas" | "agenda";

export interface Profile {
  id: string;
  full_name: string;
  program: string;
  campus: string;
  active_semester: number;
  theme: ThemeChoice;
  /** Kapan data contoh di-seed (null = belum pernah). */
  seeded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  code: string;
  lecturer: string;
  semester: number;
  sks: number;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  type: ScheduleType;
  day_of_week: number | null; // 1 = Senin .. 7 = Minggu
  event_date: string | null; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string;
  room: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  description: string;
  due_date: string; // ISO timestamptz
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  content: string;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Grade {
  id: string;
  user_id: string;
  course_id: string;
  semester: number;
  score: number; // 0 – 4
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  semester: number;
  target_hours_per_week: number;
  created_at: string;
  updated_at: string;
}

export interface StudyLog {
  id: string;
  user_id: string;
  course_id: string | null;
  log_date: string; // YYYY-MM-DD
  minutes: number;
  created_at: string;
}

/** Nilai gabungan nilai + mata kuliah, dipakai halaman Nilai & IPK. */
export interface GradeWithCourse extends Grade {
  course: Course | null;
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  belum: "Belum dikerjakan",
  proses: "Dikerjakan",
  selesai: "Selesai",
};

export const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  kuliah: "Kuliah",
  uts: "UTS",
  uas: "UAS",
  agenda: "Agenda",
};

export const DAY_NAMES = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];

export const DAY_NAMES_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

/** Palet warna label mata kuliah (dipakai di kalender & daftar). */
export const COURSE_COLORS = [
  "#2563EB", // biru (aksen utama)
  "#059669", // hijau
  "#D97706", // kuning gelap
  "#DC2626", // merah
  "#7C3AED", // ungu
  "#0891B2", // cyan gelap
  "#DB2777", // pink
  "#65A30D", // lime gelap
];

/** Nama warna Indonesia untuk setiap entri COURSE_COLORS — dipakai
 *  sebagai aria-label radio warna agar screen reader membacakan nama
 *  ("Biru"), bukan kode hex ("#2563EB"). */
export const COURSE_COLOR_NAMES: Record<string, string> = {
  "#2563EB": "Biru",
  "#059669": "Hijau",
  "#D97706": "Kuning gelap",
  "#DC2626": "Merah",
  "#7C3AED": "Ungu",
  "#0891B2": "Cyan gelap",
  "#DB2777": "Pink",
  "#65A30D": "Lime gelap",
};
