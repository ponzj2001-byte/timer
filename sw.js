// 내용을 고칠 때마다 VERSION 숫자를 올립니다 (예: timer-v6 → timer-v7)
const VERSION = 'timer-v6';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 보관본 우선 → 인터넷이 없거나 느려도 바로 실행, 인터넷이 있으면 뒤에서 새 내용으로 갱신
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {}); }
        return r;
      });
      if (hit) { net.catch(() => {}); return hit; }
      return net.catch(() => caches.match('index.html'));
    })
  );
});

// 일정 알림을 누르면 앱을 앞으로
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
