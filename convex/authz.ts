import { getAuthUserId } from '@convex-dev/auth/server';
import { QueryCtx, MutationCtx } from './_generated/server';
import { Id } from './_generated/dataModel';

type Ctx = QueryCtx | MutationCtx;

export async function requireUser(ctx: Ctx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error('Not authenticated');
  return userId;
}

export async function requireAdmin(ctx: Ctx): Promise<Id<'users'>> {
  const userId = await requireUser(ctx);
  const user = await ctx.db.get(userId);
  if (user?.role !== 'admin') throw new Error('Unauthorized');
  return userId;
}
