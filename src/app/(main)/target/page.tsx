"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppShell";
import { CoursePicker } from "@/components/CoursePicker";
import { TaskDonutChart, WeeklyStudyBarChart } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  ProgressBar,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  fetchCourses,
  fetchGoals,
  fetchStudyLogs,
  fetchTasks,
} from "@/lib/data";
import { translateError } from "@/lib/errors";
import {
  formatDate,
  formatHours,
  startOfWeek,
  toDateInputValue,
  weekLabel,
} from "@/lib/format";
import type { Course, Goal, StudyLog, Task } from "@/lib/types";
import { useMountLoad } from "@/lib/use-mount-load";

function TargetPageInner() {
  const { supabase, user, profile } = useApp();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Target
  const [targetHours, setTargetHours] = useState("10");
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetError, setTargetError] = useState("");

  // Catat jam belajar — dibuka otomatis dari tautan "Catat jam belajar"
  // di Dashboard (?catat=1), via nilai awal state.
  const [logOpen, setLogOpen] = useState(
    () => searchParams.get("catat") === "1",
  );
  const [logDate, setLogDate] = useState(() => toDateInputValue(new Date()));
  const [logMinutes, setLogMinutes] = useState("60");
  const [logCourseId, setLogCourseId] = useState<string | null>(null);
  const [logError, setLogError] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  // Hapus log
  const [deletingLog, setDeletingLog] = useState<StudyLog | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    try {
      const [c, g, sl, t] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchGoals(supabase, user.id),
        fetchStudyLogs(supabase, user.id),
        fetchTasks(supabase, user.id),
      ]);
      setCourses(c);
      setGoals(g);
      setStudyLogs(sl);
      setTasks(t);
      const active = g.find((x) => x.semester === profile.active_semester);
      if (active) setTargetHours(String(active.target_hours_per_week));
    } catch (err) {
      setError(translateError(err, "Gagal memuat data."));
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    setLoading(true);
    setError("");
    void load();
  }

  // Muat data sekali saat mount.
  useMountLoad(load);

  const coursesById = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );

  const activeGoal = useMemo(
    () => goals.find((g) => g.semester === profile.active_semester),
    [goals, profile.active_semester],
  );

  const minutesThisWeek = useMemo(() => {
    const mondayStr = toDateInputValue(startOfWeek(new Date()));
    return studyLogs
      .filter((log) => log.log_date >= mondayStr)
      .reduce((sum, log) => sum + log.minutes, 0);
  }, [studyLogs]);

  // Jam belajar 8 minggu terakhir (termasuk minggu ini).
  const weeklyData = useMemo(() => {
    const weeks: { week: string; hours: number }[] = [];
    const thisMonday = startOfWeek(new Date());
    for (let i = 7; i >= 0; i--) {
      const monday = new Date(thisMonday);
      monday.setDate(monday.getDate() - i * 7);
      const nextMonday = new Date(monday);
      nextMonday.setDate(nextMonday.getDate() + 7);
      const startStr = toDateInputValue(monday);
      const endStr = toDateInputValue(nextMonday);
      const minutes = studyLogs
        .filter((log) => log.log_date >= startStr && log.log_date < endStr)
        .reduce((sum, log) => sum + log.minutes, 0);
      weeks.push({
        week: i === 0 ? "Minggu ini" : weekLabel(monday),
        hours: Math.round((minutes / 60) * 10) / 10,
      });
    }
    return weeks;
  }, [studyLogs]);

  const taskCounts = useMemo(
    () => ({
      selesai: tasks.filter((t) => t.status === "selesai").length,
      proses: tasks.filter((t) => t.status === "proses").length,
      belum: tasks.filter((t) => t.status === "belum").length,
    }),
    [tasks],
  );

  async function handleSaveTarget(e: FormEvent) {
    e.preventDefault();
    setTargetError("");
    const hours = Number(targetHours.trim().replace(",", "."));
    if (!Number.isFinite(hours) || hours < 0 || hours > 100) {
      setTargetError("Target harus berupa angka antara 0 dan 100 jam.");
      return;
    }
    setSavingTarget(true);
    const payload = {
      user_id: user.id,
      semester: profile.active_semester,
      target_hours_per_week: Math.round(hours * 10) / 10,
    };
    const result = activeGoal
      ? await supabase
          .from("goals")
          .update(payload)
          .eq("id", activeGoal.id)
          .select("*")
          .single()
      : await supabase.from("goals").insert(payload).select("*").single();
    setSavingTarget(false);
    if (result.error || !result.data) {
      setTargetError(translateError(result.error, "Gagal menyimpan target."));
      return;
    }
    const saved = result.data as Goal;
    setGoals((prev) =>
      activeGoal
        ? prev.map((g) => (g.id === saved.id ? saved : g))
        : [...prev, saved],
    );
    toast("Target belajar disimpan.");
  }

  async function handleSaveLog(e: FormEvent) {
    e.preventDefault();
    setLogError("");
    const minutes = Number(logMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setLogError("Durasi harus berupa angka bulat antara 1 dan 1440 menit.");
      return;
    }
    if (!logDate) {
      setLogError("Tanggal wajib diisi.");
      return;
    }
    setSavingLog(true);
    const { data, error: err } = await supabase
      .from("study_logs")
      .insert({
        user_id: user.id,
        course_id: logCourseId,
        log_date: logDate,
        minutes,
      })
      .select("*")
      .single();
    setSavingLog(false);
    if (err || !data) {
      setLogError(translateError(err, "Gagal menyimpan catatan belajar."));
      return;
    }
    setStudyLogs((prev) => [data as StudyLog, ...prev]);
    setLogOpen(false);
    setLogMinutes("60");
    setLogCourseId(null);
    toast("Jam belajar dicatat.");
  }

  async function handleDeleteLog() {
    if (!deletingLog) return;
    setDeleteLoading(true);
    const { error: err } = await supabase
      .from("study_logs")
      .delete()
      .eq("id", deletingLog.id);
    setDeleteLoading(false);
    if (err) {
      toast(translateError(err, "Gagal menghapus catatan."), "error");
      return;
    }
    setStudyLogs((prev) => prev.filter((l) => l.id !== deletingLog.id));
    setDeletingLog(null);
    toast("Catatan belajar dihapus.");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Target & Statistik</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  const targetMinutes = (activeGoal?.target_hours_per_week ?? 0) * 60;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
            Target & Statistik
          </h1>
          <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
            Target jam belajar Semester {profile.active_semester} dan
            perkembanganmu.
          </p>
        </div>
        <Button onClick={() => setLogOpen(true)}>
          <Icon name="plus" className="h-4 w-4" /> Catat jam belajar
        </Button>
      </header>

      {/* Target minggu ini */}
      <section
        aria-label="Target belajar minggu ini"
        className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Belajar minggu ini
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
              {formatHours(minutesThisWeek)}
              {activeGoal && (
                <span className="ml-2 text-lg font-medium text-zinc-400">
                  / {activeGoal.target_hours_per_week.toLocaleString("id-ID")}{" "}
                  jam target
                </span>
              )}
            </p>
          </div>
        </div>
        {activeGoal ? (
          <div className="mt-4">
            <ProgressBar value={minutesThisWeek} max={targetMinutes} />
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {minutesThisWeek >= targetMinutes
                ? "Target minggu ini tercapai. Pertahankan ritmenya."
                : `Kurang ${formatHours(Math.max(0, targetMinutes - minutesThisWeek))} lagi untuk mencapai target minggu ini.`}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Belum ada target untuk semester ini. Atur di bawah ini.
          </p>
        )}

        <form
          onSubmit={handleSaveTarget}
          className="mt-5 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800"
          noValidate
        >
          <div className="w-44">
            <Field
              label="Target jam per minggu"
              htmlFor="target-hours"
              error={targetError}
            >
              <Input
                id="target-hours"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={targetHours}
                onChange={(e) => setTargetHours(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" loading={savingTarget}>
            Simpan target
          </Button>
        </form>
      </section>

      {/* Jam belajar per minggu */}
      <section
        aria-label="Jam belajar per minggu"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Jam belajar per minggu
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Delapan minggu terakhir, dihitung dari catatan jam belajarmu.
        </p>
        {studyLogs.length === 0 ? (
          <EmptyState
            icon={<Icon name="clock" className="h-6 w-6" />}
            title="Belum ada catatan belajar"
            message="Catat setiap sesi belajarmu — berapa menit dan untuk mata kuliah apa — agar grafik ini terisi."
            action={
              <Button onClick={() => setLogOpen(true)}>
                <Icon name="plus" className="h-4 w-4" /> Catat jam belajar
              </Button>
            }
          />
        ) : (
          <div className="mt-3">
            <WeeklyStudyBarChart data={weeklyData} />
          </div>
        )}
      </section>

      {/* Progres tugas */}
      <section
        aria-label="Progres tugas"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Progres tugas
        </h2>
        {tasks.length === 0 ? (
          <EmptyState
            icon={<Icon name="tasks" className="h-6 w-6" />}
            title="Belum ada tugas"
            message="Tambahkan tugas agar progresnya bisa dipantau di sini."
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

      {/* Riwayat catatan belajar */}
      <section
        aria-label="Riwayat catatan belajar"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Riwayat belajar
        </h2>
        {studyLogs.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Belum ada riwayat. Catatan jam belajarmu akan muncul di sini.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {studyLogs.slice(0, 10).map((log) => {
              const course = log.course_id
                ? coursesById.get(log.course_id)
                : undefined;
              return (
                <li key={log.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: course?.color ?? "#1B2A4A" }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">
                      {course ? course.name : "Belajar umum"}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {formatDate(`${log.log_date}T12:00:00`)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-50">
                    {formatHours(log.minutes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeletingLog(log)}
                    aria-label={`Hapus catatan belajar ${formatDate(`${log.log_date}T12:00:00`)}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Modal catat jam belajar */}
      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Catat jam belajar"
      >
        <form onSubmit={handleSaveLog} className="space-y-4" noValidate>
          <Field label="Tanggal" htmlFor="log-date" required>
            <Input
              id="log-date"
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
          </Field>
          <Field
            label="Durasi (menit)"
            htmlFor="log-minutes"
            required
            hint="Contoh: 90 menit untuk satu setengah jam belajar."
          >
            <Input
              id="log-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              step={1}
              value={logMinutes}
              onChange={(e) => setLogMinutes(e.target.value)}
            />
          </Field>
          <CoursePicker
            value={logCourseId}
            onChange={setLogCourseId}
            courses={courses}
            onCourseAdded={(c) => setCourses((prev) => [...prev, c])}
            noneLabel="Belajar umum (tanpa mata kuliah)"
          />
          {logError && (
            <p className="text-sm text-red-600 dark:text-red-400">{logError}</p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setLogOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={savingLog}>
              Simpan catatan
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deletingLog !== null}
        onClose={() => setDeletingLog(null)}
        onConfirm={handleDeleteLog}
        title="Hapus catatan belajar?"
        message="Catatan ini akan dihapus dan total jam belajarmu dihitung ulang."
        confirmLabel="Hapus catatan"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}

export default function TargetPage() {
  return (
    <Suspense>
      <TargetPageInner />
    </Suspense>
  );
}
