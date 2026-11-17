"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppShell";
import { TaskDonutChart } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
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
import { semesterGpa } from "@/lib/gpa";
import {
  dueLabel,
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
  SCHEDULE_TYPE_LABEL,
  type Course,
  type Goal,
  type Grade,
  type Schedule,
  type StudyLog,
  type Task,
} from "@/lib/types";

/** "Selasa, 17 November" — tanpa tahun, sesuai gaya mockup Biru Malam. */
const DATE_LINE_FMT = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Status jadwal hari ini berdasarkan jam sekarang. */
function scheduleStatus(
  s: Schedule,
  now: Date,
  isNext: boolean,
): { label: string; gold: boolean } {
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em, 0, 0);
  const nowMs = now.getTime();
  if (nowMs > end.getTime()) return { label: "Selesai", gold: false };
  if (nowMs >= start.getTime()) return { label: "Berlangsung", gold: true };
  if (isNext) return { label: "Berikutnya", gold: true };
  if (sh < 11) return { label: "Pagi", gold: true };
  if (sh < 15) return { label: "Siang", gold: true };
  return { label: "Sore", gold: true };
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
  const ipSemester = useMemo(
    () =>
      semesterGpa(
        grades.filter((g) => g.semester === activeSemester),
        coursesById,
      ),
    [grades, coursesById, activeSemester],
  );

  // Meta hero: matkul & SKS semester aktif, tugas yang masih berjalan.
  const semesterCourses = useMemo(
    () => courses.filter((c) => c.semester === activeSemester),
    [courses, activeSemester],
  );
  const semesterSks = useMemo(
    () => semesterCourses.reduce((sum, c) => sum + c.sks, 0),
    [semesterCourses],
  );
  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== "selesai").length,
    [tasks],
  );

  // Tugas jatuh tempo minggu ini (Senin 00.00 – Senin depan 00.00):
  // dipakai bilah progres di hero dan kartu cincin "Tugas minggu ini".
  const weekTasks = useMemo(() => {
    const monday = startOfWeek(today);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    return tasks.filter((t) => {
      const due = new Date(t.due_date).getTime();
      return due >= monday.getTime() && due < nextMonday.getTime();
    });
  }, [tasks, today]);
  const weekDone = useMemo(
    () => weekTasks.filter((t) => t.status === "selesai").length,
    [weekTasks],
  );
  const weekPct =
    weekTasks.length > 0
      ? Math.round((weekDone / weekTasks.length) * 100)
      : 0;

  // Deadline terdekat: tugas belum selesai dengan due_date paling awal.
  const nearestTask = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "selesai");
    if (open.length === 0) return null;
    return [...open].sort(
      (a, b) => +new Date(a.due_date) - +new Date(b.due_date),
    )[0];
  }, [tasks]);

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

  // Indeks jadwal mendatang paling awal hari ini (untuk tag "Berikutnya").
  const nextScheduleIdx = useMemo(() => {
    const nowMs = today.getTime();
    return todaySchedules.findIndex((s) => {
      const [h, m] = s.start_time.split(":").map(Number);
      const start = new Date(today);
      start.setHours(h, m, 0, 0);
      return start.getTime() > nowMs;
    });
  }, [todaySchedules, today]);

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
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-11 w-56" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Beranda
        </h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0] || "";
  const dateLine = DATE_LINE_FMT.format(today).toUpperCase();
  // Cincin progres: r=24 → keliling 150,8.
  const ringOffset =
    weekTasks.length > 0 ? 150.8 * (1 - weekDone / weekTasks.length) : 150.8;

  return (
    <div className="space-y-6">
      {/* Sapaan — tanggal kapital + serif besar, sesuai mockup. */}
      <header className="animate-rise-in">
        <p className="text-[11.5px] font-semibold tracking-[2.6px] text-zinc-400 uppercase">
          {dateLine}
        </p>
        <h1 className="mt-1.5 font-serif text-[40px] leading-[1.05] font-semibold tracking-[-0.5px] text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
          Hai{firstName ? `, ${firstName}` : ""}.
        </h1>
      </header>

      {/* Hero IPK — kartu navy dengan angka serif besar. */}
      <section
        aria-label="IPK semester ini"
        className="animate-rise-in anim-delay-1 relative overflow-hidden rounded-[18px] bg-[linear-gradient(155deg,#1E2E52_0%,#121D33_100%)] p-[18px_22px_16px] text-[#F4F2EC] ring-1 ring-black/5 dark:ring-white/10"
      >
        <svg
          aria-hidden="true"
          className="absolute top-0.5 right-1.5 opacity-30"
          width="110"
          height="110"
          viewBox="0 0 110 110"
          fill="none"
          stroke="#C9A227"
          strokeWidth="1.4"
        >
          <circle cx="55" cy="55" r="44" />
          <circle cx="55" cy="55" r="34" />
          <path d="M55 30v50M30 55h50" opacity=".6" />
        </svg>
        <p className="text-[11.5px] font-bold tracking-[2.4px] text-[#B9C0D4] uppercase">
          IPK Semester Ini
        </p>
        <p className="mt-2.5 flex items-baseline gap-2.5">
          <span className="font-serif text-[52px] leading-none font-semibold tracking-[-1px] tabular-nums">
            {ipSemester === null ? "—" : formatScore(ipSemester)}
          </span>
          <span className="text-[15px] text-[#B9C0D4]">dari 4,00</span>
        </p>
        <div className="mt-2.5 flex gap-4">
          <div>
            <b className="block font-serif text-[19px] leading-tight font-semibold tabular-nums">
              {activeSemester}
            </b>
            <span className="text-[11px] font-semibold tracking-[0.4px] whitespace-nowrap text-[#B9C0D4] uppercase">
              Semester
            </span>
          </div>
          <div>
            <b className="block font-serif text-[19px] leading-tight font-semibold tabular-nums">
              {semesterCourses.length}
            </b>
            <span className="text-[11px] font-semibold tracking-[0.4px] whitespace-nowrap text-[#B9C0D4] uppercase">
              Matkul
            </span>
          </div>
          <div>
            <b className="block font-serif text-[19px] leading-tight font-semibold tabular-nums">
              {semesterSks}
            </b>
            <span className="text-[11px] font-semibold tracking-[0.4px] whitespace-nowrap text-[#B9C0D4] uppercase">
              SKS
            </span>
          </div>
          <div>
            <b className="block font-serif text-[19px] leading-tight font-semibold tabular-nums">
              {activeTasks}
            </b>
            <span className="text-[11px] font-semibold tracking-[0.4px] whitespace-nowrap text-[#B9C0D4] uppercase">
              Tugas aktif
            </span>
          </div>
        </div>
        <div className="my-3.5 h-px bg-[#F4F2EC]/20" />
        <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
          <span>Tugas minggu ini</span>
          <b className="text-[14.5px] text-gold-400">
            {weekTasks.length === 0
              ? "Tidak ada deadline"
              : `${weekDone} dari ${weekTasks.length} selesai`}
          </b>
        </div>
        <div
          className="mt-2.5 h-[7px] overflow-hidden rounded-full bg-[#F4F2EC]/20"
          role="progressbar"
          aria-valuenow={weekPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progres tugas minggu ini"
        >
          <div
            className="h-full rounded-full bg-gold-500 transition-[width] duration-300 ease-out"
            style={{ width: `${weekPct}%` }}
          />
        </div>
        <div className="mt-3.5">
          <Link
            href="/nilai"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#B9C0D4] hover:text-white hover:underline"
          >
            Lihat rincian nilai & IPK
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Tugas minggu ini — kartu cincin + deadline terdekat. */}
      <Link
        href="/tugas"
        aria-label="Tugas minggu ini, lihat semua tugas"
        className="animate-rise-in anim-delay-2 flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <span className="relative h-[58px] w-[58px] shrink-0">
          <svg
            width="58"
            height="58"
            viewBox="0 0 58 58"
            className="-rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="29"
              cy="29"
              r="24"
              fill="none"
              strokeWidth="6"
              className="stroke-[#ECEEF2] dark:stroke-zinc-800"
            />
            <circle
              cx="29"
              cy="29"
              r="24"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="150.8"
              strokeDashoffset={ringOffset}
              className="stroke-blue-600 dark:stroke-gold-400"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-zinc-900 tabular-nums dark:text-zinc-50">
            {weekTasks.length === 0 ? "—" : `${weekDone}/${weekTasks.length}`}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16.5px] font-bold text-zinc-900 dark:text-zinc-50">
            Tugas minggu ini
          </span>
          <span className="mt-0.5 block text-[13.5px] text-zinc-500 dark:text-zinc-400">
            {weekTasks.length === 0
              ? "Tidak ada tugas jatuh tempo minggu ini"
              : `${weekDone} dari ${weekTasks.length} sudah selesai`}
          </span>
          <span className="mt-1 block text-[13px] font-semibold text-gold-600 dark:text-gold-400">
            {nearestTask
              ? `Deadline terdekat: ${nearestTask.title} · ${dueLabel(nearestTask.due_date)}`
              : "Tidak ada deadline"}
          </span>
        </span>
        <Icon
          name="chevronRight"
          className="h-5 w-5 shrink-0 text-zinc-400"
        />
      </Link>

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

      {/* Jadwal hari ini — daftar baris sesuai mockup. */}
      <section
        aria-label={`Jadwal hari ini, ${todayName}`}
        className="animate-rise-in anim-delay-3 min-w-0"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-[26px] font-semibold tracking-[-0.5px] text-zinc-900 dark:text-zinc-50">
            <span className="mr-1 align-super font-sans text-xs font-bold text-gold-500">
              01
            </span>
            Jadwal hari ini
          </h2>
          <Link
            href="/jadwal?baru=1"
            className="shrink-0 text-[13.5px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
          >
            + Tambah jadwal
          </Link>
        </div>
        {todaySchedules.length === 0 ? (
          <div className="mt-2.5 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <EmptyState
              icon={<Icon name="calendar" className="h-6 w-6" />}
              title="Tidak ada jadwal hari ini"
              message={`Tidak ada kuliah atau agenda pada hari ${todayName}. Nikmati waktu luangmu — atau pakai untuk mengejar tugas.`}
            />
          </div>
        ) : (
          <ul className="mt-2.5 rounded-2xl border border-zinc-200 bg-white px-[18px] py-1 dark:border-zinc-800 dark:bg-zinc-900">
            {todaySchedules.map((s, idx) => {
              const course = s.course_id
                ? coursesById.get(s.course_id)
                : undefined;
              const status = scheduleStatus(
                s,
                today,
                idx === nextScheduleIdx,
              );
              const metaParts: string[] = [];
              if (s.room) metaParts.push(s.room);
              else if (course) metaParts.push(course.name);
              if (s.type !== "kuliah")
                metaParts.push(SCHEDULE_TYPE_LABEL[s.type]);
              const meta =
                metaParts.join(" · ") || "Tanpa mata kuliah";
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-[#EFEDE4] py-2.5 last:border-b-0 dark:border-zinc-800"
                >
                  <span className="w-[42px] shrink-0 font-serif text-[15px] font-semibold text-blue-700 tabular-nums dark:text-blue-300">
                    {formatTime(s.start_time)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-400">
                      {meta}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold tracking-[0.3px] ${
                      status.gold
                        ? "bg-gold-100 text-gold-600 dark:bg-gold-500/15 dark:text-gold-400"
                        : "bg-blue-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* m10: ketiga modul di bawah dibedakan karakternya — daftar
          deadline dengan chip tanggal, angka besar target, dan donat
          progres — dalam grid 12 kolom yang tidak simetris.
          grid-cols-1 (minmax(0,1fr)) + min-w-0 pada tiap section
          mencegah kolom implisit `auto` melebar mengikuti min-content
          judul tugas/jadwal di layar sempit (overflow horizontal). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Deadline mendekat — chip tanggal kalender + toggle selesai */}
        <section
          aria-label="Deadline mendekat"
          className="animate-rise-in anim-delay-4 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold text-zinc-900 dark:text-zinc-50">
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
          className="animate-rise-in anim-delay-5 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-7 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold text-zinc-900 dark:text-zinc-50">
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
                <span className="font-serif text-5xl font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
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
          className="animate-rise-in anim-delay-6 min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 md:col-span-12 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold text-zinc-900 dark:text-zinc-50">
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
