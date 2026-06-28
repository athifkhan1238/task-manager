// ── SERVICE WORKER — Task Manager PWA ────────────────────────────────────────
const CACHE_NAME = 'task-manager-v1';
const ASSETS = ['./index.html', './manifest.json'];

// ── INSTALL: cache the app shell ─────────────────────────────────────────────
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// ── ACTIVATE: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── FETCH: serve from cache, fallback to network ──────────────────────────────
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});

// ── NOTIFICATION CLICK: open the app ─────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow('./index.html');
        })
    );
});

// ── PUSH: receive push from main thread ───────────────────────────────────────
self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'NOTIFY') {
        const { title, body, tag } = e.data;
        self.registration.showNotification(title, {
            body,
            tag,
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [200, 100, 200],
            requireInteraction: false,
        });
    }
});