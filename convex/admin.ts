import { v } from 'convex/values';
import { mutation, query, MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import { requireAdmin } from './authz';

type AppTable = 'sessions' | 'running' | 'settings' | 'subscriptions' | 'sentReminders';
type AuthTable = 'authSessions' | 'authAccounts' | 'authRefreshTokens';

async function deleteByUser(ctx: MutationCtx, table: AppTable | AuthTable, userId: Id<'users'>) {
  const rows = await ctx.db.query(table).filter((q) => q.eq(q.field('userId'), userId)).collect();
  for (const row of rows) await ctx.db.delete(table, row._id as Id<typeof table>);
}

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query('users').collect();
    return users.map((u) => ({
      _id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      role: u.role ?? 'user',
      createdAt: u._creationTime,
    }));
  },
});

export const getUserDetail = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    sessions.sort((a, b) => b.startISO.localeCompare(a.startISO));
    const totals = sessions.reduce(
      (acc, s) => {
        const hrs = (new Date(s.endISO).getTime() - new Date(s.startISO).getTime()) / 3600000;
        acc.hours += hrs;
        if (s.isPaid) {
          acc.paidHours += hrs;
          acc.pay += hrs * (s.rate || 0);
        }
        return acc;
      },
      { hours: 0, paidHours: 0, pay: 0 }
    );
    return {
      user: { _id: user._id, name: user.name ?? null, email: user.email ?? null, role: user.role ?? 'user', createdAt: user._creationTime },
      sessions,
      totals,
    };
  },
});

export const deleteUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const adminId = await requireAdmin(ctx);
    if (userId === adminId) throw new Error('Cannot delete your own account.');
    const user = await ctx.db.get(userId);
    if (!user) throw new Error('User not found.');

    await deleteByUser(ctx, 'sessions', userId);
    await deleteByUser(ctx, 'running', userId);
    await deleteByUser(ctx, 'settings', userId);
    await deleteByUser(ctx, 'subscriptions', userId);
    await deleteByUser(ctx, 'sentReminders', userId);

    await deleteByUser(ctx, 'authSessions', userId);
    await deleteByUser(ctx, 'authAccounts', userId);
    await deleteByUser(ctx, 'authRefreshTokens', userId);

    await ctx.db.delete('users', userId);
  },
});
