import type { ThemeChoice } from "./types";

const STORAGE_KEY = "campusos:theme";

/** Terapkan pilihan tema ke <html>: tambah/hapus class "dark". */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof window === "undefined") return;
  const prefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  const dark = choice === "dark" || (choice === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function saveThemeChoice(choice: ThemeChoice): void {
  window.localStorage.setItem(STORAGE_KEY, choice);
  applyTheme(choice);
}

/** Dengarkan perubahan preferensi sistem saat tema = "system". */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readThemeChoice() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
