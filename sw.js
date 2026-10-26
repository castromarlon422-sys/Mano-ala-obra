/* Service worker de Manos a la Obra: abre la app aunque falle la conexión.
   Sube el número de VERSION cada vez que cambies index.html, db.js o config.js. */
var VERSION = "malo-v1";
var SHELL = ["./", "index.html", "config.js", "db.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;   // Supabase y CDN: siempre en vivo
  e.respondWith(
    fetch(r).then(function (res) {
      var copia = res.clone();
      caches.open(VERSION).then(function (c) { c.put(r, copia); });
      return res;
    }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match("index.html"); }); })
  );
});
