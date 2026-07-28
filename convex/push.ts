'use node';
// Actions that touch npm packages needing real Node APIs (crypto, etc.) must
// opt into the Node runtime with the directive above — the default Convex
// action runtime is a V8 isolate and can't run the `web-push` package.

import webpush from 'web-push';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';

function configureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:you@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set as Convex environment variables.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

// Sends one push payload to every stored subscription (i.e. every device
// that has notifications enabled — phone and desktop both, if both opted in).
// Dead subscriptions (the browser/OS reports them gone) are cleaned up so the
// list doesn't accumulate stale entries.
export const sendToAll = internalAction({
  args: { title: v.string(), body: v.string(), tag: v.string() },
  handler: async (ctx, { title, body, tag }) => {
    configureVapid();
    const subs = await ctx.runQuery(internal.subscriptions.listInternal, {});
    const payload = JSON.stringify({ title, body, tag });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            {
              // TTL: how many seconds the push service should hold the message
              // if the device is offline. 300 = 5 minutes — enough for a reminder
              // to still be useful when the phone reconnects, but not so long
              // that a stale "starting work now?" fires hours later.
              TTL: 300,
              // urgency: 'high' tells FCM / Mozilla push to deliver immediately,
              // bypassing any low-priority batching. Without this, desktop Chrome
              // pushes can be delayed or silently dropped.
              urgency: 'high',
            }
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription expired or was revoked by the browser/OS — remove it.
            await ctx.runMutation(internal.subscriptions.removeInternal, { endpoint: sub.endpoint });
          } else {
            console.error('Push send failed', sub.endpoint, err);
          }
        }
      })
    );
  },
});
