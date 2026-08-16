import { v } from 'convex/values';
import { mutation, query, MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import { requireUser } from './authz';

const DEFAULT_SETTINGS = {
  hourlyRate: 0,
  idleThresholdHours: 6,
  reminderTimes: [] as string[],
  timezoneOffset: 0,
};

// Mutation-side: guarantees a settings row exists for the user, creating it
// on first use.
async function ensureSettings(ctx: MutationCtx, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('settings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert('settings', { userId, ...DEFAULT_SETTINGS });
  return { _id: id, ...DEFAULT_SETTINGS };
}

// Single combined query so the client subscribes once and gets both pieces
// of state reactively — running timer + settings. Read-only, so it never
// creates the settings row itself; it just falls back to defaults for
// display until the first mutation (e.g. saving a setting) creates it.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const running = await ctx.db
      .query('running')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    const settingsRow = await ctx.db
      .query('settings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    const settings = settingsRow ?? { _id: null, ...DEFAULT_SETTINGS };
    return { running: running ?? null, settings };
  },
});

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query('running')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (existing) return; // already running — no-op, avoids double timers
    await ctx.db.insert('running', {
      userId,
      startISO: new Date().toISOString(),
      pausedMs: 0,
      pauseStartISO: undefined,
      idleNotified: false,
    });
  },
});

export const pause = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const running = await ctx.db
      .query('running')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (!running || running.pauseStartISO) return;
    await ctx.db.patch(running._id, { pauseStartISO: new Date().toISOString() });
  },
});

export const resume = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const running = await ctx.db
      .query('running')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (!running || !running.pauseStartISO) return;
    const addl = Date.now() - new Date(running.pauseStartISO).getTime();
    await ctx.db.patch(running._id, { pausedMs: running.pausedMs + addl, pauseStartISO: undefined });
  },
});

// Stopping computes endISO server-side (not from the client clock) and
// creates the session in the same mutation, then clears the running row.
export const stop = mutation({
  args: { note: v.string(), isPaid: v.boolean() },
  handler: async (ctx, { note, isPaid }) => {
    const userId = await requireUser(ctx);
    const running = await ctx.db
      .query('running')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (!running) return null;
    const settings = await ensureSettings(ctx, userId);
    const endISO = new Date().toISOString();
    const sessionId = await ctx.db.insert('sessions', {
      userId,
      startISO: running.startISO,
      endISO,
      note: note.trim().slice(0, 500) || '(no note)',
      isPaid,
      rate: settings.hourlyRate,
    });
    await ctx.db.delete(running._id);
    return sessionId;
  },
});

export const updateSettings = mutation({
  args: {
    hourlyRate: v.optional(v.number()),
    idleThresholdHours: v.optional(v.number()),
    reminderTimes: v.optional(v.array(v.string())),
    timezoneOffset: v.optional(v.number()),
  },
  handler: async (ctx, patch) => {
    const userId = await requireUser(ctx);
    const settings = await ensureSettings(ctx, userId);
    const clean: Record<string, unknown> = {};
    if (patch.hourlyRate !== undefined) clean.hourlyRate = patch.hourlyRate;
    if (patch.idleThresholdHours !== undefined) clean.idleThresholdHours = patch.idleThresholdHours;
    if (patch.reminderTimes !== undefined) {
      for (const t of patch.reminderTimes) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
          throw new Error(`Invalid reminder time: ${t}`);
        }
      }
      clean.reminderTimes = patch.reminderTimes;
    }
    if (patch.timezoneOffset !== undefined) clean.timezoneOffset = patch.timezoneOffset;
    await ctx.db.patch(settings._id, clean);
  },
});
