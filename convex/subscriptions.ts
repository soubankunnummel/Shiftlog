import { v } from 'convex/values';
import { mutation, internalQuery, internalMutation } from './_generated/server';
import { requireUser } from './authz';

// Upsert by endpoint — re-subscribing (e.g. after clearing browser data) just
// overwrites the old keys instead of creating a duplicate row. Scoped to the
// signed-in user so reminders only ever reach that user's own devices.
export const save = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    device: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, userId });
    } else {
      await ctx.db.insert('subscriptions', { ...args, userId });
    }
  },
});

export const remove = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .first();
    if (existing && existing.userId === userId) await ctx.db.delete(existing._id);
  },
});

export const listInternal = internalQuery({
  args: { userId: v.optional(v.id('users')) },
  handler: async (ctx, { userId }) => {
    if (userId !== undefined) {
      return await ctx.db
        .query('subscriptions')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect();
    }
    return await ctx.db.query('subscriptions').collect();
  },
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
