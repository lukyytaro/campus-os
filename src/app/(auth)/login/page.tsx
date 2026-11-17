"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { translateError } from "@/lib/errors";
import { Button, ErrorBanner, Field, Input, useToast } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // Pesan sekali tampil dari query param — dihitung saat render, bukan state.
  const notice =
    searchParams.get("registered") === "1"
      ? "Akun berhasil dibuat. Silakan masuk."
      : searchParams.get("confirmed") === "1"
        ? "Email berhasil dikonfirmasi. Silakan masuk."
        : "";
  // M1: tautan konfirmasi tidak valid / kedaluwarsa sebelumnya gagal
  // diam-diam (login hanya menangani confirmed=1). Kini tampil banner
  // error + tombol kirim ulang tautan konfirmasi.
  const confirmFailed = searchParams.get("confirmed") === "0";

  /** Kirim ulang email konfirmasi ke alamat yang diisi di form. */
  async function handleResend() {
    const supabase = createClient();
    if (!supabase) {
      setError(
        "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local, lalu restart server.",
      );
      return;
    }
    if (!email.trim()) {
      setError(
        "Isi alamat emailmu di bawah ini, lalu tekan tombol kirim ulang.",
      );
      return;
    }
    setResending(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setResending(false);
    if (resendError) {
      setError(translateError(resendError, "Gagal mengirim ulang tautan konfirmasi."));
      return;
    }
    setResendDone(true);
    toast("Tautan konfirmasi baru telah dikirim ke emailmu.");
  }

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
    if (!email.trim() || !password) {
      setError("Email dan kata sandi wajib diisi.");
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(translateError(signInError, "Gagal masuk. Coba lagi."));
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-zinc-900 [text-wrap:balance] dark:text-zinc-50">
        Masuk ke CampusOS
      </h1>
      <p className="mt-2 text-[15px] text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
        Lanjutkan mengatur jadwal, tugas, dan nilaimu.
      </p>

      {notice && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-500/10 dark:text-emerald-200">
          {notice}
        </div>
      )}
      {confirmFailed && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-500/10">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Tautan konfirmasi tidak valid atau sudah kedaluwarsa.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-red-700 [text-wrap:pretty] dark:text-red-300">
            Tautan konfirmasi email hanya berlaku terbatas. Isi emailmu di
            bawah ini, lalu minta tautan baru — atau daftar ulang dengan
            alamat email yang sama.
          </p>
          {resendDone ? (
            <p className="mt-3 text-sm font-medium text-red-800 dark:text-red-200">
              Tautan baru sudah dikirim. Periksa inbox (dan folder spam)
              emailmu.
            </p>
          ) : (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResend}
                loading={resending}
              >
                Kirim ulang tautan konfirmasi
              </Button>
            </div>
          )}
        </div>
      )}
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
        <Field label="Kata sandi" htmlFor="password" required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Kata sandimu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Masuk
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          Daftar gratis
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
