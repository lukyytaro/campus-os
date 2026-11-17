"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Input,
  Skeleton,
} from "@/components/ui";
import {
  fetchCourses,
  fetchNotes,
  fetchSchedules,
  fetchTasks,
} from "@/lib/data";
import { translateError } from "@/lib/errors";
import { dueLabel, formatDate, formatTimeRange } from "@/lib/format";
import { useMountLoad } from "@/lib/use-mount-load";
import {
  DAY_NAMES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Course,
  type Note,
  type Schedule,
  type Task,
} from "@/lib/types";

interface SearchHit {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

export default function CariPage() {
  const { supabase, user } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  async function load() {
    try {
      const [c, t, n, s] = await Promise.all([
        fetchCourses(supabase, user.id),
        fetchTasks(supabase, user.id),
        fetchNotes(supabase, user.id),
        fetchSchedules(supabase, user.id),
      ]);
      setCourses(c);
      setTasks(t);
      setNotes(n);
      setSchedules(s);
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

  const q = query.trim().toLowerCase();

  const taskHits: SearchHit[] = useMemo(() => {
    if (!q) return [];
    return tasks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          coursesById.get(t.course_id ?? "")?.name.toLowerCase().includes(q),
      )
      .map((t) => ({
        key: t.id,
        title: t.title,
        subtitle: `${coursesById.get(t.course_id ?? "")?.name ?? "Tanpa mata kuliah"} · ${dueLabel(t.due_date)} · ${STATUS_LABEL[t.status]}`,
        href: `/tugas?fokus=${t.id}`,
        badge: PRIORITY_LABEL[t.priority],
      }));
  }, [q, tasks, coursesById]);

  const noteHits: SearchHit[] = useMemo(() => {
    if (!q) return [];
    return notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          coursesById.get(n.course_id ?? "")?.name.toLowerCase().includes(q),
      )
      .map((n) => ({
        key: n.id,
        title: n.title,
        subtitle: `${coursesById.get(n.course_id ?? "")?.name ?? "Tanpa mata kuliah"} · Diperbarui ${formatDate(n.updated_at)}`,
        href: `/catatan?buka=${n.id}`,
      }));
  }, [q, notes, coursesById]);

  const scheduleHits: SearchHit[] = useMemo(() => {
    if (!q) return [];
    return schedules
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.room.toLowerCase().includes(q) ||
          coursesById.get(s.course_id ?? "")?.name.toLowerCase().includes(q),
      )
      .map((s) => ({
        key: s.id,
        title: s.title,
        subtitle:
          s.day_of_week !== null
            ? `${DAY_NAMES[s.day_of_week - 1]} · ${formatTimeRange(s.start_time, s.end_time)}${s.room ? ` · ${s.room}` : ""}`
            : `${formatDate(`${s.event_date}T12:00:00`)} · ${formatTimeRange(s.start_time, s.end_time)}${s.room ? ` · ${s.room}` : ""}`,
        href: `/jadwal?fokus=${s.id}`,
      }));
  }, [q, schedules, coursesById]);

  const courseHits: SearchHit[] = useMemo(() => {
    if (!q) return [];
    return courses
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.lecturer.toLowerCase().includes(q),
      )
      .map((c) => ({
        key: c.id,
        title: c.name,
        subtitle: `${c.code ? `${c.code} · ` : ""}${c.sks} SKS · Semester ${c.semester}${c.lecturer ? ` · ${c.lecturer}` : ""}`,
        href: `/nilai?mk=${c.id}`,
      }));
  }, [q, courses]);

  const totalHits =
    taskHits.length + noteHits.length + scheduleHits.length + courseHits.length;

  const groups: { label: string; icon: "tasks" | "notes" | "calendar" | "book"; hits: SearchHit[] }[] = [
    { label: "Tugas", icon: "tasks", hits: taskHits },
    { label: "Catatan", icon: "notes", hits: noteHits },
    { label: "Jadwal", icon: "calendar", hits: scheduleHits },
    { label: "Mata kuliah", icon: "book", hits: courseHits },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Pencarian</h1>
        <ErrorBanner message={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
          Pencarian
        </h1>
        <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
          Cari di seluruh tugas, catatan, jadwal, dan mata kuliahmu.
        </p>
      </header>

      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-400"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari tugas, catatan, jadwal, atau mata kuliah…"
          aria-label="Cari di CampusOS"
          autoFocus
          className="h-12 pl-11 text-base"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Hapus pencarian"
            className="absolute top-1/2 right-3 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>

      {!q ? (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={<Icon name="search" className="h-6 w-6" />}
            title="Mulai mengetik untuk mencari"
            message="Hasil akan muncul dari tugas, catatan materi, jadwal kuliah, dan mata kuliah — dikelompokkan per jenis."
          />
        </div>
      ) : totalHits === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState
            icon={<Icon name="search" className="h-6 w-6" />}
            title={`Tidak ada hasil untuk "${query.trim()}"`}
            message="Periksa ejaan kata kuncimu, atau coba kata lain yang lebih umum — misalnya nama mata kuliah."
            action={
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex h-10 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Hapus pencarian
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {totalHits} hasil untuk{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              “{query.trim()}”
            </span>
          </p>
          {groups
            .filter((g) => g.hits.length > 0)
            .map((group) => (
              <section
                key={group.label}
                aria-label={group.label}
                className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  <Icon name={group.icon} className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                  {group.label}
                  <span className="text-sm font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
                    ({group.hits.length})
                  </span>
                </h2>
                <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                  {group.hits.map((hit) => (
                    <li key={hit.key}>
                      <Link
                        href={hit.href}
                        className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-0"
                      >
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium text-zinc-900 [text-wrap:pretty] hover:text-blue-700 dark:text-zinc-50 dark:hover:text-blue-400">
                            {hit.title}
                          </span>
                          <span className="mt-0.5 block text-sm text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
                            {hit.subtitle}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {hit.badge && (
                            <Badge tone="zinc">{hit.badge}</Badge>
                          )}
                          <Icon
                            name="chevronRight"
                            className="h-4 w-4 text-zinc-400"
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
