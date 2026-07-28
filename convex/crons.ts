import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// This single cron is what makes background notifications work at all — it
// runs on Convex's own servers, independent of whether your phone/PC has the
// app open. Every tick just re-evaluates "is a reminder due, or has a
// session gone idle" and fires a push if so.
crons.interval('check reminders and idle sessions', { minutes: 1 }, internal.reminders.check, {});

export default crons;
