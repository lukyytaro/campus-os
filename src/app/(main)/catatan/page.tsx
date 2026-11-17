"use client";

import { Suspense, useMemo, useRef, useState, type FormEvent } from "react";
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
import { fetchCourses, fetchNotes } from "@/lib/data";
import { translateError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import type { Course, Note } from "@/lib/types";
import { useMountLoad } from "@/lib/use-mount-load";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function NotesPageInner() {
  const { supabase, user } = useApp();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("semua");

  // Editor — dibuka otomatis dari tautan "Tambah catatan" di Dashboard
  // (?baru=1), via nilai awal state.
  const [editorOpen, setEditorOpen] = useState(
    () => searchParams.get("baru") === "1",
  );
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Lampiran
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  // Hapus catatan
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    try {
      const [c, n] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchNotes(supabase, user.id),
      ]);
      setCourses(c);
      setNotes(n);
      // Deep-link dari Pencarian (?buka=<id>): buka editor catatan
      // yang diklik, bukan sekadar daftar catatan.
      const buka = searchParams.get("buka");
      if (buka) {
        const target = n.find((x) => x.id === buka);
        if (target) {
          openEditor(target);
        } else {
          // Deep-link ke catatan yang sudah dihapus: beri tahu pengguna
          // alih-alih diam-diam menampilkan daftar polos.
          toast("Item tidak ditemukan. Mungkin sudah dihapus.", "error");
        }
        router.replace("/catatan", { scroll: false });
      }
    } catch (err) {
      setError(translateError(err, "Gagal memuat catatan."));
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

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (courseFilter !== "semua" && n.course_id !== courseFilter) {
        return false;
      }
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
      );
    });
  }, [notes, query, courseFilter]);

  /** Buat signed URL sementara untuk melihat/mengunduh lampiran. */
  async function loadAttachmentUrl(path: string) {
    setAttachmentLoading(true);
    const { data, error: err } = await supabase.storage
      .from("note-attachments")
      .createSignedUrl(path, 3600);
    setAttachmentLoading(false);
    if (err || !data) {
      toast("Gagal memuat lampiran.", "error");
      return;
    }
    setAttachmentUrl(data.signedUrl);
  }

  function openEditor(note: Note | null) {
    setEditing(note);
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setCourseId(note?.course_id ?? null);
    setPendingFile(null);
    setRemoveAttachment(false);
    setAttachmentUrl(null);
    setFormError("");
    setEditorOpen(true);
    if (note?.attachment_path) {
      void loadAttachmentUrl(note.attachment_path);
    }
  }

  function handleFileSelect(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFormError("Ukuran file maksimal 10 MB.");
      return;
    }
    setFormError("");
    setPendingFile(file);
    setRemoveAttachment(false);
  }

  async function uploadPendingFile(): Promise<{
    path: string;
    name: string;
  } | null> {
    if (!pendingFile) return null;
    setUploading(true);
    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("note-attachments")
      .upload(path, pendingFile, { cacheControl: "3600", upsert: false });
    setUploading(false);
    if (error) {
      throw error;
    }
    return { path, name: pendingFile.name };
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!title.trim()) {
      setFormError("Judul catatan wajib diisi.");
      return;
    }
    setSaving(true);
    // m13: jangan tinggalkan file yatim di Storage. File lama baru
    // dihapus SETELAH operasi DB berhasil; file baru yang sudah
    // terunggah dihapus lagi bila operasi DB gagal.
    let uploadedPath: string | null = null;
    let oldPathToDelete: string | null = null;
    try {
      let attachmentPath = editing?.attachment_path ?? null;
      let attachmentName = editing?.attachment_name ?? null;

      // Unggah file baru bila ada; tandai file lama untuk dihapus nanti.
      if (pendingFile) {
        const uploaded = await uploadPendingFile();
        if (uploaded) {
          uploadedPath = uploaded.path;
          if (editing?.attachment_path) {
            oldPathToDelete = editing.attachment_path;
          }
          attachmentPath = uploaded.path;
          attachmentName = uploaded.name;
        }
      } else if (removeAttachment && editing?.attachment_path) {
        oldPathToDelete = editing.attachment_path;
        attachmentPath = null;
        attachmentName = null;
      }

      const payload = {
        user_id: user.id,
        course_id: courseId,
        title: title.trim(),
        content: content.trim(),
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
      };
      const result = editing
        ? await supabase
            .from("notes")
            .update(payload)
            .eq("id", editing.id)
            .select("*")
            .single()
        : await supabase.from("notes").insert(payload).select("*").single();
      if (result.error || !result.data) {
        throw result.error ?? new Error("Gagal menyimpan catatan.");
      }
      // DB berhasil: baru sekarang hapus file lama yang diganti/dihapus.
      if (oldPathToDelete) {
        await supabase.storage
          .from("note-attachments")
          .remove([oldPathToDelete]);
      }
      const saved = result.data as Note;
      setNotes((prev) =>
        editing
          ? prev.map((n) => (n.id === saved.id ? saved : n))
          : [saved, ...prev],
      );
      setEditorOpen(false);
      toast(editing ? "Catatan diperbarui." : "Catatan ditambahkan.");
    } catch (err) {
      // DB gagal setelah upload: hapus file baru agar tidak yatim.
      if (uploadedPath) {
        await supabase.storage
          .from("note-attachments")
          .remove([uploadedPath])
          .catch(() => {});
      }
      setFormError(translateError(err, "Gagal menyimpan catatan."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    if (deleting.attachment_path) {
      await supabase.storage
        .from("note-attachments")
        .remove([deleting.attachment_path]);
    }
    const { error: err } = await supabase
      .from("notes")
      .delete()
      .eq("id", deleting.id);
    setDeleteLoading(false);
    if (err) {
      toast(translateError(err, "Gagal menghapus catatan."), "error");
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== deleting.id));
    setDeleting(null);
    toast("Catatan dihapus.");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Catatan Materi</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
            Catatan Materi
          </h1>
          <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
            {notes.length} catatan tersimpan
          </p>
        </div>
        <Button onClick={() => openEditor(null)}>
          <Icon name="plus" className="h-4 w-4" /> Tambah catatan
        </Button>
      </header>

      {/* Cari & filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-zinc-400"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul atau isi catatan…"
            aria-label="Cari catatan"
            className="pl-10"
          />
        </div>
        <div className="relative sm:w-64">
          <label htmlFor="note-course-filter" className="sr-only">
            Filter berdasarkan mata kuliah
          </label>
          <Select
            id="note-course-filter"
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
      </div>

      {visibleNotes.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={<Icon name="notes" className="h-6 w-6" />}
            title={
              notes.length === 0
                ? "Belum ada catatan"
                : "Tidak ada catatan yang cocok"
            }
            message={
              notes.length === 0
                ? "Tulis ringkasan materi kuliah di sini — bisa dilampiri foto papan tulis atau file PDF."
                : "Coba kata kunci atau filter mata kuliah lain."
            }
            action={
              notes.length === 0 ? (
                <Button onClick={() => openEditor(null)}>
                  <Icon name="plus" className="h-4 w-4" /> Tambah catatan
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCourseFilter("semua");
                  }}
                >
                  Hapus filter
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleNotes.map((n) => {
            const course = n.course_id ? coursesById.get(n.course_id) : undefined;
            const excerpt = n.content.replace(/\s+/g, " ").trim();
            return (
              <li
                key={n.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => openEditor(n)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-[15px] font-medium text-zinc-900 [text-wrap:pretty] hover:text-blue-700 dark:text-zinc-50 dark:hover:text-blue-400">
                      {n.title}
                    </span>
                    {excerpt && (
                      <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
                        {excerpt}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap items-center gap-2">
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
                      <span className="text-sm text-zinc-400 dark:text-zinc-500">
                        Diperbarui {formatDate(n.updated_at)}
                      </span>
                      {n.attachment_name && (
                        <Badge tone="blue">
                          <Icon name="paperclip" className="h-3.5 w-3.5" />
                          {n.attachment_name}
                        </Badge>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(n)}
                    aria-label={`Hapus ${n.title}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Editor catatan */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Ubah catatan" : "Catatan baru"}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4" noValidate>
          <Field label="Judul" htmlFor="note-title" required>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Normalisasi: 1NF sampai 3NF"
            />
          </Field>
          <CoursePicker
            value={courseId}
            onChange={setCourseId}
            courses={courses}
            onCourseAdded={(c) => setCourses((prev) => [...prev, c])}
          />
          <Field label="Isi catatan" htmlFor="note-content">
            <Textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tulis ringkasan materimu di sini…"
              className="min-h-56"
            />
          </Field>

          {/* Lampiran */}
          <div className="space-y-2">
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Lampiran
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            {editing?.attachment_path && !removeAttachment && !pendingFile ? (
              <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Icon name="paperclip" className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {editing.attachment_name ?? "Lampiran"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      let url = attachmentUrl;
                      if (!url && editing.attachment_path) {
                        setAttachmentLoading(true);
                        const { data } = await supabase.storage
                          .from("note-attachments")
                          .createSignedUrl(editing.attachment_path, 3600);
                        setAttachmentLoading(false);
                        url = data?.signedUrl ?? null;
                        if (url) setAttachmentUrl(url);
                      }
                      if (url) {
                        window.open(url, "_blank", "noopener");
                      } else {
                        toast("Gagal memuat lampiran.", "error");
                      }
                    }}
                    disabled={attachmentLoading}
                  >
                    {attachmentLoading ? "Memuat…" : "Lihat"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveAttachment(true)}
                  >
                    Hapus
                  </Button>
                </div>
                {attachmentUrl &&
                  isImageFile(editing.attachment_name ?? "") && (
                    // Lampiran adalah signed URL Supabase (host dinamis, di
                    // luar remotePatterns), jadi tidak bisa memakai next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachmentUrl}
                      alt={`Lampiran ${editing.attachment_name ?? ""}`}
                      className="mt-3 max-h-64 w-full rounded-lg object-contain bg-zinc-100 dark:bg-zinc-800"
                    />
                  )}
              </div>
            ) : pendingFile ? (
              <div className="flex items-center gap-2 rounded-xl border border-blue-600/30 bg-blue-50/50 p-3 dark:border-blue-500/40 dark:bg-blue-500/5">
                <Icon name="paperclip" className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {pendingFile.name}
                </span>
                <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
                  {(pendingFile.size / 1024).toFixed(0)} KB
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingFile(null)}
                >
                  Batal
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="upload" className="h-4 w-4" />
                {removeAttachment ? "Pilih file lain" : "Lampirkan file/gambar"}
              </Button>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Maksimal 10 MB. File disimpan privat di Supabase Storage dan
              hanya bisa diakses olehmu.
            </p>
          </div>

          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving || uploading}>
              {editing ? "Simpan perubahan" : "Simpan catatan"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus catatan?"
        message={
          deleting
            ? `"${deleting.title}" beserta lampirannya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel="Hapus catatan"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense>
      <NotesPageInner />
    </Suspense>
  );
}
