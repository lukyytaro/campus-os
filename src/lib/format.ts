/** Format tanggal, waktu, dan angka dalam Bahasa Indonesia. */

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_FMT_LONG = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DATE_FMT_SHORT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "17 Nov 2026" */
export function formatDate(value: string | Date): string {
  return DATE_FMT.format(toDate(value));
}

/** "Selasa, 17 November 2026" */
export function formatDateLong(value: string | Date): string {
  return DATE_FMT_LONG.format(toDate(value));
}

/** "17 Nov" */
export function formatDateShort(value: string | Date): string {
  return DATE_FMT_SHORT.format(toDate(value));
}

/** "14.30" */
export function formatTime(value: string | Date): string {
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5).replace(":", ".");
  }
  return TIME_FMT.format(toDate(value));
}

/** "08.00–09.40" */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** "3,75" (desimal koma, gaya Indonesia) */
export function formatScore(value: number): string {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "6,5 jam" dari menit. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`;
}

/** Label relatif deadline: "Hari ini", "Besok", "2 hari lagi", "Terlewat 1 hari". */
export function dueLabel(dueDate: string | Date): string {
  const now = new Date();
  const due = toDate(dueDate);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round(
    (startOfDue.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return n === 1 ? "Terlewat 1 hari" : `Terlewat ${n} hari`;
  }
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Besok";
  if (diffDays <= 7) return `${diffDays} hari lagi`;
  return formatDate(due);
}

/** True bila deadline sudah lewat (dan tugas belum selesai). */
export function isOverdue(dueDate: string | Date): boolean {
  return toDate(dueDate).getTime() < Date.now();
}

/** YYYY-MM-DD lokal (untuk input date & kolom date). */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-11-17T14:30" untuk input datetime-local. */
export function toDateTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${toDateInputValue(date)}T${h}:${min}`;
}

/** Senin minggu ini (awal minggu, jam 00.00). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Minggu
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** "Minggu, 15 Nov" — label minggu untuk chart. */
export function weekLabel(monday: Date): string {
  return formatDateShort(monday);
}
