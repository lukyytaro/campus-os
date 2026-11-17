import Link from "next/link";

/** Shell terpusat untuk halaman login & register. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pt-[calc(env(safe-area-inset-top,0px)_+_3rem)] pb-[calc(env(safe-area-inset-bottom,0px)_+_3rem)]">
      <Link href="/login" className="flex flex-col items-start gap-1">
        <span className="font-serif text-[32px] leading-none font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          campusos<span className="text-gold-500">.</span>
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Your Academic Life, Organized.
        </span>
      </Link>
      {/* Kartu form dengan aksen atas emas — pembeda visual halus dari
          formulir polos, tanpa gradient atau glassmorphism. */}
      <div className="mt-8 rounded-2xl border border-zinc-200 border-t-2 border-t-gold-500 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
      <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
        Data contoh Semester 3 disiapkan otomatis untuk akun baru.
      </p>
    </div>
  );
}
