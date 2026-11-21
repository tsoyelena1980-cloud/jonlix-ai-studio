import { formatInTimeZone } from 'date-fns-tz';

export const TZ = 'Asia/Tashkent';

export function todayInTashkent(now = new Date()): string {
  return formatInTimeZone(now, TZ, 'yyyy-MM-dd');
}

export function formatTashkent(now: Date, pattern: string): string {
  return formatInTimeZone(now, TZ, pattern);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function calendarDaysBetween(laterIso: string, earlierIso: string): number {
  const [y1, m1, d1] = earlierIso.split('-').map(Number);
  const [y2, m2, d2] = laterIso.split('-').map(Number);
  const a = Date.UTC(y1!, (m1 ?? 1) - 1, d1);
  const b = Date.UTC(y2!, (m2 ?? 1) - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m ?? 1) - 1 && dt.getUTCDate() === d;
}

/** Minutes from midnight in Asia/Tashkent. */
export function minutesInTashkent(now = new Date()): number {
  const clock = formatInTimeZone(now, TZ, 'HH:mm');
  const [h, m] = clock.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isWorkingTime(now: Date, start = '09:00', end = '18:00'): boolean {
  const minutes = minutesInTashkent(now);
  return minutes >= parseClock(start) && minutes < parseClock(end);
}
