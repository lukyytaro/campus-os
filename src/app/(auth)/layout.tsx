import Link from "next/link";
import { Icon } from "@/components/icons";

/** Shell terpusat untuk halaman login & register. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pt-[calc(env(safe-area-inset-top,0px)_+_3rem)] pb-[calc(env(safe-area-inset-bottom,0px)_+_3rem)]">
      <Link href="/login" className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Icon name="cap" className="h-6 w-6" />
        </span>
        <span>
          <span className="block text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            CampusOS
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Your Academic Life, Organized.
          </span>
        </span>
      </Link>
      {/* Kartu form dengan aksen atas biru — pembeda visual halus dari
          formulir polos, tanpa gradient atau glassmorphism. */}
      <div className="mt-8 rounded-2xl border border-zinc-200 border-t-2 border-t-blue-600 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:border-t-blue-500 dark:bg-zinc-900">
        {children}
      </div>
      <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
        Data contoh Semester 3 disiapkan otomatis untuk akun baru.
      </p>
    </div>
  );
}
