"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
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
  Textarea,
  useToast,
} from "@/components/ui";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import { fetchCourses, fetchTasks } from "@/lib/data";
import { translateError } from "@/lib/errors";
import {
  dueLabel,
  formatDate,
  isOverdue,
  toDateTimeInputValue,
} from "@/lib/format";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Course,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { useMountLoad } from "@/lib/use-mount-load";

type SortKey = "due-asc" | "due-desc" | "priority" | "title";

const PRIORITY_TONE: Record<TaskPriority, "red" | "amber" | "zinc"> = {
  tinggi: "red",
  sedang: "amber",
  rendah: "zinc",
};

const STATUS_TONE: Record<TaskStatus, "zinc" | "blue" | "green"> = {
  belum: "zinc",
  proses: "blue",
  selesai: "green",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  tinggi: 0,
  sedang: 1,
  rendah: 2,
};

interface FormState {
  title: string;
  description: string;
  courseId: string | null;
  dueDate: string; // datetime-local
  priority: TaskPriority;
  status: TaskStatus;
}

function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(23, 59, 0, 0);
  return toDateTimeInputValue(d);
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  courseId: null,
  dueDate: defaultDue(),
  priority: "sedang",
  status: "belum",
};

function TasksPageInner() {
  const { supabase, user } = useApp();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Filter & sortir
  const [statusFilter, setStatusFilter] = useState<"semua" | TaskStatus>("semua");
  const [priorityFilter, setPriorityFilter] = useState<"semua" | TaskPriority>("semua");
  const [courseFilter, setCourseFilter] = useState<string>("semua");
  const [sortKey, setSortKey] = useState<SortKey>("due-asc");
  const [showFilters, setShowFilters] = useState(false);

  // Form tambah/ubah — dibuka otomatis dari tautan "Tambah tugas"
  // di Dashboard (?baru=1), via nilai awal state.
  const [formOpen, setFormOpen] = useState(
    () => searchParams.get("baru") === "1",
  );
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Hapus
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    try {
      const [c, t] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchTasks(supabase, user.id),
      ]);
      setCourses(c);
      setTasks(t);
      // Deep-link dari Pencarian (?fokus=<id>): buka modal ubah tugas
      // yang diklik, bukan sekadar daftar tugas.
      const fokus = searchParams.get("fokus");
      if (fokus) {
        const target = t.find((x) => x.id === fokus);
        if (target) {
          openEdit(target);
        } else {
          // Deep-link ke tugas yang sudah dihapus: beri tahu pengguna
          // alih-alih diam-diam menampilkan daftar polos.
          toast("Item tidak ditemukan. Mungkin sudah dihapus.", "error");
        }
        router.replace("/tugas", { scroll: false });
      }
    } catch (err) {
      setError(translateError(err, "Gagal memuat tugas."));
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

  const visibleTasks = useMemo(() => {
    let list = [...tasks];
    if (statusFilter !== "semua") {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (priorityFilter !== "semua") {
      list = list.filter((t) => t.priority === priorityFilter);
    }
    if (courseFilter !== "semua") {
      list = list.filter((t) => t.course_id === courseFilter);
    }
    switch (sortKey) {
      case "due-asc":
        list.sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date));
        break;
      case "due-desc":
        list.sort((a, b) => +new Date(b.due_date) - +new Date(a.due_date));
        break;
      case "priority":
        list.sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            +new Date(a.due_date) - +new Date(b.due_date),
        );
        break;
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title, "id"));
        break;
    }
    return list;
  }, [tasks, statusFilter, priorityFilter, courseFilter, sortKey]);

  const activeFilterCount = [
    statusFilter !== "semua",
    priorityFilter !== "semua",
    courseFilter !== "semua",
  ].filter(Boolean).length;

  function resetFilters() {
    setStatusFilter("semua");
    setPriorityFilter("semua");
    setCourseFilter("semua");
    setSortKey("due-asc");
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, dueDate: defaultDue() });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(t: Task) {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description,
      courseId: t.course_id,
      dueDate: toDateTimeInputValue(new Date(t.due_date)),
      priority: t.priority,
      status: t.status,
    });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim()) {
      setFormError("Judul tugas wajib diisi.");
      return;
    }
    if (!form.dueDate) {
      setFormError("Deadline wajib diisi.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      course_id: form.courseId,
      title: form.title.trim(),
      description: form.description.trim(),
      due_date: new Date(form.dueDate).toISOString(),
      priority: form.priority,
      status: form.status,
    };
    const result = editing
      ? await supabase
          .from("tasks")
          .update(payload)
          .eq("id", editing.id)
          .select("*")
          .single()
      : await supabase.from("tasks").insert(payload).select("*").single();
    setSaving(false);
    if (result.error || !result.data) {
      setFormError(translateError(result.error, "Gagal menyimpan tugas."));
      return;
    }
    const saved = result.data as Task;
    setTasks((prev) =>
      editing
        ? prev.map((t) => (t.id === saved.id ? saved : t))
        : [...prev, saved],
    );
    setFormOpen(false);
    toast(editing ? "Tugas diperbarui." : "Tugas ditambahkan.");
  }

  async function cycleStatus(t: Task) {
    const next: TaskStatus =
      t.status === "belum" ? "proses" : t.status === "proses" ? "selesai" : "belum";
    const { error: err } = await supabase
      .from("tasks")
      .update({ status: next })
      .eq("id", t.id);
    if (err) {
      toast(translateError(err, "Gagal memperbarui status."), "error");
      return;
    }
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
    );
    toast(`Status tugas diubah menjadi "${STATUS_LABEL[next]}".`);
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    const { error: err } = await supabase
      .from("tasks")
      .delete()
      .eq("id", deleting.id);
    setDeleteLoading(false);
    if (err) {
      toast(translateError(err, "Gagal menghapus tugas."), "error");
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== deleting.id));
    setDeleting(null);
    toast("Tugas dihapus.");
  }

  function taskRows(): (string | number | null)[][] {
    return visibleTasks.map((t) => [
      t.title,
      t.course_id ? (coursesById.get(t.course_id)?.name ?? "") : "",
      formatDate(t.due_date),
      PRIORITY_LABEL[t.priority],
      STATUS_LABEL[t.status],
      t.description,
    ]);
  }

  function handleExportCsv() {
    const csv = buildCsv(
      ["Judul", "Mata Kuliah", "Deadline", "Prioritas", "Status", "Deskripsi"],
      taskRows(),
    );
    downloadCsv("tugas-campusos.csv", csv);
    toast(`CSV diekspor (${visibleTasks.length} tugas).`);
  }

  function handleExportXlsx() {
    downloadXlsx(
      "tugas-campusos.xlsx",
      "Tugas",
      ["Judul", "Mata Kuliah", "Deadline", "Prioritas", "Status", "Deskripsi"],
      taskRows(),
    );
    toast(`Excel diekspor (${visibleTasks.length} tugas).`);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Tugas & Deadline</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
            Tugas & Deadline
          </h1>
          <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
            {tasks.filter((t) => t.status !== "selesai").length} tugas aktif ·{" "}
            {tasks.filter((t) => t.status === "selesai").length} selesai
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={visibleTasks.length === 0}
          >
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleExportXlsx}
            disabled={visibleTasks.length === 0}
          >
            <Icon name="download" className="h-4 w-4" /> Export Excel
          </Button>
          <Button onClick={openAdd}>
            <Icon name="plus" className="h-4 w-4" /> Tambah tugas
          </Button>
        </div>
      </header>

      {/* Filter & sortir */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Icon name="settings" className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
            <Icon
              name="chevronDown"
              className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>
          <div className="relative ml-auto">
            <label htmlFor="sort" className="sr-only">
              Urutkan tugas
            </label>
            <Select
              id="sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="w-52"
            >
              <option value="due-asc">Deadline terdekat</option>
              <option value="due-desc">Deadline terjauh</option>
              <option value="priority">Prioritas tertinggi</option>
              <option value="title">Judul A–Z</option>
            </Select>
            <Icon
              name="chevronDown"
              className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
            />
          </div>
        </div>
        {showFilters && (
          <div className="mt-4 grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-3 dark:border-zinc-800">
            <Field label="Status" htmlFor="filter-status">
              <div className="relative">
                <Select
                  id="filter-status"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "semua" | TaskStatus)
                  }
                >
                  <option value="semua">Semua status</option>
                  {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
            <Field label="Prioritas" htmlFor="filter-priority">
              <div className="relative">
                <Select
                  id="filter-priority"
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as "semua" | TaskPriority)
                  }
                >
                  <option value="semua">Semua prioritas</option>
                  {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
            <Field label="Mata kuliah" htmlFor="filter-course">
              <div className="relative">
                <Select
                  id="filter-course"
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                >
                  <option value="semua">Semua mata kuliah</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
            {activeFilterCount > 0 && (
              <div className="sm:col-span-3">
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Hapus semua filter
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Daftar tugas */}
      {visibleTasks.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={<Icon name="tasks" className="h-6 w-6" />}
            title={
              tasks.length === 0
                ? "Belum ada tugas"
                : "Tidak ada tugas yang cocok"
            }
            message={
              tasks.length === 0
                ? "Tambahkan tugas pertamamu — lengkap dengan deadline dan prioritas — agar tidak ada yang terlewat."
                : "Coba ubah filter atau sortir untuk melihat tugas lainnya."
            }
            action={
              tasks.length === 0 ? (
                <Button onClick={openAdd}>
                  <Icon name="plus" className="h-4 w-4" /> Tambah tugas
                </Button>
              ) : (
                <Button variant="outline" onClick={resetFilters}>
                  Hapus semua filter
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleTasks.map((t) => {
            const overdue = t.status !== "selesai" && isOverdue(t.due_date);
            const course = t.course_id
              ? coursesById.get(t.course_id)
              : undefined;
            return (
              <li
                key={t.id}
                className={`rounded-2xl border p-4 sm:p-5 ${
                  t.status === "selesai"
                    ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => cycleStatus(t)}
                    aria-label={`Ubah status tugas: ${t.title} (saat ini ${STATUS_LABEL[t.status]})`}
                    title={`Status: ${STATUS_LABEL[t.status]} — klik untuk mengubah`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                        t.status === "selesai"
                          ? "border-blue-600 bg-blue-600 text-white"
                          : t.status === "proses"
                            ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-500/10"
                            : "border-zinc-300 hover:border-blue-600 hover:bg-blue-50 dark:border-zinc-600 dark:hover:border-blue-500 dark:hover:bg-blue-500/10"
                      }`}
                    >
                      {t.status === "selesai" ? (
                        <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />
                      ) : t.status === "proses" ? (
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                      ) : (
                        <span className="sr-only">Belum dikerjakan</span>
                      )}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[15px] font-medium [text-wrap:pretty] ${
                        t.status === "selesai"
                          ? "text-zinc-500 line-through dark:text-zinc-400"
                          : "text-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={overdue ? "red" : "zinc"}>
                        <Icon name="clock" className="h-3.5 w-3.5" />
                        {dueLabel(t.due_date)} · {formatDate(t.due_date)}
                      </Badge>
                      <Badge tone={PRIORITY_TONE[t.priority]}>
                        {PRIORITY_LABEL[t.priority]}
                      </Badge>
                      <Badge tone={STATUS_TONE[t.status]}>
                        {STATUS_LABEL[t.status]}
                      </Badge>
                      {course && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: course.color }}
                            aria-hidden="true"
                          />
                          {course.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      aria-label={`Ubah ${t.title}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(t)}
                      aria-label={`Hapus ${t.title}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal tambah/ubah tugas */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Ubah tugas" : "Tambah tugas"}
      >
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          <Field label="Judul tugas" htmlFor="task-title" required>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="mis. Laporan praktikum normalisasi"
            />
          </Field>
          <Field label="Deskripsi" htmlFor="task-desc">
            <Textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detail tugas, tautan, atau hal yang perlu diingat…"
            />
          </Field>
          <CoursePicker
            value={form.courseId}
            onChange={(id) => setForm({ ...form, courseId: id })}
            courses={courses}
            onCourseAdded={(c) => setCourses((prev) => [...prev, c])}
          />
          <Field label="Deadline" htmlFor="task-due" required>
            <Input
              id="task-due"
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prioritas" htmlFor="task-priority" required>
              <div className="relative">
                <Select
                  id="task-priority"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value as TaskPriority })
                  }
                >
                  {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
            <Field label="Status" htmlFor="task-status" required>
              <div className="relative">
                <Select
                  id="task-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as TaskStatus })
                  }
                >
                  {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
          </div>
          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Simpan perubahan" : "Tambah tugas"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus tugas?"
        message={
          deleting
            ? `"${deleting.title}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="Hapus tugas"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageInner />
    </Suspense>
  );
}
