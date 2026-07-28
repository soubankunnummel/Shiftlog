// Client-side helper: service worker registration → notification permission
// → fresh PushManager subscription → returns keys to save in Convex.
//
// Always call from a user gesture (button click). Browsers require permission
// requests to originate from direct user interaction.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function subscribeToPush(): Promise<PushSubscriptionPayload | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  // Request notification permission first — must happen inside the
  // user-gesture task. Awaiting anything async before this can cause
  // Chrome to silently block the prompt.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  // Register (or get the existing registration for) the service worker.
  const registration = await navigator.serviceWorker.register('/sw.js', {
    // 'importScripts' scope — keeps it at the root so it can intercept all push events.
    scope: '/',
    // Tell the browser to always byte-compare sw.js instead of caching it.
    updateViaCache: 'none',
  });

  // Force the browser to fetch the latest sw.js in case it hasn't updated yet.
  await registration.update();

  // Wait until a service worker is fully active (installed → activated).
  await new Promise<void>((resolve) => {
    const sw = registration.installing || registration.waiting || registration.active;
    if (registration.active && !registration.installing && !registration.waiting) {
      resolve();
      return;
    }
    const onStateChange = () => {
      if (registration.active) {
        resolve();
        sw?.removeEventListener('statechange', onStateChange);
      }
    };
    sw?.addEventListener('statechange', onStateChange);
    // Fallback: also listen on navigator.serviceWorker.ready
    navigator.serviceWorker.ready.then(() => resolve());
  });

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set.');
  }

  // ── IMPORTANT: Always unsubscribe first ──────────────────────────────────
  // The browser caches the old subscription indefinitely. If the VAPID keys
  // changed, or the endpoint expired at FCM/Mozilla, re-using the cached
  // subscription means the server sends to a dead endpoint and the push is
  // silently dropped. Force a fresh subscription every time the user clicks
  // "Enable / Re-subscribe".
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // If unsubscribe fails the browser rejects the old sub anyway on the next subscribe.
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Push subscription came back incomplete — try again.');
  }

  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

export async function getNotificationPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
