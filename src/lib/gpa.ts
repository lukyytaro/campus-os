import type { Course, Grade } from "./types";

/**
 * Perhitungan IP / IPK dengan bobot SKS:
 *   IP = Σ (nilai × SKS) / Σ SKS
 * Nilai valid pada skala 0–4 (juga ditegakkan constraint di database).
 */

export function isValidScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= 4;
}

/** IP satu semester dari daftar nilai + SKS mata kuliahnya.
 *  Mengembalikan null bila belum ada nilai di semester itu. */
export function semesterGpa(
  grades: Grade[],
  coursesById: Map<string, Course>,
): number | null {
  let weighted = 0;
  let totalSks = 0;
  for (const g of grades) {
    const course = coursesById.get(g.course_id);
    const sks = course?.sks ?? 0;
    if (sks <= 0) continue;
    weighted += g.score * sks;
    totalSks += sks;
  }
  if (totalSks === 0) return null;
  return weighted / totalSks;
}

/** IPK kumulatif dari semua nilai. Null bila belum ada nilai. */
export function cumulativeGpa(
  grades: Grade[],
  coursesById: Map<string, Course>,
): number | null {
  return semesterGpa(grades, coursesById);
}

/** Total SKS yang sudah ada nilainya. */
export function totalSksGraded(
  grades: Grade[],
  coursesById: Map<string, Course>,
): number {
  let total = 0;
  for (const g of grades) {
    total += coursesById.get(g.course_id)?.sks ?? 0;
  }
  return total;
}

/** IP per semester, diurutkan menaik — titik data untuk chart. */
export function gpaBySemester(
  grades: Grade[],
  coursesById: Map<string, Course>,
): { semester: number; ip: number; sks: number }[] {
  const bySemester = new Map<number, Grade[]>();
  for (const g of grades) {
    const list = bySemester.get(g.semester) ?? [];
    list.push(g);
    bySemester.set(g.semester, list);
  }
  return [...bySemester.entries()]
    .sort(([a], [b]) => a - b)
    .map(([semester, list]) => ({
      semester,
      ip: semesterGpa(list, coursesById) ?? 0,
      sks: totalSksGraded(list, coursesById),
    }))
    .filter((row) => row.ip > 0 || row.sks > 0);
}
