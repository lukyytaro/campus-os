import { AppShell } from "@/components/AppShell";

/** Semua halaman di dalam route group ini terproteksi login. */
export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
