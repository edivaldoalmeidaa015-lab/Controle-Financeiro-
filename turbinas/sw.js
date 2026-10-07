// Service worker do Painel de Turbinas: guarda o aplicativo no aparelho para abrir sem internet.
// Os dados das OMs não passam por aqui — ficam no IndexedDB do próprio painel.
var CACHE = 'painel-turbinas-v1';
var ARQUIVOS = ['./', './index.html', './modelo.js', './vendor/xlsx.mini.min.js', './manifest.webmanifest', './icone-192.png', './icone-512.png', './icone-180.png'];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (chaves) {
    return Promise.all(chaves.filter(function (k) { return k.indexOf('painel-turbinas-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Rede primeiro (pega melhorias do painel); sem internet, usa a cópia guardada.
self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET' || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(fetch(ev.request).then(function (resp) {
    if (resp.ok) { var copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(ev.request, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(ev.request, { ignoreSearch: true }).then(function (r) {
      return r || (ev.request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    });
  }));
});
