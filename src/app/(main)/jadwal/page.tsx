"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppShell";
import { CoursePicker } from "@/components/CoursePicker";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { fetchCourses, fetchSchedules } from "@/lib/data";
import { translateError } from "@/lib/errors";
import {
  formatDate,
  formatDateLong,
  formatTimeRange,
  toDateInputValue,
} from "@/lib/format";
import {
  DAY_NAMES,
  SCHEDULE_TYPE_LABEL,
  type Course,
  type Schedule,
  type ScheduleType,
} from "@/lib/types";
import { useMountLoad } from "@/lib/use-mount-load";

type View = "week" | "calendar";
type FormMode = "weekly" | "dated";

const TYPE_TONE: Record<ScheduleType, "blue" | "red" | "violet"> = {
  kuliah: "blue",
  uts: "red",
  uas: "red",
  agenda: "violet",
};

interface FormState {
  title: string;
  courseId: string | null;
  type: ScheduleType;
  mode: FormMode;
  dayOfWeek: number;
  eventDate: string;
  startTime: string;
  endTime: string;
  room: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  courseId: null,
  type: "kuliah",
  mode: "weekly",
  dayOfWeek: 1,
  eventDate: toDateInputValue(new Date()),
  startTime: "08:00",
  endTime: "09:40",
  room: "",
};

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function JadwalPage() {
  return (
    <Suspense>
      <JadwalPageInner />
    </Suspense>
  );
}

