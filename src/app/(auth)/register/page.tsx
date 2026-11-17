"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { translateError } from "@/lib/errors";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError(
        "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local, lalu restart server.",
      );
      return;
    }
    if (!fullName.trim()) {
      setError("Nama lengkap wajib diisi.");
      return;
    }
    if (!email.trim()) {
      setError("Email wajib diisi.");
      return;
    }
    if (password.length < 6) {
      setError("Kata sandi minimal 6 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(translateError(signUpError, "Gagal mendaftar. Coba lagi."));
      return;
    }
    // Bila proyek Supabase mewajibkan konfirmasi email, tidak ada sesi
    // yang langsung dibuat — arahkan pengguna untuk memeriksa inbox.
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setEmailSent(true);
    }
  }

  if (emailSent) {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
          Periksa emailmu
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
          Kami mengirim tautan konfirmasi ke{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {email}
          </span>
          . Buka tautan itu untuk mengaktifkan akunmu, lalu masuk. Data contoh
          Semester 3 akan disiapkan otomatis saat pertama kali kamu masuk.
        </p>
        <div className="mt-8">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => router.push("/login")}
          >
            Kembali ke halaman masuk
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
        Buat akun CampusOS
      </h1>
      <p className="mt-2 text-[15px] text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
        Gratis. Data contoh Semester 3 disiapkan otomatis untuk akun baru.
      </p>

      {error && (
        <div className="mt-6">
          <ErrorBanner message={error} />
        </div>
      )}
      {!isSupabaseConfigured() && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-500/10 dark:text-amber-200">
          Supabase belum dikonfigurasi di proyek ini. Ikuti panduan setup di
          README.md, lalu muat ulang halaman ini.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        <Field label="Nama lengkap" htmlFor="fullName" required>
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Nama lengkapmu"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nama@kampus.ac.id"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Kata sandi"
          htmlFor="password"
          required
          hint="Minimal 6 karakter."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Buat kata sandi"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label="Konfirmasi kata sandi"
          htmlFor="confirmPassword"
          required
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Ulangi kata sandi"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Daftar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          Masuk
        </Link>
      </p>
    </>
  );
}
