// Service Worker — receives Web Push messages from the Convex cron and shows
// real OS-level notifications. Works even when the app tab is closed.
// AudioContext is a Window-only API and is NOT available here — the OS default
// notification sound is used instead (controlled by system settings, same as
// every other app on the device).

self.addEventListener('install', () => {
  // Skip the "waiting" phase so the new SW takes over immediately
  // without needing every tab to be closed first.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim any open clients (tabs) so this SW controls them right away
  // without waiting for a reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Default payload — used if the push comes with no data (e.g. the DevTools
  // "Push" button with no body, or a network error during parse).
  let title = 'Shiftlog';
  let body = 'You have a reminder.';
  let tag = 'shiftlog';

  // Try to parse the JSON payload sent by convex/push.ts
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed.title) title = parsed.title;
      if (parsed.body) body = parsed.body;
      if (parsed.tag) tag = parsed.tag;
    } catch {
      // Non-JSON push (e.g. plain text from DevTools) — use defaults above.
      try {
        const text = event.data.text();
        if (text) body = text;
      } catch {
        // ignore
      }
    }
  }

  const notificationPromise = self.registration.showNotification(title, {
    body,
    tag,
    // Reuse the same tag so a second nudge replaces the first
    // instead of stacking duplicates.
    renotify: true,
    // Let the OS play its default notification sound.
    silent: false,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Haptic feedback on mobile.
    vibrate: [200, 100, 200, 100, 200],
    // Keep the notification visible until the user interacts with it
    // on desktop (doesn't apply to mobile — Android auto-dismisses).
    requireInteraction: true,
    // Extra data forwarded to the notificationclick handler.
    data: { url: '/' },
  });

  // waitUntil keeps the SW alive until showNotification resolves.
  event.waitUntil(notificationPromise);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open in a tab, just focus it.
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
