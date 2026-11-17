/* Service worker minimal CampusOS.
 * Sengaja TIDAK melakukan caching: handler fetch hanya meneruskan
 * request ke jaringan. Tujuannya semata-mata memenuhi kriteria
 * installability PWA (Chrome mensyaratkan service worker dengan
 * handler fetch) tanpa risiko konten basi.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
