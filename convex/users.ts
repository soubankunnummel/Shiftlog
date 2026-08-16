import { query } from './_generated/server';
import { requireUser } from './authz';

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db.get(userId);
  },
});
