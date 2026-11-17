"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureProfile, fetchTasks } from "@/lib/data";
import { translateError } from "@/lib/errors";
import { maybeNotifyUpcoming } from "@/lib/reminders";
import { seedIfNewUser } from "@/lib/seed";
import {
  applyTheme,
  readThemeChoice,
  saveThemeChoice,
  watchSystemTheme,
} from "@/lib/theme";
import type { Profile } from "@/lib/types";
import { Icon, type IconName } from "./icons";
import { Button, Modal, Skeleton } from "./ui";

/* ------------------------------------------------------------------ */
/* Konteks aplikasi: client, user, dan profil untuk semua halaman      */
/* ------------------------------------------------------------------ */

interface AppContextValue {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
  refreshProfile: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp harus dipakai di dalam AppShell.");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Navigasi                                                            */
/* ------------------------------------------------------------------ */

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Beranda", icon: "home" },
  { href: "/jadwal", label: "Jadwal", icon: "calendar" },
  { href: "/tugas", label: "Tugas", icon: "tasks" },
  { href: "/catatan", label: "Catatan", icon: "notes" },
  { href: "/nilai", label: "Nilai & IPK", icon: "chart" },
  { href: "/target", label: "Target & Statistik", icon: "target" },
  { href: "/cari", label: "Pencarian", icon: "search" },
  { href: "/pengaturan", label: "Pengaturan", icon: "settings" },
];

// Bottom nav mobile: 4 item utama + tombol "Lainnya" (sheet).
const BOTTOM_NAV = NAV_ITEMS.slice(0, 4);
const MORE_NAV = NAV_ITEMS.slice(4);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
        <Icon name="cap" className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          CampusOS
        </span>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Pesan setup — tampil bila env var Supabase belum diisi              */
/* ------------------------------------------------------------------ */

