import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { ConvexError } from 'convex/values';
import { v } from 'convex/values';
import { internalQuery, internalMutation } from './_generated/server';
import { internal } from './_generated/api';

function adminEmail(): string {
  return (process.env.AUTH_ADMIN_EMAIL ?? '').trim().toLowerCase();
}

// Used by the admin credentials provider below (its authorize() ctx has no
// direct DB access, so it looks up / creates the admin user through these).
export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
  },
});

export const ensureAdminUser = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    if (existing) {
      if (existing.role !== 'admin') await ctx.db.patch(existing._id, { role: 'admin' });
      return existing._id;
    }
    return await ctx.db.insert('users', { email, name: 'Admin', role: 'admin' });
  },
});

// Fixed admin login. Credentials are always compared against the
// AUTH_ADMIN_EMAIL / AUTH_ADMIN_PASSWORD Convex env vars (set with
// `npx convex env set`), so rotating the password needs no code change and
// nothing secret lives in the repo.
const AdminCredentials = ConvexCredentials({
  id: 'admin',
  authorize: async (credentials, ctx) => {
    const email = String(credentials.email ?? '').trim().toLowerCase();
    const password = String(credentials.password ?? '');
    const expectedEmail = adminEmail();
    const expectedPassword = process.env.AUTH_ADMIN_PASSWORD ?? '';
    if (!expectedEmail || !expectedPassword) {
      throw new ConvexError('Admin login is not configured.');
    }
    if (email !== expectedEmail || password !== expectedPassword) {
      throw new ConvexError('Invalid credentials.');
    }
    const existing = await ctx.runQuery(internal.auth.findUserByEmail, { email });
    if (existing) {
      if (existing.role !== 'admin') {
        await ctx.runMutation(internal.auth.ensureAdminUser, { email });
      }
      return { userId: existing._id };
    }
    const id = await ctx.runMutation(internal.auth.ensureAdminUser, { email });
    return { userId: id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (String(params.email ?? '').trim().toLowerCase() === adminEmail()) {
          throw new ConvexError('That email is reserved. Use Admin sign in instead.');
        }
        return {
          email: String(params.email ?? ''),
          name: String(params.name ?? ''),
          role: 'user',
        };
      },
    }),
    AdminCredentials,
  ],
});
