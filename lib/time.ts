export function fmtHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function fmtHours(hrs: number): string {
  return hrs.toFixed(2) + 'h';
}

export function dateStr(d: string | number | Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function timeStr(d: string | number | Date): string {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function niceDate(dstr: string): string {
  const [y, m, d] = dstr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export interface DateHourPortion {
  date: string;
  hours: number;
}

// Splits a session into per-calendar-date hour portions. A session that
// starts 11:40pm and ends 12:20am the next day contributes 20 minutes to
// each date — this is what makes the monthly report correct for
// midnight-spanning sessions without needing to store them as two rows.
export function splitSessionPortions(startISO: string, endISO: string): DateHourPortion[] {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const portions: DateHourPortion[] = [];
  let cursor = new Date(start);
  let guard = 0;
  while (guard++ < 60) {
    const cursorDateEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
    const segEnd = end < cursorDateEnd ? end : cursorDateEnd;
    const hours = (segEnd.getTime() - cursor.getTime()) / 3600000;
    if (hours > 0) portions.push({ date: dateStr(cursor), hours });
    if (segEnd >= end) break;
    cursor = segEnd;
  }
  return portions;
}
