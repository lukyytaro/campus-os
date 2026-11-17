"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppShell";
import { TaskDonutChart } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
  Badge,
  EmptyState,
  ErrorBanner,
  ProgressBar,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  fetchCourses,
  fetchGoals,
  fetchGrades,
  fetchSchedules,
  fetchStudyLogs,
  fetchTasks,
} from "@/lib/data";
import { cumulativeGpa, semesterGpa } from "@/lib/gpa";
import {
  dueLabel,
  formatDateLong,
  formatHours,
  formatScore,
  formatTime,
  isOverdue,
  startOfWeek,
  toDateInputValue,
} from "@/lib/format";
import { translateError } from "@/lib/errors";
import { useMountLoad } from "@/lib/use-mount-load";
import {
  DAY_NAMES,
  PRIORITY_LABEL,
  type Course,
  type Goal,
  type Grade,
  type Schedule,
  type StudyLog,
  type Task,
} from "@/lib/types";

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export default function DashboardPage() {
  const { supabase, user, profile } = useApp();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);

  // Memuat data. State loading/error sudah benar di awal (true/""),
  // jadi load() tidak memanggil setState secara sinkron — semua
  // pembaruan state terjadi setelah await.
  async function load() {
    try {
      const [c, s, t, g, go, sl] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchSchedules(supabase, user.id),
        fetchTasks(supabase, user.id),
        fetchGrades(supabase, user.id),
        fetchGoals(supabase, user.id),
        fetchStudyLogs(supabase, user.id),
      ]);
      setCourses(c);
      setSchedules(s);
      setTasks(t);
      setGrades(g);
      setGoals(go);
      setStudyLogs(sl);
      // Pengingat deadline kini diperiksa AppShell (semua halaman),
      // bukan lagi dari Dashboard saja.
    } catch (err) {
      setError(
        translateError(
          err,
          "Gagal memuat data. Periksa koneksi dan pastikan schema.sql sudah dijalankan di Supabase.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  // Coba lagi setelah gagal: reset state dulu (dari event handler,
  // bukan dari effect), lalu muat ulang.
  function handleRetry() {
    setLoading(true);
    setError("");
    void load();
  }

  // Muat data sekali saat mount.
  useMountLoad(load);

  // Tanggal "hari ini" dihitung sekali saat mount agar render tetap murni.
  const today = useMemo(() => new Date(), []);
  const todayName = DAY_NAMES[(today.getDay() + 6) % 7];

  const coursesById = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );

  const activeSemester = profile.active_semester;
  const ipk = useMemo(
    () => cumulativeGpa(grades, coursesById),
    [grades, coursesById],
  );
  const ipSemester = useMemo(
    () =>
      semesterGpa(
        grades.filter((g) => g.semester === activeSemester),
        coursesById,
      ),
    [grades, coursesById, activeSemester],
  );

  // Jadwal hari ini: kelas rutin hari ini + agenda bertanggal hari ini.
  const todaySchedules = useMemo(() => {
    const jsDay = today.getDay(); // 0 = Minggu
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const todayStr = toDateInputValue(today);
    return schedules
      .filter(
        (s) =>
          s.day_of_week === dayOfWeek ||
          (s.event_date !== null && s.event_date === todayStr),
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, today]);

  // Deadline mendekat: belum selesai, jatuh tempo dalam 7 hari (termasuk terlewat).
  const upcomingDeadlines = useMemo(() => {
    const in7Days = today.getTime() + 7 * 86_400_000;
    return tasks
      .filter(
        (t) =>
          t.status !== "selesai" && new Date(t.due_date).getTime() <= in7Days,
      )
      .sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date))
      .slice(0, 5);
  }, [tasks, today]);

  // Progres target minggu ini.
  const weekGoal = useMemo(
    () => goals.find((g) => g.semester === activeSemester),
    [goals, activeSemester],
  );
  const minutesThisWeek = useMemo(() => {
    const monday = startOfWeek(new Date());
    const mondayStr = toDateInputValue(monday);
    return studyLogs
      .filter((log) => log.log_date >= mondayStr)
      .reduce((sum, log) => sum + log.minutes, 0);
  }, [studyLogs]);

  const taskCounts = useMemo(
    () => ({
      selesai: tasks.filter((t) => t.status === "selesai").length,
      proses: tasks.filter((t) => t.status === "proses").length,
      belum: tasks.filter((t) => t.status === "belum").length,
    }),
    [tasks],
  );

  async function markTaskDone(task: Task) {
    const { error: err } = await supabase
      .from("tasks")
      .update({ status: "selesai" })
      .eq("id", task.id);
    if (err) {
      toast(translateError(err, "Gagal memperbarui tugas."), "error");
      return;
    }
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: "selesai" } : t)),
    );
    toast("Tugas ditandai selesai.");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Beranda</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0] || "";

  return (
    <div className="space-y-6">
      {/* Sapaan */}
      <header className="animate-rise-in">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
          {greeting(today)}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
          {formatDateLong(today)}
          {profile.program ? ` · ${profile.program}` : ""}
          {` · Semester ${activeSemester}`}
        </p>
      </header>

      {/* Ringkasan IPK */}
      <section
        aria-label="Ringkasan IPK"
        className="animate-rise-in anim-delay-1 rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Indeks Prestasi Kumulatif
            </p>
            <p className="mt-1 text-5xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
              {ipk === null ? "—" : formatScore(ipk)}
              <span className="ml-1 text-lg font-medium text-zinc-400">
                / 4,00
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                IP Semester {activeSemester}
              </p>
              <p className="mt-0.5 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                {ipSemester === null ? "—" : formatScore(ipSemester)}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Mata kuliah dinilai
              </p>
              <p className="mt-0.5 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                {grades.length}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Link
            href="/nilai"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Lihat rincian nilai & IPK
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Aksi cepat */}
      <div className="animate-rise-in anim-delay-2 flex flex-wrap gap-2">
        <Link
          href="/tugas?baru=1"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Icon name="plus" className="h-4 w-4" /> Tambah tugas
        </Link>
        <Link
          href="/catatan?baru=1"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <Icon name="plus" className="h-4 w-4" /> Tambah catatan
        </Link>
        <Link
          href="/target?catat=1"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <Icon name="clock" className="h-4 w-4" /> Catat jam belajar
        </Link>
      </div>

      {/* m10: keempat modul dibedakan karakternya — garis waktu jadwal,
          daftar deadline dengan chip tanggal, angka besar target, dan
          donat progres — dalam grid 12 kolom yang tidak simetris.
          grid-cols-1 (minmax(0,1fr)) + min-w-0 pada tiap section
          mencegah kolom implisit `auto` melebar mengikuti min-content
          judul tugas/jadwal di layar sempit (overflow horizontal). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Jadwal hari ini — garis waktu dengan aksen jam */}
        <section
          aria-label={`Jadwal hari ini, ${todayName}`}
          className="animate-rise-in anim-delay-3 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-7 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Icon name="calendar" className="h-4 w-4" />
              </span>
              Jadwal hari ini
            </h2>
            <Link
              href="/jadwal"
              className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Semua jadwal
            </Link>
          </div>
          {todaySchedules.length === 0 ? (
            <EmptyState
              icon={<Icon name="calendar" className="h-6 w-6" />}
              title="Tidak ada jadwal hari ini"
              message={`Tidak ada kuliah atau agenda pada hari ${todayName}. Nikmati waktu luangmu — atau pakai untuk mengejar tugas.`}
            />
          ) : (
            <ul className="mt-5">
              {todaySchedules.map((s, idx) => {
                const course = s.course_id
                  ? coursesById.get(s.course_id)
                  : undefined;
                const isLast = idx === todaySchedules.length - 1;
                return (
                  <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
                    <div className="w-11 shrink-0 pt-0.5 text-right">
                      <p className="text-sm font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                        {formatTime(s.start_time)}
                      </p>
                      <p className="text-xs text-zinc-400 tabular-nums">
                        {formatTime(s.end_time)}
                      </p>
                    </div>
                    <div className="relative flex w-4 shrink-0 justify-center">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute top-3 -bottom-1 w-px bg-zinc-200 dark:bg-zinc-800"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white dark:ring-zinc-900"
                        style={{
                          backgroundColor: course?.color ?? "#2563EB",
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">
                        {s.title}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                        {s.room ? `${s.room} · ` : ""}
                        {course?.name ?? "Tanpa mata kuliah"}
                      </p>
                    </div>
                    {s.type !== "kuliah" && (
                      <Badge tone={s.type === "agenda" ? "violet" : "red"}>
                        {s.type.toUpperCase()}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Deadline mendekat — chip tanggal kalender + toggle selesai */}
        <section
          aria-label="Deadline mendekat"
          className="animate-rise-in anim-delay-4 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Icon name="clock" className="h-4 w-4" />
              </span>
              Deadline mendekat
            </h2>
            <Link
              href="/tugas"
              className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Semua tugas
            </Link>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <EmptyState
              icon={<Icon name="tasks" className="h-6 w-6" />}
              title="Tidak ada deadline minggu ini"
              message="Semua tugas sudah selesai atau deadline-nya masih jauh. Kerja bagus."
            />
          ) : (
            <ul className="mt-4 space-y-1">
              {upcomingDeadlines.map((t) => {
                const overdue = isOverdue(t.due_date);
                const course = t.course_id
                  ? coursesById.get(t.course_id)
                  : undefined;
                const due = new Date(t.due_date);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <span
                      aria-hidden="true"
                      className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none ${
                        overdue
                          ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      <span className="text-lg font-bold tabular-nums">
                        {due.getDate()}
                      </span>
                      <span className="mt-0.5 text-[11px] font-medium">
                        {due.toLocaleString("id-ID", { month: "short" })}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/tugas?fokus=${t.id}`}
                        className="block truncate text-[15px] font-medium text-zinc-900 hover:text-blue-700 dark:text-zinc-50 dark:hover:text-blue-400"
                      >
                        {t.title}
                      </Link>
                      <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                        {course ? `${course.name} · ` : ""}
                        <span
                          className={
                            overdue
                              ? "font-medium text-red-600 dark:text-red-400"
                              : ""
                          }
                        >
                          {dueLabel(t.due_date)}
                        </span>
                        {` · ${PRIORITY_LABEL[t.priority]}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => markTaskDone(t)}
                      aria-label={`Tandai selesai: ${t.title}`}
                      title="Tandai selesai"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-300 transition-colors hover:border-blue-600 hover:bg-blue-50 dark:border-zinc-600 dark:hover:border-blue-500 dark:hover:bg-blue-500/10">
                        <span className="sr-only">Tandai selesai</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Target minggu ini — angka besar + progres */}
        <section
          aria-label="Target belajar minggu ini"
          className="animate-rise-in anim-delay-5 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Icon name="target" className="h-4 w-4" />
              </span>
              Target minggu ini
            </h2>
            <Link
              href="/target"
              className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Statistik
            </Link>
          </div>
          {weekGoal ? (
            <div className="mt-4">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-5xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
                  {formatHours(minutesThisWeek)}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  dari {weekGoal.target_hours_per_week.toLocaleString("id-ID")}{" "}
                  jam target
                </span>
              </p>
              <div className="mt-4">
                <ProgressBar
                  value={minutesThisWeek}
                  max={weekGoal.target_hours_per_week * 60}
                />
              </div>
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                {minutesThisWeek >= weekGoal.target_hours_per_week * 60
                  ? "Target minggu ini tercapai."
                  : `Kurang ${formatHours(Math.max(0, weekGoal.target_hours_per_week * 60 - minutesThisWeek))} lagi untuk mencapai target.`}
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<Icon name="target" className="h-6 w-6" />}
              title="Belum ada target minggu ini"
              message={`Tentukan target jam belajarmu untuk Semester ${activeSemester} agar progresmu tercatat.`}
              action={
                <Link
                  href="/target"
                  className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  Atur target
                </Link>
              }
            />
          )}
        </section>

        {/* Progres tugas — donat + legenda */}
        <section
          aria-label="Progres tugas"
          className="animate-rise-in anim-delay-6 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-7 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Icon name="tasks" className="h-4 w-4" />
              </span>
              Progres tugas
            </h2>
            <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
              {taskCounts.selesai} dari {tasks.length} selesai
            </span>
          </div>
          {tasks.length === 0 ? (
            <EmptyState
              icon={<Icon name="tasks" className="h-6 w-6" />}
              title="Belum ada tugas"
              message="Tambahkan tugas pertamamu agar progresnya bisa dipantau di sini."
              action={
                <Link
                  href="/tugas?baru=1"
                  className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  Tambah tugas
                </Link>
              }
            />
          ) : (
            <div className="mt-4">
              <TaskDonutChart
                data={[
                  { status: "selesai", count: taskCounts.selesai },
                  { status: "proses", count: taskCounts.proses },
                  { status: "belum", count: taskCounts.belum },
                ]}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
