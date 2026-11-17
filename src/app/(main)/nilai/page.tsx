"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppShell";
import { CoursePicker } from "@/components/CoursePicker";
import { GpaLineChart } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
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
import { buildCsv, downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import { fetchCourses, fetchGrades } from "@/lib/data";
import { translateError } from "@/lib/errors";
import { formatScore } from "@/lib/format";
import {
  cumulativeGpa,
  gpaBySemester,
  isValidScore,
  totalSksGraded,
} from "@/lib/gpa";
import type { Course, Grade } from "@/lib/types";
import { useMountLoad } from "@/lib/use-mount-load";

function NilaiPageInner() {
  const { supabase, user, profile } = useApp();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  // Baris nilai yang disorot dari deep-link pencarian (?mk=<courseId>).
  const [highlightGradeId, setHighlightGradeId] = useState<string | null>(null);

  // Form tambah/ubah nilai
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [courseId, setCourseId] = useState("");
  const [score, setScore] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Hapus nilai
  const [deleting, setDeleting] = useState<Grade | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    try {
      const [c, g] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchGrades(supabase, user.id),
      ]);
      setCourses(c);
      setGrades(g);
      // Deep-link dari Pencarian (?mk=<courseId>): sorot baris nilai MK
      // tersebut, atau buka form tambah nilai bila MK-nya belum dinilai.
      const mk = searchParams.get("mk");
      if (mk) {
        const course = c.find((x) => x.id === mk);
        const grade = g.find((x) => x.course_id === mk);
        if (course && grade) {
          setHighlightGradeId(grade.id);
          window.setTimeout(() => {
            document
              .getElementById(`nilai-${grade.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 100);
        } else if (course) {
          openAdd(mk);
        } else {
          // Deep-link ke mata kuliah yang sudah dihapus: beri tahu
          // pengguna alih-alih diam-diam menampilkan daftar polos.
          toast("Item tidak ditemukan. Mungkin sudah dihapus.", "error");
        }
        router.replace("/nilai", { scroll: false });
      }
    } catch (err) {
      setError(translateError(err, "Gagal memuat nilai."));
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

  const ipk = useMemo(
    () => cumulativeGpa(grades, coursesById),
    [grades, coursesById],
  );
  const totalSks = useMemo(
    () => totalSksGraded(grades, coursesById),
    [grades, coursesById],
  );
  const perSemester = useMemo(
    () => gpaBySemester(grades, coursesById),
    [grades, coursesById],
  );

  const gradesBySemester = useMemo(() => {
    const map = new Map<number, Grade[]>();
    for (const g of grades) {
      const list = map.get(g.semester) ?? [];
      list.push(g);
      map.set(g.semester, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const nameA = coursesById.get(a.course_id)?.name ?? "";
        const nameB = coursesById.get(b.course_id)?.name ?? "";
        return nameA.localeCompare(nameB, "id");
      });
    }
    return [...map.entries()].sort(([a], [b]) => b - a); // semester terbaru dulu
  }, [grades, coursesById]);

  // Mata kuliah yang belum punya nilai (untuk form tambah).
  const ungradedCourses = useMemo(() => {
    const gradedIds = new Set(grades.map((g) => g.course_id));
    return courses.filter((c) => !gradedIds.has(c.id));
  }, [courses, grades]);

  function openAdd(prefillCourseId?: string) {
    setEditing(null);
    setCourseId(prefillCourseId ?? ungradedCourses[0]?.id ?? "");
    setScore("");
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(g: Grade) {
    setEditing(g);
    setCourseId(g.course_id);
    setScore(String(g.score));
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const course = coursesById.get(courseId);
    if (!course) {
      setFormError("Pilih mata kuliah terlebih dahulu.");
      return;
    }
    const parsed = Number(score.trim().replace(",", "."));
    if (!isValidScore(parsed)) {
      setFormError("Nilai harus berupa angka antara 0 dan 4.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      course_id: course.id,
      semester: course.semester,
      score: Math.round(parsed * 100) / 100,
    };
    const result = editing
      ? await supabase
          .from("grades")
          .update(payload)
          .eq("id", editing.id)
          .select("*")
          .single()
      : await supabase.from("grades").insert(payload).select("*").single();
    setSaving(false);
    if (result.error || !result.data) {
      setFormError(translateError(result.error, "Gagal menyimpan nilai."));
      return;
    }
    const saved = result.data as Grade;
    setGrades((prev) =>
      editing
        ? prev.map((g) => (g.id === saved.id ? saved : g))
        : [...prev, saved],
    );
    setFormOpen(false);
    toast(editing ? "Nilai diperbarui." : "Nilai ditambahkan.");
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    const { error: err } = await supabase
      .from("grades")
      .delete()
      .eq("id", deleting.id);
    setDeleteLoading(false);
    if (err) {
      toast(translateError(err, "Gagal menghapus nilai."), "error");
      return;
    }
    setGrades((prev) => prev.filter((g) => g.id !== deleting.id));
    setDeleting(null);
    toast("Nilai dihapus.");
  }

  function gradeRows(): (string | number | null)[][] {
    return grades.map((g) => {
      const course = coursesById.get(g.course_id);
      const sks = course?.sks ?? 0;
      return [
        course?.name ?? "",
        course?.code ?? "",
        g.semester,
        sks,
        g.score,
        Number((g.score * sks).toFixed(2)),
      ];
    });
  }

  function handleExportCsv() {
    const csv = buildCsv(
      ["Mata Kuliah", "Kode", "Semester", "SKS", "Nilai", "Nilai x SKS"],
      gradeRows(),
    );
    downloadCsv("nilai-campusos.csv", csv);
    toast(`CSV diekspor (${grades.length} nilai).`);
  }

  function handleExportXlsx() {
    downloadXlsx(
      "nilai-campusos.xlsx",
      "Nilai",
      ["Mata Kuliah", "Kode", "Semester", "SKS", "Nilai", "Nilai x SKS"],
      gradeRows(),
    );
    toast(`Excel diekspor (${grades.length} nilai).`);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Nilai & IPK</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
            Nilai & IPK
          </h1>
          <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
            IP dihitung otomatis dengan bobot SKS: Σ(nilai × SKS) / Σ SKS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={grades.length === 0}
          >
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleExportXlsx}
            disabled={grades.length === 0}
          >
            <Icon name="download" className="h-4 w-4" /> Export Excel
          </Button>
          <Button onClick={() => openAdd()} disabled={ungradedCourses.length === 0}>
            <Icon name="plus" className="h-4 w-4" /> Tambah nilai
          </Button>
        </div>
      </header>

      {/* m5: bila tidak ada MK yang bisa dinilai, jelaskan alasannya dan
          beri jalan keluar langsung dari halaman ini. */}
      {ungradedCourses.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-50">
            {courses.length === 0
              ? "Kamu belum punya mata kuliah"
              : "Semua mata kuliah sudah punya nilai"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
            {courses.length === 0
              ? "Tambahkan mata kuliah dulu — nilai hanya bisa diisi untuk mata kuliah yang sudah terdaftar."
              : "Tombol “Tambah nilai” nonaktif karena setiap mata kuliahmu sudah dinilai. Tambahkan mata kuliah baru untuk mengisi nilai lagi."}
          </p>
          <div className="mt-4 max-w-sm">
            <CoursePicker
              label="Tambah mata kuliah"
              value={null}
              onChange={() => {}}
              courses={courses}
              onCourseAdded={(c) => setCourses((prev) => [...prev, c])}
            />
          </div>
        </div>
      )}

      {/* Ringkasan IPK */}
      <section
        aria-label="Ringkasan IPK"
        className="rounded-2xl border border-zinc-200 bg-white p-5 md:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              IPK
            </p>
            <p className="mt-1 text-5xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
              {ipk === null ? "—" : formatScore(ipk)}
              <span className="ml-1 text-lg font-medium text-zinc-400">
                / 4,00
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Total SKS dinilai
            </p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
              {totalSks} SKS
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Semester aktif
            </p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
              Semester {profile.active_semester}
            </p>
          </div>
        </div>
        {perSemester.length > 0 && (
          <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Perkembangan IP per semester
            </h2>
            <div className="mt-3">
              <GpaLineChart data={perSemester} />
            </div>
          </div>
        )}
      </section>

      {/* Nilai per semester */}
      {gradesBySemester.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={<Icon name="chart" className="h-6 w-6" />}
            title="Belum ada nilai"
            message="Tambahkan nilai per mata kuliah (skala 0–4). IP dan IPK akan dihitung otomatis berdasarkan bobot SKS."
            action={
              <Button onClick={() => openAdd()} disabled={ungradedCourses.length === 0}>
                <Icon name="plus" className="h-4 w-4" /> Tambah nilai
              </Button>
            }
          />
        </div>
      ) : (
        gradesBySemester.map(([semester, list]) => {
          const ip = perSemester.find((r) => r.semester === semester);
          return (
            <section
              key={semester}
              aria-label={`Nilai Semester ${semester}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Semester {semester}
                  {semester === profile.active_semester && (
                    <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                      (aktif)
                    </span>
                  )}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  IP{" "}
                  <span className="text-base font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                    {ip ? formatScore(ip.ip) : "—"}
                  </span>{" "}
                  · {ip?.sks ?? 0} SKS
                </p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-0 text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Mata kuliah
                      </th>
                      <th
                        scope="col"
                        className="w-14 py-2 pr-3 text-right font-medium"
                      >
                        SKS
                      </th>
                      <th
                        scope="col"
                        className="w-20 py-2 pr-3 text-right font-medium"
                      >
                        Nilai
                      </th>
                      <th scope="col" className="w-24 py-2">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {list.map((g) => {
                      const course = coursesById.get(g.course_id);
                      const highlighted = g.id === highlightGradeId;
                      return (
                        <tr
                          key={g.id}
                          id={`nilai-${g.id}`}
                          className={
                            highlighted
                              ? "bg-blue-50 dark:bg-blue-500/10"
                              : undefined
                          }
                        >
                          <td className="py-3 pr-3">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: course?.color ?? "#2563EB",
                                }}
                                aria-hidden="true"
                              />
                              <span className="font-medium text-zinc-900 [text-wrap:pretty] dark:text-zinc-50">
                                {course?.name ?? "Mata kuliah dihapus"}
                              </span>
                            </span>
                            {course?.code && (
                              <span className="ml-4 block text-xs text-zinc-400">
                                {course.code}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-3 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                            {course?.sks ?? "—"}
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                            {formatScore(g.score)}
                          </td>
                          <td className="py-3">
                            <span className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(g)}
                                aria-label={`Ubah nilai ${course?.name ?? ""}`}
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                              >
                                <Icon name="pencil" className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleting(g)}
                                aria-label={`Hapus nilai ${course?.name ?? ""}`}
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {/* Modal tambah/ubah nilai */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Ubah nilai" : "Tambah nilai"}
      >
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          <Field label="Mata kuliah" htmlFor="grade-course" required>
            <div className="relative">
              <Select
                id="grade-course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                disabled={editing !== null}
                className="disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-800"
              >
                {editing ? (
                  <option value={courseId}>
                    {coursesById.get(courseId)?.name ?? "Mata kuliah"}
                  </option>
                ) : (
                  ungradedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.sks} SKS · Sem {c.semester}
                    </option>
                  ))
                )}
              </Select>
              <Icon
                name="chevronDown"
                className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
              />
            </div>
          </Field>
          <Field
            label="Nilai (skala 0–4)"
            htmlFor="grade-score"
            required
            hint="Contoh: 3,75 untuk A-. Gunakan titik atau koma sebagai pemisah desimal."
          >
            <Input
              id="grade-score"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="mis. 3,50"
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
              {editing ? "Simpan perubahan" : "Tambah nilai"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus nilai?"
        message={
          deleting
            ? `Nilai ${coursesById.get(deleting.course_id)?.name ?? "mata kuliah ini"} akan dihapus dan IPK dihitung ulang. Tindakan ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="Hapus nilai"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}

export default function NilaiPage() {
  return (
    <Suspense>
      <NilaiPageInner />
    </Suspense>
  );
}
