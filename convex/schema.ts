import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal('admin'), v.literal('user'))),
  }).index('email', ['email']),

  // "sessions", "running", "settings", "subscriptions" and "sentReminders"
  // are all per-user rows now. userId is v.optional(...) until the one-time
  // backfill in convex/migrateLegacy.ts assigns legacy (pre-auth) rows to the
  // admin user — tighten it to required afterwards.
  sessions: defineTable({
    userId: v.optional(v.id('users')),
    startISO: v.string(),
    endISO: v.string(),
    note: v.string(),
    isPaid: v.boolean(),
    rate: v.number(), // snapshotted at the time the session was logged
  })
    .index('by_userId', ['userId'])
    .index('by_start', ['startISO']),

  running: defineTable({
    userId: v.optional(v.id('users')),
    startISO: v.string(),
    pausedMs: v.number(),
    pauseStartISO: v.optional(v.string()),
    idleNotified: v.boolean(), // prevents re-sending the idle push every cron tick
  }).index('by_userId', ['userId']),

  settings: defineTable({
    userId: v.optional(v.id('users')),
    hourlyRate: v.number(),
    idleThresholdHours: v.number(),
    reminderTimes: v.array(v.string()), // "HH:MM" 24h, in the device's local timezone
    timezoneOffset: v.optional(v.number()), // minutes: new Date().getTimezoneOffset(), e.g. -330 for UTC+5:30
  }).index('by_userId', ['userId']),

  subscriptions: defineTable({
    userId: v.optional(v.id('users')),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    device: v.optional(v.string()), // free-text label, e.g. "phone" / "desktop"
  })
    .index('by_userId', ['userId'])
    .index('by_endpoint', ['endpoint']),

  sentReminders: defineTable({
    userId: v.optional(v.id('users')),
    key: v.string(), // e.g. "2026-07-28_18:00" — dedupes a proactive reminder within its minute
  })
    .index('by_userId', ['userId'])
    .index('by_key', ['key'])
    .index('by_userId_and_key', ['userId', 'key']),
});
