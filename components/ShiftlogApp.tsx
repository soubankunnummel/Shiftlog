'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
import {
  Play, Pause, Square, Settings as SettingsIcon, Calendar, Download,
  Plus, Trash2, Pencil, X, Bell, BellOff, FileText, Clock, AlertTriangle,
} from 'lucide-react';
import { fmtHMS, fmtHours, dateStr, timeStr, niceDate, splitSessionPortions } from '@/lib/time';
import { subscribeToPush, getNotificationPermissionState } from '@/lib/push';

const ACCENT = '#3B5BDB';
const AMBER = '#B4690E';
const GREEN = '#2F7D4F';
const BG = '#F6F5F2';
const BORDER = '#E4E1D8';
const INK = '#1C1C1E';
const MUTED = '#6B7280';

function fmtTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

type Session = Doc<'sessions'>;

interface ManualFormState {
  date: string;
  startTime: string;
  endDate: string;
  endTime: string;
  note: string;
  isPaid: boolean;
  editId: Id<'sessions'> | null;
}

interface Banner {
  type: 'idle' | 'proactive';
  text: string;
}

function Toggle({ checked, onChange, labelOn, labelOff }: { checked: boolean; onChange: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors"
      style={{ borderColor: checked ? GREEN : BORDER, background: checked ? '#EAF5EE' : '#F1F0EC', color: checked ? GREEN : MUTED }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: checked ? GREEN : '#B5B2A8' }} />
      {checked ? labelOn : labelOff}
    </button>
  );
}

type TabId = 'timer' | 'log' | 'report' | 'settings';

