import { useEffect, useRef } from "react";

/**
 * Jalankan pemuat data async sekali saat komponen mount.
 *
 * Pemuat (mis. `load()` di tiap halaman) memanggil setState setelah
 * `await` — aman dari cascading render. Hook ini memisahkan pemanggilan
 * mount dari event handler "Coba lagi" agar aturan lint
 * `react-hooks/set-state-in-effect` tidak salah menandai pemanggilan
 * lintas fungsi: pemuat selalu dipanggil lewat ref, bukan secara
 * langsung dari badan effect.
 */
export function useMountLoad(load: () => Promise<void>): void {
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await loadRef.current();
    })();
    return () => {
      active = false;
    };
  }, []);
}