function JadwalPageInner() {
  const { supabase, user } = useApp();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [view, setView] = useState<View>("week");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() =>
    toDateInputValue(new Date()),
  );
  // Jadwal yang disorot dari deep-link pencarian (?fokus=<id>).
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Sorotan deep-link hanya sementara: hilang sendiri setelah 5 detik
  // agar tidak menetap selama sesi dan kehilangan maknanya.
  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 5000);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  // Form tambah/ubah jadwal — dibuka otomatis dari tautan
  // "+ Tambah jadwal" di Dashboard (?baru=1), via nilai awal state.
  const [formOpen, setFormOpen] = useState(
    () => searchParams.get("baru") === "1",
  );
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Hapus jadwal
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    try {
      const [c, s] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchSchedules(supabase, user.id),
      ]);
      setCourses(c);
      setSchedules(s);
      // Deep-link dari Pencarian (?fokus=<id>): tampilkan tampilan yang
      // memuat jadwal itu (kalender + tanggalnya untuk agenda bertanggal,
      // tampilan minggu untuk kuliah rutin) lalu sorot barisnya.
      const fokus = searchParams.get("fokus");
      if (fokus) {
        const target = s.find((x) => x.id === fokus);
        if (target) {
          if (target.event_date) {
            const d = new Date(`${target.event_date}T12:00:00`);
            setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            setSelectedDate(target.event_date);
            setView("calendar");
          } else {
            setView("week");
          }
          setHighlightId(target.id);
          window.setTimeout(() => {
            document
              .getElementById(`jadwal-${target.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        } else {
          // Deep-link ke jadwal yang sudah dihapus: beri tahu pengguna
          // alih-alih diam-diam menampilkan daftar polos.
          toast("Item tidak ditemukan. Mungkin sudah dihapus.", "error");
        }
        router.replace("/jadwal", { scroll: false });
      }
    } catch (err) {
      setError(translateError(err, "Gagal memuat jadwal."));
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

  const todayStr = toDateInputValue(new Date());
  const todayDow = (() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  })();

  /** Jadwal rutin per hari (1=Senin..7=Minggu). */
  const weeklyByDay = useMemo(() => {
    const map = new Map<number, Schedule[]>();
    for (const s of schedules) {
      if (s.day_of_week === null) continue;
      const list = map.get(s.day_of_week) ?? [];
      list.push(s);
      map.set(s.day_of_week, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [schedules]);

  /** Agenda bertanggal, dikelompokkan per tanggal. */
  const datedByDate = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      if (s.event_date === null) continue;
      const list = map.get(s.event_date) ?? [];
      list.push(s);
      map.set(s.event_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [schedules]);

  /** Semua item pada satu tanggal: kelas rutin hari itu + agenda bertanggal. */
  function itemsOnDate(dateStr: string): Schedule[] {
    const d = new Date(`${dateStr}T12:00:00`);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const weekly = weeklyByDay.get(dow) ?? [];
    const dated = datedByDate.get(dateStr) ?? [];
    return [...weekly, ...dated].sort((a, b) =>
      a.start_time.localeCompare(b.start_time),
    );
  }

  // Sel kalender bulan berjalan (mulai Senin).
  const calendarCells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const leadBlanks = (first.getDay() + 6) % 7; // Senin = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < leadBlanks; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(toDateInputValue(new Date(year, month, day)));
    }
    return cells;
  }, [monthCursor]);

  const selectedItems = useMemo(
    () => itemsOnDate(selectedDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDate, weeklyByDay, datedByDate],
  );

  function openAdd(prefill?: Partial<FormState>) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, ...prefill });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(s: Schedule) {
    setEditing(s);
    setForm({
      title: s.title,
      courseId: s.course_id,
      type: s.type,
      mode: s.day_of_week !== null ? "weekly" : "dated",
      dayOfWeek: s.day_of_week ?? 1,
      eventDate: s.event_date ?? todayStr,
      startTime: s.start_time.slice(0, 5),
      endTime: s.end_time.slice(0, 5),
      room: s.room,
    });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim()) {
      setFormError("Judul jadwal wajib diisi.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError("Jam selesai harus lebih besar dari jam mulai.");
      return;
    }
    if (form.mode === "dated" && !form.eventDate) {
      setFormError("Tanggal wajib diisi untuk jadwal bertanggal.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      course_id: form.courseId,
      title: form.title.trim(),
      type: form.type,
      day_of_week: form.mode === "weekly" ? form.dayOfWeek : null,
      event_date: form.mode === "dated" ? form.eventDate : null,
      start_time: form.startTime,
      end_time: form.endTime,
      room: form.room.trim(),
    };
    const result = editing
      ? await supabase
          .from("schedules")
          .update(payload)
          .eq("id", editing.id)
          .select("*")
          .single()
      : await supabase.from("schedules").insert(payload).select("*").single();
    setSaving(false);
    if (result.error || !result.data) {
      setFormError(translateError(result.error, "Gagal menyimpan jadwal."));
      return;
    }
    const saved = result.data as Schedule;
    setSchedules((prev) =>
      editing
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved],
    );
    setFormOpen(false);
    toast(editing ? "Jadwal diperbarui." : "Jadwal ditambahkan.");
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    const { error: err } = await supabase
      .from("schedules")
      .delete()
      .eq("id", deleting.id);
    setDeleteLoading(false);
    if (err) {
      toast(translateError(err, "Gagal menghapus jadwal."), "error");
      return;
    }
    setSchedules((prev) => prev.filter((s) => s.id !== deleting.id));
    setDeleting(null);
    toast("Jadwal dihapus.");
  }

  function renderScheduleRow(s: Schedule) {
    const course = s.course_id ? coursesById.get(s.course_id) : undefined;
    const highlighted = s.id === highlightId;
    return (
      <li
        key={s.id}
        id={`jadwal-${s.id}`}
        className={`flex scroll-mt-24 items-start gap-3 rounded-lg py-3 first:pt-0 last:pb-0 ${
          highlighted ? "bg-blue-50 px-2 dark:bg-blue-500/10" : ""
        }`}
      >
        <span
          className="mt-1 h-9 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: course?.color ?? "#1B2A4A" }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-zinc-900 [text-wrap:pretty] dark:text-zinc-50">
            {s.title}
          </p>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {formatTimeRange(s.start_time, s.end_time)}
            {s.room ? ` · ${s.room}` : ""}
            {course ? ` · ${course.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {s.type !== "kuliah" && (
            <Badge tone={TYPE_TONE[s.type]}>
              {SCHEDULE_TYPE_LABEL[s.type]}
            </Badge>
          )}
          <button
            type="button"
            onClick={() => openEdit(s)}
            aria-label={`Ubah ${s.title}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <Icon name="pencil" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDeleting(s)}
            aria-label={`Hapus ${s.title}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  }

  function shiftMonth(delta: number) {
    setMonthCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Jadwal & Kalender</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
            Jadwal & Kalender
          </h1>
          <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
            Kuliah rutin mingguan, UTS, UAS, dan agenda kampus.
          </p>
        </div>
        <Button onClick={() => openAdd()}>
          <Icon name="plus" className="h-4 w-4" /> Tambah jadwal
        </Button>
      </header>

      {/* Tab tampilan */}
      <div
        role="tablist"
        aria-label="Tampilan jadwal"
        className="inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
      >
        {(
          [
            { id: "week", label: "Minggu ini" },
            { id: "calendar", label: "Kalender" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={`h-10 rounded-lg px-4 text-sm font-medium transition-colors ${
              view === tab.id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "week" ? (
        <div className="space-y-4">
          {DAY_NAMES.map((dayName, idx) => {
            const dow = idx + 1;
            const items = weeklyByDay.get(dow) ?? [];
            if (items.length === 0 && dow > 5) return null; // Sabtu/Minggu kosong disembunyikan
            const isToday = dow === todayDow;
            return (
              <section
                key={dow}
                aria-label={dayName}
                className={`rounded-2xl border p-5 ${
                  isToday
                    ? "border-blue-600/40 bg-blue-50/40 dark:border-blue-500/40 dark:bg-blue-500/5"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {dayName}
                  </h2>
                  {isToday && <Badge tone="blue">Hari ini</Badge>}
                  <span className="ml-auto text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
                    {items.length === 0
                      ? "Libur"
                      : `${items.length} jadwal`}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    Tidak ada kuliah pada hari {dayName}.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {items.map(renderScheduleRow)}
                  </ul>
                )}
              </section>
            );
          })}

          {/* Agenda bertanggal yang akan datang */}
          {[...datedByDate.entries()]
            .filter(([date]) => date >= todayStr)
            .sort(([a], [b]) => a.localeCompare(b)).length > 0 && (
            <section
              aria-label="Agenda bertanggal mendatang"
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                UTS, UAS & agenda mendatang
              </h2>
              <ul className="mt-4 space-y-4">
                {[...datedByDate.entries()]
                  .filter(([date]) => date >= todayStr)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, items]) => (
                    <li key={date}>
                      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                        {formatDateLong(`${date}T12:00:00`)}
                      </p>
                      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                        {items.map(renderScheduleRow)}
                      </ul>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Navigasi bulan */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
              {MONTH_NAMES[monthCursor.getMonth()]} {monthCursor.getFullYear()}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDate(todayStr);
                }}
              >
                Hari ini
              </Button>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Bulan sebelumnya"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Bulan berikutnya"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Icon name="chevronRight" className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Grid kalender */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((dateStr, idx) => {
                if (!dateStr) return <div key={`blank-${idx}`} />;
                const items = itemsOnDate(dateStr);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dayNum = Number(dateStr.slice(8, 10));
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    aria-label={`${formatDate(`${dateStr}T12:00:00`)} — ${items.length} jadwal`}
                    aria-pressed={isSelected}
                    className={`flex min-h-12 flex-col items-center justify-start gap-1 rounded-lg px-1 py-1.5 text-sm transition-colors sm:min-h-16 ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : isToday
                          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600/30 dark:bg-blue-500/10 dark:text-blue-300"
                          : "text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="font-medium tabular-nums">{dayNum}</span>
                    {items.length > 0 && (
                      <span className="flex flex-wrap justify-center gap-1">
                        {items.slice(0, 3).map((item) => (
                          <span
                            key={item.id}
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? "bg-white" : ""
                            }`}
                            style={
                              isSelected
                                ? undefined
                                : {
                                    backgroundColor:
                                      coursesById.get(item.course_id ?? "")
                                        ?.color ?? "#1B2A4A",
                                  }
                            }
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail hari terpilih */}
          <section
            aria-label={`Jadwal ${formatDateLong(`${selectedDate}T12:00:00`)}`}
            className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
                {formatDateLong(`${selectedDate}T12:00:00`)}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  openAdd({ mode: "dated", eventDate: selectedDate })
                }
              >
                <Icon name="plus" className="h-4 w-4" /> Tambah di tanggal ini
              </Button>
            </div>
            {selectedItems.length === 0 ? (
              <EmptyState
                icon={<Icon name="calendar" className="h-6 w-6" />}
                title="Tidak ada jadwal"
                message="Tidak ada kuliah, ujian, atau agenda pada tanggal ini."
              />
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
                {selectedItems.map(renderScheduleRow)}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Modal tambah/ubah jadwal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Ubah jadwal" : "Tambah jadwal"}
      >
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          <Field label="Judul" htmlFor="schedule-title" required>
            <Input
              id="schedule-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="mis. Kuliah Basis Data"
            />
          </Field>
          <CoursePicker
            value={form.courseId}
            onChange={(id) => setForm({ ...form, courseId: id })}
            courses={courses}
            onCourseAdded={(c) => setCourses((prev) => [...prev, c])}
          />
          <Field label="Jenis" htmlFor="schedule-type" required>
            <div className="relative">
              <Select
                id="schedule-type"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as ScheduleType })
                }
              >
                {(Object.keys(SCHEDULE_TYPE_LABEL) as ScheduleType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {SCHEDULE_TYPE_LABEL[t]}
                    </option>
                  ),
                )}
              </Select>
              <Icon
                name="chevronDown"
                className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
              />
            </div>
          </Field>

          {/* Pola: rutin mingguan vs tanggal tertentu */}
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Pola jadwal
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "weekly", label: "Rutin setiap minggu" },
                  { id: "dated", label: "Tanggal tertentu" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm({ ...form, mode: opt.id })}
                  aria-pressed={form.mode === opt.id}
                  className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    form.mode === opt.id
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {form.mode === "weekly" ? (
            <Field label="Hari" htmlFor="schedule-day" required>
              <div className="relative">
                <Select
                  id="schedule-day"
                  value={form.dayOfWeek}
                  onChange={(e) =>
                    setForm({ ...form, dayOfWeek: Number(e.target.value) })
                  }
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
          ) : (
            <Field label="Tanggal" htmlFor="schedule-date" required>
              <Input
                id="schedule-date"
                type="date"
                value={form.eventDate}
                onChange={(e) =>
                  setForm({ ...form, eventDate: e.target.value })
                }
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Jam mulai" htmlFor="schedule-start" required>
              <Input
                id="schedule-start"
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm({ ...form, startTime: e.target.value })
                }
              />
            </Field>
            <Field label="Jam selesai" htmlFor="schedule-end" required>
              <Input
                id="schedule-end"
                type="time"
                value={form.endTime}
                onChange={(e) =>
                  setForm({ ...form, endTime: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Ruangan" htmlFor="schedule-room">
            <Input
              id="schedule-room"
              value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              placeholder="mis. R. 301 / Lab 2"
            />
          </Field>
          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Simpan perubahan" : "Tambah jadwal"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus jadwal?"
        message={
          deleting
            ? `"${deleting.title}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="Hapus jadwal"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