export default function ShiftlogApp() {
  const state = useQuery(api.state.get);
  const sessions = useQuery(api.sessions.list);

  const startMut = useMutation(api.state.start);
  const pauseMut = useMutation(api.state.pause);
  const resumeMut = useMutation(api.state.resume);
  const stopMut = useMutation(api.state.stop);
  const updateSettingsMut = useMutation(api.state.updateSettings);
  const createSessionMut = useMutation(api.sessions.create);
  const updateSessionMut = useMutation(api.sessions.update);
  const removeSessionMut = useMutation(api.sessions.remove);
  const saveSubscriptionMut = useMutation(api.subscriptions.save);

  const [tab, setTab] = useState<TabId>('timer');
  const [now, setNow] = useState<number>(Date.now());
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopNote, setStopNote] = useState('');
  const [stopPaid, setStopPaid] = useState(true);
  const [manualForm, setManualForm] = useState<ManualFormState | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [idleAcked, setIdleAcked] = useState(false);
  const [reminderInput, setReminderInput] = useState('18:00');
  const [notifState, setNotifState] = useState<NotificationPermission | 'unsupported'>('default');
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => dateStr(new Date()).slice(0, 7));
  const lastRunningId = useRef<string | null>(null);
  const firedProactiveRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getNotificationPermissionState().then(setNotifState);
  }, []);

  // In-app fallback banner while this tab happens to be open — the real,
  // reliable path is the Convex cron + push (works even when closed); this
  // banner is just a nice-to-have for whoever's looking at the screen right now.
  useEffect(() => {
    if (!state) return;
    if (state.running && state.running._id !== lastRunningId.current) {
      lastRunningId.current = state.running._id;
      setIdleAcked(false);
    }
    if (!state.running) lastRunningId.current = null;

    // Idle detection
    if (state.running) {
      const pauseNow = state.running.pauseStartISO ? now - new Date(state.running.pauseStartISO).getTime() : 0;
      const elapsedMs = now - new Date(state.running.startISO).getTime() - state.running.pausedMs - pauseNow;
      const hrs = elapsedMs / 3600000;
      if (hrs >= state.settings.idleThresholdHours && !idleAcked) {
        setBanner({ type: 'idle', text: `Session has been running ${fmtHMS(elapsedMs)} — still working?` });
      }
    }

    // Proactive reminder banner — fires once per HH:MM while nothing is running
    if (!state.running) {
      const hhmm = `${String(new Date(now).getHours()).padStart(2, '0')}:${String(new Date(now).getMinutes()).padStart(2, '0')}`;
      const key = `${dateStr(now)}_${hhmm}`;
      if (state.settings.reminderTimes.includes(hhmm) && !firedProactiveRef.current.has(key)) {
        firedProactiveRef.current.add(key);
        setBanner({ type: 'proactive', text: `Scheduled reminder (${hhmm}) — starting part-time work now?` });
      }
    }
  }, [now, state, idleAcked]);

  if (state === undefined || sessions === undefined) {
    return (
      <div style={{ background: BG, color: MUTED }} className="min-h-[400px] flex items-center justify-center text-sm">
        Loading Shiftlog…
      </div>
    );
  }

  const running = state.running;
  const pauseNow = running?.pauseStartISO ? now - new Date(running.pauseStartISO).getTime() : 0;
  const elapsedMs = running ? now - new Date(running.startISO).getTime() - running.pausedMs - pauseNow : 0;
  const isPaused = !!(running && running.pauseStartISO);

  async function enableNotifications() {
    setNotifBusy(true);
    setNotifError(null);
    // Refresh the permission state from the browser in case it changed
    // while the UI was open (e.g. user changed it via the padlock).
    const currentState = await getNotificationPermissionState();
    setNotifState(currentState);
    if (currentState === 'denied') {
      setNotifBusy(false);
      setNotifError('Blocked in Chrome. Click the padlock in the URL bar → Site settings → Notifications → Allow, then try again.');
      return;
    }
    if (currentState === 'unsupported') {
      setNotifBusy(false);
      setNotifError('Push notifications are not supported in this browser.');
      return;
    }
    try {
      const sub = await subscribeToPush();
      if (sub) {
        await saveSubscriptionMut({ ...sub, device: navigator.userAgent.includes('Mobile') ? 'phone' : 'desktop' });
        setNotifState('granted');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not enable notifications.';
      // After a failed attempt, re-check the actual browser permission to
      // see if Chrome auto-denied without showing a prompt.
      const after = await getNotificationPermissionState();
      setNotifState(after);
      if (after === 'denied') {
        setNotifError('Chrome blocked the request. Click the padlock in the URL bar → Site settings → Notifications → Allow, then try again.');
      } else {
        setNotifError(msg);
      }
    } finally {
      setNotifBusy(false);
    }
  }

  function handleStopClick() {
    if (!running) return;
    setStopNote('');
    setStopPaid(true);
    setShowStopModal(true);
  }
  async function confirmStop() {
    await stopMut({ note: stopNote.trim() || '(no note)', isPaid: stopPaid });
    setShowStopModal(false);
    setBanner(null);
    setIdleAcked(false);
  }
  function dismissBanner() {
    if (banner?.type === 'idle') setIdleAcked(true);
    setBanner(null);
  }
  async function deleteSession(id: Id<'sessions'>) {
    if (!window.confirm('Delete this session?')) return;
    await removeSessionMut({ id });
  }
  function openManualAdd() {
    const d = dateStr(new Date());
    setManualForm({ date: d, startTime: '09:00', endDate: d, endTime: '17:00', note: '', isPaid: true, editId: null });
  }
  function openManualEdit(s: Session) {
    const sd = new Date(s.startISO);
    const ed = new Date(s.endISO);
    setManualForm({
      date: dateStr(sd), startTime: sd.toTimeString().slice(0, 5),
      endDate: dateStr(ed), endTime: ed.toTimeString().slice(0, 5),
      note: s.note, isPaid: s.isPaid, editId: s._id,
    });
  }
  async function saveManual() {
    if (!manualForm || !state) return;
    const { date, startTime, endDate, endTime, note, isPaid, editId } = manualForm;
    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${endDate}T${endTime}:00`).toISOString();
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      alert('End time must be after start time.');
      return;
    }
    try {
      if (editId) {
        await updateSessionMut({ id: editId, startISO, endISO, note: note.trim() || '(no note)', isPaid });
      } else {
        await createSessionMut({ startISO, endISO, note: note.trim() || '(no note)', isPaid, rate: state.settings.hourlyRate });
      }
      setManualForm(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save session.');
    }
  }

  const byDate: Record<string, Session[]> = {};
  sessions.forEach((s) => { const d = dateStr(s.startISO); (byDate[d] = byDate[d] || []).push(s); });
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const monthRows: Record<string, { date: string; hours: number; paidHours: number; pay: number; notes: Set<string> }> = {};
  sessions.forEach((s) => {
    splitSessionPortions(s.startISO, s.endISO).forEach((p) => {
      if (!p.date.startsWith(month)) return;
      monthRows[p.date] = monthRows[p.date] || { date: p.date, hours: 0, paidHours: 0, pay: 0, notes: new Set<string>() };
      monthRows[p.date].hours += p.hours;
      if (s.isPaid) { monthRows[p.date].paidHours += p.hours; monthRows[p.date].pay += p.hours * (s.rate || 0); }
      monthRows[p.date].notes.add(s.note);
    });
  });
  const monthRowList = Object.values(monthRows).sort((a, b) => a.date.localeCompare(b.date));
  const monthTotals = monthRowList.reduce(
    (acc, r) => ({ hours: acc.hours + r.hours, paidHours: acc.paidHours + r.paidHours, pay: acc.pay + r.pay }),
    { hours: 0, paidHours: 0, pay: 0 }
  );

  function exportCSV() {
    const lines = [['Date', 'Hours', 'Paid Hours', 'Pay', 'Notes'].join(',')];
    monthRowList.forEach((r) => {
      lines.push([r.date, r.hours.toFixed(2), r.paidHours.toFixed(2), r.pay.toFixed(2), '"' + [...r.notes].join('; ').replace(/"/g, '""') + '"'].join(','));
    });
    lines.push(['TOTAL', monthTotals.hours.toFixed(2), monthTotals.paidHours.toFixed(2), monthTotals.pay.toFixed(2), ''].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `timesheet-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function addReminder() {
    if (!state) return;
    const list = new Set(state.settings.reminderTimes);
    list.add(reminderInput);
    saveSettings({ reminderTimes: [...list].sort() });
  }
  function removeReminder(time: string) {
    if (!state) return;
    saveSettings({ reminderTimes: state.settings.reminderTimes.filter((t) => t !== time) });
  }

  function saveSettings(patch: Parameters<typeof updateSettingsMut>[0]) {
    return updateSettingsMut({ ...patch, timezoneOffset: new Date().getTimezoneOffset() });
  }

  const TABS: { id: TabId; label: string; icon: typeof Clock }[] = [
    { id: 'timer', label: 'Timer', icon: Clock },
    { id: 'log', label: 'Log', icon: Calendar },
    { id: 'report', label: 'Report', icon: FileText },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div style={{ background: BG, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} className="min-h-screen w-full">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        @keyframes pulseDot { 0%,100% { opacity:1 } 50% { opacity:.35 } }
        .pulse-dot { animation: pulseDot 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pulse-dot { animation: none; } }
      `}</style>

      <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        <div className="flex items-baseline justify-between mb-5 no-print">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Shiftlog</h1>
            <p className="text-xs" style={{ color: MUTED }}>Part-time hours &amp; timesheet tracker</p>
          </div>
          <div className="text-xs font-mono" style={{ color: MUTED }}>
            {new Date(now).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        {banner && (
          <div className="no-print mb-4 rounded-xl border px-4 py-3 flex items-start gap-3" style={{ borderColor: '#EAD9B0', background: '#FDF6E8' }}>
            <AlertTriangle size={18} style={{ color: AMBER, marginTop: 2, flexShrink: 0 }} />
            <div className="flex-1 text-sm" style={{ color: '#7A4E0E' }}>{banner.text}</div>
            <div className="flex gap-2 flex-shrink-0">
              {banner.type === 'idle' && (
                <button onClick={handleStopClick} className="text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: AMBER, color: 'white' }}>Stop now</button>
              )}
              <button onClick={dismissBanner} className="text-xs font-medium px-2.5 py-1 rounded-lg border" style={{ borderColor: '#EAD9B0', color: '#7A4E0E' }}>Dismiss</button>
            </div>
          </div>
        )}

        {tab === 'timer' && (
          <div className="rounded-2xl border p-8 flex flex-col items-center gap-6" style={{ background: 'white', borderColor: BORDER }}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-medium" style={{ color: running ? (isPaused ? AMBER : GREEN) : MUTED }}>
              <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: running ? (isPaused ? AMBER : GREEN) : '#C7C4B8', animation: running && !isPaused ? undefined : 'none' }} />
              {running ? (isPaused ? 'Paused' : 'Working') : 'Not tracking'}
            </div>
            <div className="font-mono text-6xl sm:text-7xl tabular-nums tracking-tight">{fmtHMS(elapsedMs)}</div>
            <div className="flex gap-3 flex-wrap justify-center">
              {!running && (
                <button onClick={() => startMut({})} className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white" style={{ background: ACCENT }}>
                  <Play size={18} /> Start
                </button>
              )}
              {running && !isPaused && (
                <button onClick={() => pauseMut({})} className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium border" style={{ borderColor: BORDER, color: INK }}>
                  <Pause size={18} /> Pause
                </button>
              )}
              {running && isPaused && (
                <button onClick={() => resumeMut({})} className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white" style={{ background: ACCENT }}>
                  <Play size={18} /> Resume
                </button>
              )}
              {running && (
                <button onClick={handleStopClick} className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white" style={{ background: '#B5342F' }}>
                  <Square size={16} /> Stop
                </button>
              )}
            </div>
            <button onClick={openManualAdd} className="text-sm underline" style={{ color: MUTED }}>Forgot to track? Add a session manually</button>

            <button onClick={enableNotifications} disabled={notifBusy} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border" style={{ borderColor: BORDER, color: notifState === 'granted' ? GREEN : ACCENT }}>
              <Bell size={13} /> {notifBusy ? 'Subscribing…' : notifState === 'granted' ? 'Notifications enabled (re-subscribe)' : 'Enable push notifications on this device'}
            </button>
            {notifError && <p className="text-xs" style={{ color: '#B5342F' }}>{notifError}</p>}
          </div>
        )}

        {tab === 'log' && (
          <div className="space-y-4">
            <button onClick={openManualAdd} className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border w-full justify-center" style={{ borderColor: BORDER, color: ACCENT }}>
              <Plus size={16} /> Add session manually
            </button>
            {sortedDates.length === 0 && <p className="text-sm text-center py-8" style={{ color: MUTED }}>No sessions logged yet.</p>}
            {sortedDates.map((d) => {
              const dayTotal = byDate[d].reduce((a, s) => a + (new Date(s.endISO).getTime() - new Date(s.startISO).getTime()) / 3600000, 0);
              return (
                <div key={d} className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER, background: 'white' }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#F1F0EC' }}>
                    <span className="font-medium text-sm">{niceDate(d)}</span>
                    <span className="text-xs font-mono" style={{ color: MUTED }}>{fmtHours(dayTotal)}</span>
                  </div>
                  {byDate[d].map((s) => (
                    <div key={s._id} className="flex items-start justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: BORDER }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono" style={{ color: MUTED }}>
                          {timeStr(s.startISO)} – {timeStr(s.endISO)}{dateStr(s.startISO) !== dateStr(s.endISO) ? ' (+1d)' : ''}
                        </div>
                        <div className="text-sm mt-0.5 break-words">{s.note}</div>
                        <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: s.isPaid ? '#EAF5EE' : '#F1F0EC', color: s.isPaid ? GREEN : MUTED }}>
                          {s.isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => openManualEdit(s)} className="p-1.5 rounded-lg border" style={{ borderColor: BORDER, color: MUTED }}><Pencil size={14} /></button>
                        <button onClick={() => deleteSession(s._id)} className="p-1.5 rounded-lg border" style={{ borderColor: BORDER, color: '#B5342F' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'report' && (
          <div>
            <div className="flex items-center justify-between mb-4 no-print gap-2 flex-wrap">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: BORDER }} />
              <div className="flex gap-2">
                <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border" style={{ borderColor: BORDER }}>
                  <Download size={15} /> CSV
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border" style={{ borderColor: BORDER }}>
                  <FileText size={15} /> PDF / Print
                </button>
              </div>
            </div>

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER, background: 'white' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: BORDER }}>
                <h2 className="font-semibold">Timesheet — {new Date(month + '-01').toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: MUTED }} className="text-left">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Hours</th>
                    <th className="px-4 py-2 font-medium">Pay</th>
                    <th className="px-4 py-2 font-medium">Worked on</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRowList.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: MUTED }}>No sessions this month.</td></tr>
                  )}
                  {monthRowList.map((r) => (
                    <tr key={r.date} className="border-t" style={{ borderColor: BORDER }}>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{niceDate(r.date)}</td>
                      <td className="px-4 py-2 font-mono">{fmtHours(r.hours)}</td>
                      <td className="px-4 py-2 font-mono">{r.pay > 0 ? r.pay.toFixed(2) : '—'}</td>
                      <td className="px-4 py-2">{[...r.notes].join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#EFF3FC' }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: ACCENT }}>Total</td>
                    <td className="px-4 py-3 font-mono font-semibold" style={{ color: ACCENT }}>{fmtHours(monthTotals.hours)}</td>
                    <td className="px-4 py-3 font-mono font-semibold" style={{ color: ACCENT }}>{monthTotals.pay.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: ACCENT }}>{fmtHours(monthTotals.paidHours)} paid</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-5 no-print">
            <div className="rounded-xl border p-4" style={{ borderColor: BORDER, background: 'white' }}>
              <h3 className="font-medium mb-3 text-sm">Pay rate</h3>
              <label className="text-xs" style={{ color: MUTED }}>Hourly rate</label>
              <input type="number" min={0} step={0.01} value={state.settings.hourlyRate}
                onChange={(e) => saveSettings({ hourlyRate: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: BORDER }} />
              <p className="text-xs mt-1.5" style={{ color: MUTED }}>Applied to new sessions only — past sessions keep the rate they were logged at.</p>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: BORDER, background: 'white' }}>
              <h3 className="font-medium mb-3 text-sm">Idle detection</h3>
              <label className="text-xs" style={{ color: MUTED }}>Prompt &quot;still working?&quot; after (hours)</label>
              <input type="number" min={1} step={0.5} value={state.settings.idleThresholdHours}
                onChange={(e) => saveSettings({ idleThresholdHours: parseFloat(e.target.value) || 6 })}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: BORDER }} />
              <p className="text-xs mt-1.5" style={{ color: MUTED }}>Checked every minute by a Convex cron — fires even if this app isn&apos;t open.</p>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: BORDER, background: 'white' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">Scheduled reminders</h3>
                <button onClick={enableNotifications} disabled={notifBusy} className="flex items-center gap-1 text-xs font-medium" style={{ color: notifState === 'granted' ? GREEN : ACCENT }}>
                  {notifState === 'denied' ? <BellOff size={13} /> : <Bell size={13} />}
                  {notifBusy ? 'Subscribing…' : notifState === 'denied' ? 'Blocked — check browser settings' : notifState === 'granted' ? 'Re-subscribe' : 'Enable notifications'}
                </button>
              </div>
              <div className="flex gap-2 mb-3">
                <input type="time" value={reminderInput} onChange={(e) => setReminderInput(e.target.value)} className="border rounded-lg px-3 py-2 text-sm flex-1" style={{ borderColor: BORDER }} />
                <button onClick={addReminder} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: ACCENT }}>Add</button>
              </div>
              <p className="text-[11px] -mt-2 mb-3" style={{ color: MUTED }}>24‑hour format — 9:00&nbsp;AM&nbsp;=&nbsp;09:00, 3:30&nbsp;PM&nbsp;=&nbsp;15:30</p>
              <div className="flex flex-wrap gap-2">
                {state.settings.reminderTimes.length === 0 && <p className="text-xs" style={{ color: MUTED }}>No reminders set.</p>}
                {state.settings.reminderTimes.map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: BORDER }}>
                    {fmtTime12h(t)}
                    <button onClick={() => removeReminder(t)}><X size={12} /></button>
                  </span>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: MUTED }}>
                {notifState === 'granted'
                  ? 'These fire as real push notifications from a Convex cron — no need to keep this open, on mobile or desktop.'
                  : 'Enable notifications above for these to actually alert you — otherwise they only show as an in-app banner while this tab is open.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="no-print fixed bottom-0 left-0 right-0 border-t flex" style={{ background: 'white', borderColor: BORDER }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium" style={{ color: tab === id ? ACCENT : MUTED }}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {showStopModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl p-5 w-full max-w-sm" style={{ background: 'white' }}>
            <h3 className="font-semibold mb-3">What did you work on?</h3>
            <textarea autoFocus value={stopNote} onChange={(e) => setStopNote(e.target.value)} rows={3}
              placeholder="e.g. Fixed login bug, built export feature"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3" style={{ borderColor: BORDER }} />
            <div className="mb-4"><Toggle checked={stopPaid} onChange={setStopPaid} labelOn="Paid" labelOff="Unpaid" /></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowStopModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: BORDER }}>Cancel</button>
              <button onClick={confirmStop} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: ACCENT }}>Save session</button>
            </div>
          </div>
        </div>
      )}

      {manualForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" style={{ background: 'white' }}>
            <h3 className="font-semibold mb-3">{manualForm.editId ? 'Edit session' : 'Add session'}</h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-xs" style={{ color: MUTED }}>Start date</label>
                <input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: MUTED }}>Start time</label>
                <input type="time" value={manualForm.startTime} onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs" style={{ color: MUTED }}>End date</label>
                <input type="date" value={manualForm.endDate} onChange={(e) => setManualForm({ ...manualForm, endDate: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: MUTED }}>End time</label>
                <input type="time" value={manualForm.endTime} onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
              </div>
            </div>
            <label className="text-xs" style={{ color: MUTED }}>What did you work on?</label>
            <textarea value={manualForm.note} onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3 mt-1" style={{ borderColor: BORDER }} />
            <div className="mb-4"><Toggle checked={manualForm.isPaid} onChange={(v) => setManualForm({ ...manualForm, isPaid: v })} labelOn="Paid" labelOff="Unpaid" /></div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setManualForm(null)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: BORDER }}>Cancel</button>
              <button onClick={saveManual} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: ACCENT }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
