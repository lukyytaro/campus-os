import type { Task } from "./types";
import { dueLabel } from "./format";

const STORAGE_KEY = "campusos:reminders-enabled";
const LAST_SHOWN_KEY = "campusos:reminders-last-shown";

/**
 * Pengingat deadline via Notification API browser.
 * Tanpa scheduler server: pengingat diperiksa AppShell setiap kali
 * aplikasi dibuka (di halaman mana pun) dan berkala setiap 30 menit
 * selama aplikasi terbuka; notifikasi dibatasi sekali per jam.
 * Pengiriman latar belakang saat aplikasi tertutup tidak dimungkinkan
 * tanpa server push — ini dicatat di Pengaturan.
 */

export function remindersEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setRemindersEnabled(enabled: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Minta izin notifikasi ke browser. Mengembalikan true bila diizinkan. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Tugas yang deadline-nya dalam 24 jam ke depan dan belum selesai. */
export function upcomingTasks(tasks: Task[]): Task[] {
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;
  return tasks
    .filter(
      (t) =>
        t.status !== "selesai" &&
        new Date(t.due_date).getTime() >= now &&
        new Date(t.due_date).getTime() <= in24h,
    )
    .sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date));
}

/** Tampilkan satu notifikasi ringkasan bila ada deadline mendekat.
 *  Dibatasi sekali per jam agar tidak mengganggu. */
export function maybeNotifyUpcoming(tasks: Task[]): void {
  if (!remindersEnabled() || !notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  const upcoming = upcomingTasks(tasks);
  if (upcoming.length === 0) return;

  const lastShown = Number(
    window.localStorage.getItem(LAST_SHOWN_KEY) ?? "0",
  );
  if (Date.now() - lastShown < 60 * 60 * 1000) return;
  window.localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));

  const first = upcoming[0];
  const body =
    upcoming.length === 1
      ? `${first.title} — ${dueLabel(first.due_date)}.`
      : `${first.title} dan ${upcoming.length - 1} tugas lain mendekati deadline.`;
  new Notification("CampusOS — Deadline mendekat", { body });
}
