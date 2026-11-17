"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { downloadJson } from "@/lib/csv";
import { translateError } from "@/lib/errors";
import { fetchAllUserData, updateProfile } from "@/lib/data";
import {
  notificationsSupported,
  remindersEnabled,
  requestNotificationPermission,
  setRemindersEnabled,
} from "@/lib/reminders";
import { resetToSampleData } from "@/lib/seed";
import { saveThemeChoice } from "@/lib/theme";
import type { ThemeChoice } from "@/lib/types";

const THEME_OPTIONS: { id: ThemeChoice; label: string; icon: "monitor" | "sun" | "moon" }[] = [
  { id: "system", label: "Sistem", icon: "monitor" },
  { id: "light", label: "Terang", icon: "sun" },
  { id: "dark", label: "Gelap", icon: "moon" },
];

export default function PengaturanPage() {
  const { supabase, user, profile, refreshProfile } = useApp();
  const toast = useToast();
  const router = useRouter();

  // Profil
  const [fullName, setFullName] = useState(profile.full_name);
  const [program, setProgram] = useState(profile.program);
  const [campus, setCampus] = useState(profile.campus);
  const [semester, setSemester] = useState(profile.active_semester);
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Tema
  const [theme, setTheme] = useState<ThemeChoice>(profile.theme ?? "system");
  const [savingTheme, setSavingTheme] = useState(false);

  // Notifikasi
  const [reminders, setReminders] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [togglingReminders, setTogglingReminders] = useState(false);

  // Backup & reset
  const [backingUp, setBackingUp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Keluar
  const [signingOut, setSigningOut] = useState(false);

  // Baca preferensi notifikasi dari browser setelah mount (dibungkus
  // setTimeout agar pembaruan state tidak sinkron di dalam effect).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReminders(remindersEnabled());
      if (notificationsSupported()) {
        setNotificationPermission(Notification.permission);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const profileDirty =
    fullName !== profile.full_name ||
    program !== profile.program ||
    campus !== profile.campus ||
    semester !== profile.active_semester;

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError("");
    if (semester < 1 || semester > 14) {
      setProfileError("Semester aktif harus antara 1 dan 14.");
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(supabase, user.id, {
        full_name: fullName.trim(),
        program: program.trim(),
        campus: campus.trim(),
        active_semester: semester,
      });
      await refreshProfile();
      toast("Profil disimpan.");
    } catch (err) {
      setProfileError(translateError(err, "Gagal menyimpan profil."));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleThemeChange(choice: ThemeChoice) {
    setTheme(choice);
    // saveThemeChoice sudah memanggil applyTheme di dalamnya.
    saveThemeChoice(choice);
    setSavingTheme(true);
    try {
      await updateProfile(supabase, user.id, { theme: choice });
      await refreshProfile();
    } catch {
      // Tema lokal sudah diterapkan; kegagalan sinkronisasi ke server
      // tidak menghalangi — pilihan tetap tersimpan di perangkat ini.
    } finally {
      setSavingTheme(false);
    }
  }

  async function handleToggleReminders(next: boolean) {
    if (next) {
      if (!notificationsSupported()) {
        toast("Browser ini tidak mendukung notifikasi.", "error");
        return;
      }
      setTogglingReminders(true);
      const granted = await requestNotificationPermission();
      setTogglingReminders(false);
      setNotificationPermission(Notification.permission);
      if (!granted) {
        toast(
          "Izin notifikasi ditolak. Aktifkan dari pengaturan browser bila berubah pikiran.",
          "error",
        );
        return;
      }
    }
    setRemindersEnabled(next);
    setReminders(next);
    toast(
      next
        ? "Pengingat deadline diaktifkan. Kamu akan diingatkan saat membuka CampusOS (atau selama aplikasi terbuka) bila ada tugas yang deadline-nya kurang dari 24 jam."
        : "Pengingat deadline dimatikan.",
    );
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      const data = await fetchAllUserData(supabase, user.id);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`campusos-backup-${stamp}.json`, data);
      toast("Backup data diunduh sebagai JSON.");
    } catch (err) {
      toast(translateError(err, "Gagal membuat backup."), "error");
    } finally {
      setBackingUp(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await resetToSampleData(supabase, user.id);
      await refreshProfile();
      setResetOpen(false);
      toast("Data dikembalikan ke data contoh Semester 3.");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast(translateError(err, "Gagal mereset data."), "error");
    } finally {
      setResetting(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] md:text-3xl dark:text-zinc-50">
          Pengaturan
        </h1>
        <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">
          Profil, tema, pengingat, dan datamu.
        </p>
      </header>

      {/* Profil */}
      <section
        aria-label="Profil pengguna"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Profil
        </h2>
        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4" noValidate>
          <Field label="Nama lengkap" htmlFor="profile-name">
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nama lengkapmu"
              autoComplete="name"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Program studi" htmlFor="profile-program">
              <Input
                id="profile-program"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="mis. Teknik Informatika"
              />
            </Field>
            <Field label="Kampus" htmlFor="profile-campus">
              <Input
                id="profile-campus"
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                placeholder="Nama kampusmu"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Semester aktif"
              htmlFor="profile-semester"
              hint="Menentukan target belajar dan IP semester yang ditampilkan."
            >
              <div className="relative">
                <Select
                  id="profile-semester"
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                >
                  {Array.from({ length: 14 }, (_, i) => i + 1).map((s) => (
                    <option key={s} value={s}>
                      Semester {s}
                    </option>
                  ))}
                </Select>
                <Icon
                  name="chevronDown"
                  className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                />
              </div>
            </Field>
            <Field label="Email" htmlFor="profile-email">
              <Input
                id="profile-email"
                value={user.email ?? ""}
                disabled
                className="disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-800"
              />
            </Field>
          </div>
          {profileError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {profileError}
            </p>
          )}
          <Button type="submit" loading={savingProfile} disabled={!profileDirty}>
            Simpan profil
          </Button>
        </form>
      </section>

      {/* Tema */}
      <section
        aria-label="Tema tampilan"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Tema
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          “Sistem” mengikuti pengaturan terang/gelap perangkatmu.
        </p>
        <div
          className="mt-4 grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Pilihan tema"
        >
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={theme === opt.id}
              onClick={() => handleThemeChange(opt.id)}
              disabled={savingTheme}
              className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${
                theme === opt.id
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <Icon name={opt.icon} className="h-5 w-5" />
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Pengingat deadline */}
      <section
        aria-label="Pengingat deadline"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              <Icon name="bell" className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              Pengingat deadline
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
              Saat aktif, CampusOS menampilkan notifikasi browser bila ada
              tugas yang deadline-nya kurang dari 24 jam. Pengingat
              diperiksa setiap kali kamu membuka aplikasi (di halaman mana
              pun) dan berkala selama aplikasi terbuka — tanpa server
              tambahan, jadi tidak ada notifikasi saat aplikasi tertutup.
            </p>
            {!notificationsSupported() && (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Browser ini tidak mendukung Notification API.
              </p>
            )}
            {notificationsSupported() &&
              notificationPermission === "denied" && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                  Izin notifikasi ditolak di browser ini. Ubah dari ikon gembok
                  di address bar bila ingin mengaktifkan lagi.
                </p>
              )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reminders}
            aria-label="Aktifkan pengingat deadline"
            onClick={() => handleToggleReminders(!reminders)}
            disabled={togglingReminders || !notificationsSupported()}
            className="flex h-10 w-12 shrink-0 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-50"
          >
            <span
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                reminders ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  reminders ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>
      </section>

      {/* Data: backup & reset */}
      <section
        aria-label="Data dan backup"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Data
        </h2>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-50">
                Backup data
              </p>
              <p className="mt-0.5 text-sm text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
                Unduh seluruh datamu (profil, mata kuliah, jadwal, tugas,
                catatan, nilai, target, log belajar) sebagai file JSON.
              </p>
            </div>
            <Button variant="outline" onClick={handleBackup} loading={backingUp}>
              <Icon name="download" className="h-4 w-4" /> Unduh backup
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-red-700 dark:text-red-400">
                Reset ke data contoh
              </p>
              <p className="mt-0.5 text-sm text-zinc-500 [text-wrap:pretty] dark:text-zinc-400">
                Menghapus semua datamu dan mengembalikan data contoh Semester
                3, termasuk lampiran catatan. Semester aktif dikembalikan ke
                3. Tindakan ini tidak bisa dibatalkan — unduh backup dulu
                bila perlu.
              </p>
            </div>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              Reset ke data contoh
            </Button>
          </div>
        </div>
      </section>

      {/* Akun */}
      <section
        aria-label="Akun"
        className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Akun
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Masuk sebagai {user.email ?? "—"}.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={handleSignOut} loading={signingOut}>
            <Icon name="logout" className="h-4 w-4" /> Keluar dari akun
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Reset ke data contoh?"
        message="Semua mata kuliah, jadwal, tugas, catatan (termasuk lampirannya), nilai, target, dan log belajarmu akan dihapus, lalu diganti dengan data contoh Semester 3. Profilmu (nama, program studi, kampus) tetap dipertahankan, tetapi semester aktif dikembalikan ke 3 sesuai data contoh. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Ya, reset dataku"
        danger
        loading={resetting}
      />
    </div>
  );
}
