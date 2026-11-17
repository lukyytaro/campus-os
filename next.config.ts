import type { NextConfig } from "next";

/**
 * Mode mobile (APK Capacitor): aktif hanya bila CAMPUSOS_MOBILE=1.
 * Menghasilkan static export ke folder `out/` yang dibungkus Capacitor.
 * Build web normal (tanpa env ini) tidak berubah sama sekali.
 *
 * Catatan: saat mode mobile, `src/proxy.ts` dan
 * `src/app/auth/confirm/route.ts` harus dipindahkan keluar sementara
 * (proxy & route handler tidak didukung static export). Auth client-side
 * tetap jalan via supabase-js browser client + localStorage.
 */
const isMobile = process.env.CAMPUSOS_MOBILE === "1";

const nextConfig: NextConfig = {
  /* config options here */
  // PPR (cacheComponents + partialPrefetching) tidak didukung mode export,
  // jadi dimatikan hanya saat build mobile.
  cacheComponents: !isMobile,
  partialPrefetching: !isMobile,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(isMobile
    ? {
        output: "export",
        // /jadwal -> /jadwal/index.html, agar WebView Capacitor bisa
        // menyajikan rute dalam (deep link) dari file lokal.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
