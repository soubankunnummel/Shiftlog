import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Runs every minute via the cron in convex/crons.ts. This is the piece that
// decides WHEN to notify; convex/push.ts is the piece that knows HOW to
// notify. Kept separate so the "business rules" (idle threshold, reminder
// times) stay easy to read and change without touching the push plumbing.
export const check = internalAction({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.runQuery(internal.reminders.getStateInternal, {});
    const now = new Date();

    // Convert server UTC time to the device's local time using the stored
    // offset so reminder times (set in the user's local timezone) match.
    const offsetMs = (state.settings.timezoneOffset || 0) * 60000;
    const local = new Date(now.getTime() - offsetMs);
    const hhmm = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
    const datePart = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
    const todayKey = `${datePart}_${hhmm}`;

    // --- Proactive: scheduled nudge to START ---
    // Only fires if nothing is currently running, and only once per
    // matching minute (dedup via sentReminders — a cron running every
    // minute would otherwise never double-fire anyway, but this also
    // protects against Convex's "at least once" cron delivery semantics).
    if (!state.running && state.settings.reminderTimes.includes(hhmm)) {
      const alreadySent = await ctx.runQuery(internal.reminders.wasReminderSentInternal, { key: todayKey });
      if (!alreadySent) {
        await ctx.runMutation(internal.reminders.markReminderSentInternal, { key: todayKey });
        await ctx.runAction(internal.push.sendToAll, {
          title: 'Shiftlog',
          body: `Scheduled reminder (${hhmm}) — starting part-time work now?`,
          tag: 'shiftlog-proactive',
        });
      }
    }

    // --- Reactive: catch forgetting to STOP ---
    // Fires once per running session when it first crosses the idle
    // threshold (idleNotified flag prevents re-sending every minute after).
    if (state.running && !state.running.idleNotified) {
      const pauseNow = state.running.pauseStartISO ? now.getTime() - new Date(state.running.pauseStartISO).getTime() : 0;
      const elapsedMs = now.getTime() - new Date(state.running.startISO).getTime() - state.running.pausedMs - pauseNow;
      const hrs = elapsedMs / 3600000;
      if (hrs >= state.settings.idleThresholdHours) {
        await ctx.runMutation(internal.reminders.markIdleNotifiedInternal, { id: state.running._id });
        const h = Math.floor(hrs);
        const m = Math.round((hrs - h) * 60);
        await ctx.runAction(internal.push.sendToAll, {
          title: 'Shiftlog',
          body: `Session has been running ${h}h ${m}m — still working?`,
          tag: 'shiftlog-idle',
        });
      }
    }
  },
});

export const getStateInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db.query('running').first();
    const settingsRow = await ctx.db.query('settings').first();
    const settings = settingsRow ?? { hourlyRate: 0, idleThresholdHours: 6, reminderTimes: [] as string[], timezoneOffset: 0 };
    return { running: running ?? null, settings };
  },
});

export const wasReminderSentInternal = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query('sentReminders')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();
    return !!row;
  },
});

export const markReminderSentInternal = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await ctx.db.insert('sentReminders', { key });
  },
});

export const markIdleNotifiedInternal = internalMutation({
  args: { id: v.id('running') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { idleNotified: true });
  },
});
