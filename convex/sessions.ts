import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser } from './authz';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    return sessions.sort((a, b) => b.startISO.localeCompare(a.startISO));
  },
});

export const create = mutation({
  args: {
    startISO: v.string(),
    endISO: v.string(),
    note: v.string(),
    isPaid: v.boolean(),
    rate: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (new Date(args.endISO).getTime() <= new Date(args.startISO).getTime()) {
      throw new Error('End time must be after start time.');
    }
    if (args.note.length > 500) throw new Error('Note is too long.');
    return await ctx.db.insert('sessions', {
      ...args,
      note: args.note.trim() || '(no note)',
      userId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('sessions'),
    startISO: v.string(),
    endISO: v.string(),
    note: v.string(),
    isPaid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== userId) throw new Error('Not found');
    if (new Date(args.endISO).getTime() <= new Date(args.startISO).getTime()) {
      throw new Error('End time must be after start time.');
    }
    if (args.note.length > 500) throw new Error('Note is too long.');
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id('sessions') },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error('Not found');
    await ctx.db.delete(id);
  },
});
