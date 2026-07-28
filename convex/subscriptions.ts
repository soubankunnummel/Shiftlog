import { v } from 'convex/values';
import { mutation, query, internalQuery, internalMutation } from './_generated/server';

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query('subscriptions').collect(),
});

// Upsert by endpoint — re-subscribing (e.g. after clearing browser data) just
// overwrites the old keys instead of creating a duplicate row.
export const save = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert('subscriptions', args);
    }
  },
});

export const remove = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const listInternal = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query('subscriptions').collect(),
});

export const removeInternal = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
