"use client";

import { useEffect } from "react";

/** Daftarkan service worker minimal — hanya di production, agar
 *  development tidak terganggu cache. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA bersifat opsional; kegagalan registrasi tidak mengganggu aplikasi.
    });
  }, []);
  return null;
}
