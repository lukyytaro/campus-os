import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Course,
  Grade,
  Goal,
  Note,
  Profile,
  Schedule,
  StudyLog,
  Task,
} from "./types";

/**
 * Lapisan akses data (client-side, lewat Supabase browser client).
 * Semua query dibatasi RLS ke user_id = auth.uid() di server; pemanggil
 * tetap mengirim user_id eksplisit saat insert.
 */

export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Buat baris profil bila belum ada (cadangan bila trigger
 *  handle_new_user belum berjalan di proyek Supabase). */
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile> {
  const existing = await fetchProfile(supabase, userId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId, full_name: "", program: "", campus: "", active_semester: 1 })
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Pick<Profile, "full_name" | "program" | "campus" | "active_semester" | "theme">>,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (error) throw error;
}

export async function fetchCourses(
  supabase: SupabaseClient,
  userId: string,
): Promise<Course[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("user_id", userId)
    .order("semester", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function fetchSchedules(
  supabase: SupabaseClient,
  userId: string,
): Promise<Schedule[]> {
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", userId)
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Schedule[];
}

export async function fetchTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function fetchNotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function fetchGrades(
  supabase: SupabaseClient,
  userId: string,
): Promise<Grade[]> {
  const { data, error } = await supabase
    .from("grades")
    .select("*")
    .eq("user_id", userId)
    .order("semester", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Grade[];
}

export async function fetchGoals(
  supabase: SupabaseClient,
  userId: string,
): Promise<Goal[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("semester", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Goal[];
}

export async function fetchStudyLogs(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudyLog[]> {
  const { data, error } = await supabase
    .from("study_logs")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudyLog[];
}

/** Unduh semua data pengguna sekaligus (untuk backup JSON di Pengaturan). */
export async function fetchAllUserData(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const [profile, courses, schedules, tasks, notes, grades, goals, studyLogs] =
    await Promise.all([
      fetchProfile(supabase, userId),
      fetchCourses(supabase, userId),
      fetchSchedules(supabase, userId),
      fetchTasks(supabase, userId),
      fetchNotes(supabase, userId),
      fetchGrades(supabase, userId),
      fetchGoals(supabase, userId),
      fetchStudyLogs(supabase, userId),
    ]);
  return {
    app: "CampusOS",
    exported_at: new Date().toISOString(),
    profile,
    courses,
    schedules,
    tasks,
    notes,
    grades,
    goals,
    study_logs: studyLogs,
  };
}
