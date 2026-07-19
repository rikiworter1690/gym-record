// 最小構成の Service Worker
// オフラインキャッシュは行わず、PWAとして認識される（ブラウザ枠が消える）ための
// fetch イベントの空実装のみを提供する。

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  // 何もせず、通常通りネットワークへ素通しする
  event.respondWith(fetch(event.request));
});
