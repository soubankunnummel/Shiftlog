import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { Id } from './_generated/dataModel';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Runs every minute via the cron in convex/crons.ts. This is the piece that
// decides WHEN to notify per user; convex/push.ts is the piece that knows HOW
// to notify. Kept separate so the "business rules" (idle threshold, reminder
// times) stay easy to read and change without touching the push plumbing.
export const check = internalAction({
  args: {},
  handler: async (ctx) => {
    const states = await ctx.runQuery(internal.reminders.listAllUserStatesInternal, {});
    const now = new Date();

    for (const { userId, running, settings } of states) {
      // Convert server UTC time to the user's local time using the stored
      // offset so reminder times (set in the user's local timezone) match.
      const offsetMs = (settings.timezoneOffset || 0) * 60000;
      const local = new Date(now.getTime() - offsetMs);
      const hhmm = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
      const datePart = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
      const todayKey = `${datePart}_${hhmm}`;

      // --- Proactive: scheduled nudge to START ---
      if (!running && settings.reminderTimes.includes(hhmm)) {
        const alreadySent = await ctx.runQuery(internal.reminders.wasReminderSentInternal, {
          userId,
          key: todayKey,
        });
        if (!alreadySent) {
          await ctx.runMutation(internal.reminders.markReminderSentInternal, { userId, key: todayKey });
          await ctx.runAction(internal.push.sendToAll, {
            userId,
            title: 'Shiftlog',
            body: `Scheduled reminder (${hhmm}) — starting part-time work now?`,
            tag: 'shiftlog-proactive',
          });
        }
      }

      // --- Reactive: catch forgetting to STOP ---
      if (running && !running.idleNotified) {
        const pauseNow = running.pauseStartISO ? now.getTime() - new Date(running.pauseStartISO).getTime() : 0;
        const elapsedMs = now.getTime() - new Date(running.startISO).getTime() - running.pausedMs - pauseNow;
        const hrs = elapsedMs / 3600000;
        if (hrs >= settings.idleThresholdHours) {
          await ctx.runMutation(internal.reminders.markIdleNotifiedInternal, { id: running._id });
          const h = Math.floor(hrs);
          const m = Math.round((hrs - h) * 60);
          await ctx.runAction(internal.push.sendToAll, {
            userId,
            title: 'Shiftlog',
            body: `Session has been running ${h}h ${m}m — still working?`,
            tag: 'shiftlog-idle',
          });
        }
      }
    }
  },
});

export const listAllUserStatesInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query('settings').collect();
    const running = await ctx.db.query('running').collect();
    const settingsByUser = new Map<Id<'users'>, (typeof settings)[number]>();
    const runningByUser = new Map<Id<'users'>, (typeof running)[number]>();
    const userIds = new Set<Id<'users'>>();
    for (const s of settings) {
      if (s.userId) {
        settingsByUser.set(s.userId, s);
        userIds.add(s.userId);
      }
    }
    for (const r of running) {
      if (r.userId) {
        runningByUser.set(r.userId, r);
        userIds.add(r.userId);
      }
    }
    return [...userIds].map((userId) => ({
      userId,
      settings: settingsByUser.get(userId) ?? {
        hourlyRate: 0,
        idleThresholdHours: 6,
        reminderTimes: [] as string[],
        timezoneOffset: 0,
      },
      running: runningByUser.get(userId) ?? null,
    }));
  },
});

export const wasReminderSentInternal = internalQuery({
  args: { userId: v.id('users'), key: v.string() },
  handler: async (ctx, { userId, key }) => {
    const row = await ctx.db
      .query('sentReminders')
      .withIndex('by_userId_and_key', (q) => q.eq('userId', userId).eq('key', key))
      .first();
    return !!row;
  },
});

export const markReminderSentInternal = internalMutation({
  args: { userId: v.id('users'), key: v.string() },
  handler: async (ctx, { userId, key }) => {
    await ctx.db.insert('sentReminders', { userId, key });
  },
});

export const markIdleNotifiedInternal = internalMutation({
  args: { id: v.id('running') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { idleNotified: true });
  },
});