function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-12">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
        Supabase belum dikonfigurasi
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
        CampusOS menyimpan data di Supabase. Buat proyek Supabase gratis,
        lalu isi dua variabel berikut di file{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          .env.local
        </code>
        :
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-100">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
      </pre>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
        <li>
          Buat proyek di{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            supabase.com/dashboard
          </span>
          , lalu salin Project URL dan anon key dari Settings → API.
        </li>
        <li>
          Jalankan isi file{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            supabase/schema.sql
          </code>{" "}
          di SQL Editor Supabase (membuat tabel, RLS, dan bucket Storage).
        </li>
        <li>
          Di Authentication → Sign in providers, pastikan Email aktif.
        </li>
        <li>Restart server dev, lalu daftar akun baru dari halaman login.</li>
      </ol>
      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
        Panduan lengkap ada di README.md proyek ini.
      </p>
      <div className="mt-6">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Muat ulang halaman
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell utama                                                         */
/* ------------------------------------------------------------------ */

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState<SupabaseClient | null>(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<
    "checking" | "seeding" | "ready" | "error"
  >("checking");
  const [initError, setInitError] = useState("");
  const [initAttempt, setInitAttempt] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Terapkan tema tersimpan + dengarkan perubahan preferensi sistem.
  useEffect(() => {
    applyTheme(readThemeChoice());
    return watchSystemTheme();
  }, []);

  // M3: pengingat deadline diperiksa di shell — berlaku untuk semua
  // halaman, bukan hanya Dashboard. Diperiksa saat aplikasi siap dan
  // berkala (30 menit) selama aplikasi terbuka; maybeNotifyUpcoming
  // sendiri membatasi notifikasi maksimal sekali per jam.
  useEffect(() => {
    if (status !== "ready" || !supabase || !user) return;
    const client = supabase;
    const currentUser = user;
    let cancelled = false;
    async function check() {
      try {
        const tasks = await fetchTasks(client, currentUser.id);
        if (!cancelled) maybeNotifyUpcoming(tasks);
      } catch {
        // Pengingat bersifat best-effort: kegagalan memeriksa tidak
        // boleh mengganggu aplikasi.
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, supabase, user]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;

    async function init(client: SupabaseClient) {
      let currentUser: User | null = null;
      try {
        const { data, error } = await client.auth.getUser();
        // "Auth session missing" berarti belum login (normal) → ke /login.
        // Error lain (URL salah, offline, kunci salah) → tampilkan pesan,
        // bukan menggantung di skeleton.
        if (error && !/session missing/i.test(error.message)) {
          if (cancelled) return;
          setInitError(translateError(error, "Tidak dapat terhubung ke Supabase."));
          setStatus("error");
          return;
        }
        currentUser = data.user;
      } catch (err) {
        // Supabase tidak bisa dihubungi (URL salah, offline, dsb):
        // tampilkan pesan error, bukan menggantung di skeleton.
        if (cancelled) return;
        setInitError(translateError(err, "Tidak dapat terhubung ke Supabase."));
        setStatus("error");
        return;
      }
      if (cancelled) return;
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      try {
        const prof = await ensureProfile(client, currentUser.id);
        if (cancelled) return;
        setProfile(prof);
        // Sinkronkan tema dari profil bila tersimpan di server, dan
        // simpan ke localStorage agar kunjungan berikutnya tidak
        // berkedip dengan tema lama (m8).
        if (prof.theme && prof.theme !== readThemeChoice()) {
          saveThemeChoice(prof.theme);
        }
        setStatus("seeding");
        await seedIfNewUser(client, currentUser.id);
        if (cancelled) return;
        setStatus("ready");
      } catch (err) {
        // Gagal memuat profil/seed (mis. schema.sql belum dijalankan):
        // tetap tampilkan aplikasi dengan profil kosong agar pengguna
        // melihat pesan error yang jelas di halaman, bukan layar kosong.
        console.error("Gagal menyiapkan akun:", err);
        if (cancelled) return;
        setProfile({
          id: currentUser.id,
          full_name: "",
          program: "",
          campus: "",
          active_semester: 1,
          theme: "system",
          seeded_at: null,
          created_at: "",
          updated_at: "",
        });
        setStatus("ready");
      }
    }

    init(client);
    return () => {
      cancelled = true;
    };
  }, [supabase, router, initAttempt]);

  const refreshProfile = useMemo(
    () => async () => {
      if (!supabase || !user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data as Profile);
    },
    [supabase, user],
  );

  async function handleSignOut() {
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!isSupabaseConfigured() || !supabase) {
    return <SetupNotice />;
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-12">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
          Tidak dapat terhubung ke Supabase
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
          Periksa kembali nilai{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          di file{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            .env.local
          </code>{" "}
          dan koneksi internetmu, lalu coba lagi.
        </p>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-200">
          {initError}
        </div>
        <div className="mt-6 flex gap-2">
          <Button
            onClick={() => {
              setStatus("checking");
              setInitAttempt((n) => n + 1);
            }}
          >
            Coba lagi
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Muat ulang halaman
          </Button>
        </div>
      </div>
    );
  }

  if (status !== "ready" || !user || !profile) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-5 py-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {status === "seeding"
            ? "Menyiapkan data contoh Semester 3 untuk akunmu…"
            : "Memuat…"}
        </p>
      </div>
    );
  }

  const contextValue: AppContextValue = {
    supabase,
    user,
    profile,
    refreshProfile,
  };

  const initials = (profile.full_name || user.email || "M")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* Sidebar desktop */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-zinc-200 bg-white px-4 py-5 md:flex dark:border-zinc-800 dark:bg-zinc-900">
          <div className="px-2">
            <Logo />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Your Academic Life, Organized.
            </p>
          </div>
          <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Navigasi utama">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full bg-blue-600"
                    />
                  )}
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <Link
              href="/pengaturan"
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {profile.full_name || "Mahasiswa"}
                </span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Semester {profile.active_semester}
                  {profile.program ? ` · ${profile.program}` : ""}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Icon name="logout" className="h-5 w-5 shrink-0" />
              {signingOut ? "Keluar…" : "Keluar"}
            </button>
          </div>
        </aside>

        {/* Header mobile */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95">
          <Logo />
          <div className="flex items-center gap-1">
            <Link
              href="/cari"
              aria-label="Pencarian"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Icon name="search" className="h-5 w-5" />
            </Link>
            <Link
              href="/pengaturan"
              aria-label="Pengaturan"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Icon name="settings" className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {/* Konten */}
        <main className="w-full px-4 pt-6 pb-28 md:ml-60 md:w-[calc(100%-15rem)] md:px-8 md:pt-8 md:pb-12">
          <div className="mx-auto w-full max-w-3xl md:max-w-4xl">{children}</div>
        </main>

        {/* Bottom navigation mobile */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
          aria-label="Navigasi bawah"
        >
          <div className="mx-auto grid max-w-md grid-cols-5">
            {BOTTOM_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  <Icon name={item.icon} className="h-6 w-6" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                MORE_NAV.some((item) => isActive(pathname, item.href))
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              Lainnya
            </button>
          </div>
        </nav>

        {/* Sheet "Lainnya" */}
        <Modal
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          title="Menu lainnya"
        >
          <nav className="flex flex-col gap-1" aria-label="Menu lainnya">
            {MORE_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="mt-2 flex items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Icon name="logout" className="h-5 w-5 shrink-0" />
              {signingOut ? "Keluar…" : "Keluar"}
            </button>
          </nav>
        </Modal>
      </div>
    </AppContext.Provider>
  );
}
