# ⏱ Shiftlog

**A lightweight, self-hosted shift & time tracker for freelancers and part-time workers — built with Next.js and Convex.**

Shiftlog lets you punch in, punch out, log notes, track earnings, and receive push notifications reminding you to start or stop a session — all synced in real time via a serverless Convex backend. No account required, no subscription fees.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Live Timer** | Start, pause, resume, and stop a shift from any device — state is synced instantly via Convex's reactive queries |
| **Session Log** | Every stopped shift is saved with start/end times, duration, an optional note, and paid/unpaid status |
| **Earnings Report** | Monthly summary: total hours, paid hours, and estimated earnings at your configured hourly rate |
| **CSV Export** | One-click export of all sessions to a `.csv` file for payroll or invoicing |
| **Push Notifications** | Server-side Web Push (via VAPID) — works even when your browser is closed |
| **Idle Alerts** | Get nudged if a session has been running longer than your configured threshold |
| **Scheduled Reminders** | Set HH:MM times to remind you to start a session (e.g. `09:00`, `14:00`) |
| **Manual Entry** | Add or edit past sessions directly from the log view |
| **Offline-friendly** | All mutation logic runs on Convex — the UI reconnects automatically |

---

## 🛠 Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Backend / Database**: [Convex](https://convex.dev/) — real-time, serverless, no migrations needed
- **Push Notifications**: [web-push](https://github.com/web-push-libs/web-push) + VAPID (server-side via a Convex Action)
- **UI**: React 18, Tailwind CSS, [Lucide React](https://lucide.dev/) icons
- **Language**: TypeScript throughout

---

## 🚀 Getting Started

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- A free [Convex account](https://dashboard.convex.dev/) (no credit card required)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/shiftlog.git
cd shiftlog
npm install
```

### 2. Set Up Convex

```bash
npx convex dev
```

This will:
- Prompt you to log in to Convex (first run only)
- Create a new Convex project
- Automatically write `NEXT_PUBLIC_CONVEX_URL` to `.env.local`
- Deploy your schema and backend functions

> Keep this terminal open — it watches for changes and hot-reloads your backend.

### 3. Generate VAPID Keys (for Push Notifications)

```bash
npm run generate:vapid
```

Copy the output and set the keys:

**In `.env.local`** (frontend, public key only):
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-public-key>
```

**In Convex environment variables** (never put the private key in `.env.local`):
```bash
npx convex env set VAPID_PUBLIC_KEY <your-public-key>
npx convex env set VAPID_PRIVATE_KEY <your-private-key>
npx convex env set VAPID_SUBJECT mailto:you@example.com
```

> `VAPID_SUBJECT` must be a valid `mailto:` or `https://` URI — it's required by the Web Push spec so push services can contact you if something goes wrong.

### 4. Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you're ready to track shifts.

---

## 📁 Project Structure

```
shiftlog/
├── app/
│   ├── layout.tsx              # Root layout with ConvexClientProvider
│   ├── page.tsx                # Entry page
│   └── ConvexClientProvider.tsx
├── components/
│   └── ShiftlogApp.tsx         # Main UI — timer, log, report, settings tabs
├── convex/
│   ├── schema.ts               # Database schema (sessions, running, settings, subscriptions)
│   ├── state.ts                # Timer mutations: start, pause, resume, stop
│   ├── sessions.ts             # Session CRUD: list, create, update, remove
│   ├── subscriptions.ts        # Web Push subscription management
│   ├── push.ts                 # VAPID push action (server-side, secure)
│   ├── reminders.ts            # Idle + proactive reminder logic
│   └── crons.ts                # Scheduled cron: fires every minute
├── lib/
│   ├── time.ts                 # Time formatting utilities
│   └── push.ts                 # Browser-side push subscription helper
└── scripts/
    └── generate-vapid.js       # VAPID key generator
```

---

## ⚙️ Configuration (Settings Tab)

All settings are persisted in Convex and sync across devices instantly.

| Setting | Description |
|---|---|
| **Hourly Rate** | Used to calculate estimated earnings in the monthly report |
| **Idle Threshold** | Hours after which you get an "are you still working?" push notification |
| **Reminder Times** | `HH:MM` (24-hour) times to send a "starting work now?" nudge |
| **Push Notifications** | Enable/disable browser push (prompts for permission on first use) |

---

## 🔔 How Notifications Work

Shiftlog uses two notification types:

1. **Idle Alert** — fires once when a running session exceeds your idle threshold (e.g. 6 hours). Sent via a Convex cron that runs every minute on Convex's servers, independent of whether your browser is open.

2. **Proactive Reminder** — fires at each of your configured `reminderTimes` when no session is currently running. Deduped using a `sentReminders` table so you never get a double-ping.

Both push types use VAPID-signed Web Push, so they arrive even when the tab is closed.

---

## 📦 Available Scripts

```bash
npm run dev              # Start Next.js dev server (localhost:3000)
npm run build            # Build for production
npm run start            # Run production build
npm run lint             # ESLint check

npm run convex:dev       # Run Convex dev watcher (usually handled by `npx convex dev`)
npm run convex:deploy    # Deploy Convex backend to production
npm run generate:vapid   # Generate a fresh VAPID public/private key pair
```

---

## 🌐 Deploying to Production

### 1. Deploy Convex Backend

```bash
npx convex deploy
```

### 2. Deploy Next.js Frontend

Deploy to [Vercel](https://vercel.com/) (recommended) or any Node-compatible host:

```bash
# Vercel (one-time setup)
npx vercel
```

Set the following environment variables in your hosting provider:

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Vercel / hosting env vars |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel / hosting env vars |
| `VAPID_PUBLIC_KEY` | Convex dashboard env vars |
| `VAPID_PRIVATE_KEY` | Convex dashboard env vars |
| `VAPID_SUBJECT` | Convex dashboard env vars |

---

## 🔒 Single-User Design

Shiftlog is intentionally built as a **personal, single-user app** — there's no authentication layer. The `settings` and `running` tables are singletons (one row each). If you want to add multi-user support, add a `userId` field and matching indexes to every table in `convex/schema.ts`.

---

## 📄 License

MIT — do whatever you like with it.
