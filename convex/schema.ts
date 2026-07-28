import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// This is a single-user personal app. "settings" and "running" are singleton
// tables (at most one document) rather than per-user rows — there's no auth
// layer here on purpose. If you ever add multiple users, add a userId field
// and indexes to every table below.
export default defineSchema({
  sessions: defineTable({
    startISO: v.string(),
    endISO: v.string(),
    note: v.string(),
    isPaid: v.boolean(),
    rate: v.number(), // snapshotted at the time the session was logged
  }).index('by_start', ['startISO']),

  running: defineTable({
    startISO: v.string(),
    pausedMs: v.number(),
    pauseStartISO: v.optional(v.string()),
    idleNotified: v.boolean(), // prevents re-sending the idle push every cron tick
  }),

  settings: defineTable({
    hourlyRate: v.number(),
    idleThresholdHours: v.number(),
    reminderTimes: v.array(v.string()), // "HH:MM" 24h, in the device's local timezone
    timezoneOffset: v.optional(v.number()), // minutes: new Date().getTimezoneOffset(), e.g. -330 for UTC+5:30
  }),

  subscriptions: defineTable({
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    device: v.optional(v.string()), // free-text label, e.g. "phone" / "desktop"
  }).index('by_endpoint', ['endpoint']),

  sentReminders: defineTable({
    key: v.string(), // e.g. "2026-07-28_18:00" — dedupes a proactive reminder within its minute
  }).index('by_key', ['key']),
});
