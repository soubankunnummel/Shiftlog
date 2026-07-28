import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query('sessions').collect();
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
    if (new Date(args.endISO).getTime() <= new Date(args.startISO).getTime()) {
      throw new Error('End time must be after start time.');
    }
    return await ctx.db.insert('sessions', args);
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
    if (new Date(args.endISO).getTime() <= new Date(args.startISO).getTime()) {
      throw new Error('End time must be after start time.');
    }
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id('sessions') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
