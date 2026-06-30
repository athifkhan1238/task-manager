const CACHE_NAME = 'task-manager-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// ── INSTALL EVENT ────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(urlsToCache).catch(err => {
        console.log('[Service Worker] Cache addAll error:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE EVENT ───────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ── FETCH EVENT (OFFLINE SUPPORT) ────────────────────────
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(response => {
        // Cache successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(error => {
        console.log('[Service Worker] Fetch failed:', error);
        return caches.match('./index.html');
      });
    })
  );
});

// ── MESSAGE EVENT (NOTIFICATIONS FROM APP) ───────────────
self.addEventListener('message', event => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'NOTIFY') {
    const { title, body, tag, requireInteraction } = event.data;
    
    // Check if it's an attendance notification (has 'att-' prefix)
    const isAttendanceNotif = tag.includes('att-');
    
    self.registration.showNotification(title, {
      body: body,
      tag: tag,
      icon: './icon.svg',
      badge: './icon.svg',
      requireInteraction: requireInteraction || isAttendanceNotif,
      vibrate: isAttendanceNotif ? [200, 100, 200] : [100, 50, 100],
      actions: [
        {
          action: 'mark-done',
          title: 'Got it',
          icon: './icon.svg'
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: './icon.svg'
        }
      ],
      timestamp: Date.now(),
      data: {
        taskTag: tag,
        openUrl: './index.html',
        isAttendance: isAttendanceNotif
      }
    });
  }
  
  // Acknowledge message
  event.ports[0].postMessage({ success: true });
});

// ── NOTIFICATION CLICK EVENT ─────────────────────────────
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification clicked:', event.action);
  
  event.notification.close();
  
  // Handle action buttons
  if (event.action === 'mark-done' || event.action === 'dismiss') {
    // Send message to open clients
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clientList => {
        if (clientList.length > 0) {
          clientList[0].focus();
          clientList[0].postMessage({
            type: 'NOTIFICATION_ACTION',
            action: event.action,
            taskTag: event.notification.data.taskTag
          });
        }
      })
    );
  } else {
    // Default: Open app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return self.clients.openWindow(event.notification.data.openUrl || './');
      })
    );
  }
});

// ── NOTIFICATION CLOSE EVENT ────────────────────────────
self.addEventListener('notificationclose', event => {
  console.log('[Service Worker] Notification closed:', event.notification.data.taskTag);
});

// ── PERIODIC SYNC EVENT (BACKGROUND CHECK) ──────────────
self.addEventListener('periodicsync', event => {
  console.log('[Service Worker] Periodic sync event:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(
      (async () => {
        try {
          // Get all clients
          const clients = await self.clients.matchAll({ type: 'window' });
          if (clients && clients.length > 0) {
            // Send message to client to check notifications
            clients[0].postMessage({
              type: 'CHECK_NOTIFICATIONS',
              timestamp: Date.now()
            });
          }
        } catch (error) {
          console.error('[Service Worker] Periodic sync error:', error);
        }
      })()
    );
  }
});

// ── PUSH EVENT (FOR FUTURE PUSH NOTIFICATIONS) ──────────
self.addEventListener('push', event => {
  console.log('[Service Worker] Push event received');
  
  let notificationData = {
    title: 'Task Manager',
    body: 'You have pending tasks',
    icon: './icon.svg'
  };
  
  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon || './icon.svg',
      badge: './icon.svg',
      tag: 'push-notification',
      requireInteraction: true,
      vibrate: [100, 50, 100]
    })
  );
});

console.log('[Service Worker] Loaded and ready!');
