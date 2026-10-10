// Service worker do Painel de Turbinas: guarda o aplicativo no aparelho para abrir sem internet.
// Os dados das OMs não passam por aqui — ficam no IndexedDB do próprio painel.
var CACHE = 'painel-turbinas-v38';
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
  // conferência de versão nova pelo painel: sempre direto da rede, sem guardar
  if (/[?&]v=\d/.test(new URL(ev.request.url).search)) return;
  // cache: 'no-cache' confere com o servidor a cada abertura; sem isso o navegador reaproveita
  // a cópia por até 10 min (cabeçalho do GitHub Pages) e a versão nova demora a aparecer.
  ev.respondWith(fetch(ev.request, { cache: 'no-cache' }).then(function (resp) {
    if (resp.ok) { var copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(ev.request, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(ev.request, { ignoreSearch: true }).then(function (r) {
      return r || (ev.request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    });
  }));
});
