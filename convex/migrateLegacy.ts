import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

// One-time backfill: assigns every pre-auth row (which has no userId) to the
// given user (normally the admin's user id). Run this from the Convex
// dashboard -> Functions -> migrateLegacy/backfillLegacyRows once the admin
// account exists, then tighten `userId` to required in convex/schema.ts.
export const backfillLegacyRows = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const tables = ['sessions', 'running', 'settings', 'subscriptions', 'sentReminders'] as const;
    let updated = 0;
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.userId === undefined) {
          await ctx.db.patch(table, row._id, { userId });
          updated += 1;
        }
      }
    }
    return { updated };
  },
});
