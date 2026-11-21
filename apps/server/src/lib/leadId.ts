import { formatInTimeZone } from 'date-fns-tz';
import type { Sqlite } from '../queue/db.js';

const TZ = 'Asia/Tashkent';

export function nextLeadId(db: Sqlite, now = new Date()): string {
  const day = formatInTimeZone(now, TZ, 'yyyyMMdd');
  const row = db
    .prepare(
      `INSERT INTO counters(day, value) VALUES(?, 1)
       ON CONFLICT(day) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .get(day) as { value: number };
  return `JX-${day}-${String(row.value).padStart(4, '0')}`;
}
