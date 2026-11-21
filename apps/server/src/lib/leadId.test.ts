import { describe, expect, it } from 'vitest';
import { openDatabase } from '../queue/db.js';
import { nextLeadId } from './leadId.js';

describe('nextLeadId', () => {
  it('считает сутки по Ташкенту', () => {
    const db = openDatabase(':memory:');
    const evening = new Date('2026-11-21T18:30:00Z');
    const afterMidnight = new Date('2026-11-21T19:30:00Z');
    expect(nextLeadId(db, evening)).toBe('JX-20261121-0001');
    expect(nextLeadId(db, evening)).toBe('JX-20261121-0002');
    expect(nextLeadId(db, afterMidnight)).toBe('JX-20261122-0001');
    db.close();
  });
});
