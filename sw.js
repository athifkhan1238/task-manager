// ── SERVICE WORKER — Task Manager PWA (True Offline Support) ─────────────────
const CACHE_NAME = 'task-manager-v3';

// All external resources the app needs — cached on first visit so it works offline forever after
const EXTERNAL_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

// Local app files
const LOCAL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './sw.js',
    './icon.svg',
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
// This runs the FIRST TIME the service worker is installed.
// We cache everything here so the app works offline from next visit onwards.
self.addEventListener('install', (e) => {
    console.log('[SW] Installing v3...');
    e.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache local files first — these must succeed
            await cache.addAll(LOCAL_ASSETS);
            console.log('[SW] Local assets cached');

            // Cache external files — best effort (don't fail install if CDN is slow)
            const results = await Promise.allSettled(
                EXTERNAL_ASSETS.map(url =>
                    fetch(url, { mode: 'cors' })
                        .then(res => {
                            if (res.ok) return cache.put(url, res);
                        })
                        .catch(err => console.log('[SW] Could not prefetch:', url))
                )
            );
            console.log('[SW] External assets attempted:', results.length);
        }).then(() => {
            console.log('[SW] Install complete — app ready for offline use');
            return self.skipWaiting(); // activate immediately without waiting
        })
    );
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
// Clean up old caches when a new version of the SW is activated
self.addEventListener('activate', (e) => {
    console.log('[SW] Activating v3...');
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => {
                        console.log('[SW] Removing old cache:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => {
                console.log('[SW] Now controlling all clients');
                return self.clients.claim(); // take control of all open tabs immediately
            })
    );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
// Every network request goes through here.
// Strategy: Cache First → if not cached, try Network → if no network, show offline fallback
self.addEventListener('fetch', (e) => {
    // Only handle GET requests
    if (e.request.method !== 'GET') return;

    // Skip chrome-extension and non-http requests
    if (!e.request.url.startsWith('http')) return;

    e.respondWith(
        caches.match(e.request).then(cachedResponse => {

            // ── CACHE HIT: serve instantly from cache ──────
            if (cachedResponse) {
                // Background refresh: update cache silently while serving old version
                fetch(e.request)
                    .then(networkRes => {
                        if (networkRes && networkRes.ok) {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(e.request, networkRes.clone());
                            });
                        }
                    })
                    .catch(() => {}); // offline — ignore, we already have cache
                return cachedResponse;
            }

            // ── CACHE MISS: try network ────────────────────
            return fetch(e.request)
                .then(networkRes => {
                    if (!networkRes || !networkRes.ok) return networkRes;

                    // Save to cache for future offline use
                    const toCache = networkRes.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, toCache));
                    return networkRes;
                })
                .catch(() => {
                    // ── OFFLINE FALLBACK ───────────────────
                    console.log('[SW] Offline, serving fallback for:', e.request.url);

                    // For page navigations, serve the app shell
                    if (e.request.destination === 'document' || e.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }

                    // For fonts/images — serve nothing (app still works without them)
                    return new Response('', { status: 408, statusText: 'Offline' });
                });
        })
    );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('./index.html');
        })
    );
});

// ── MESSAGE FROM APP ──────────────────────────────────────────────────────────
self.addEventListener('message', (e) => {
    if (!e.data) return;

    // Show a notification (sent from main app JS)
    if (e.data.type === 'NOTIFY') {
        const { title, body, tag } = e.data;
        self.registration.showNotification(title, {
            body,
            tag,
            icon: './icon.svg',
            badge: './icon.svg',
            vibrate: [200, 100, 200],
            requireInteraction: false,
        });
    }

    // App asking SW to activate immediately (for updates)
    if (e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
