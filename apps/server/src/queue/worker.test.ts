import { describe, expect, it } from 'vitest';
import type { Lead, PriceResult } from '@jonlix/shared';
import { insertLead, openDatabase } from './db.js';
import { processQueue } from './worker.js';

const estimate: PriceResult = {
  kind: 'fixed',
  baseMin: 50_000,
  baseMax: 50_000,
  urgencyDays: null,
  urgencyPct: 0,
  discountPct: 10,
  totalMin: 45_000,
  totalMax: 45_000,
  prepaymentMin: 23_000,
  prepaymentMax: 23_000,
};

function lead(): Lead {
  return {
    client_request_id: '8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f',
    source: 'quiz',
    lang: 'ru',
    service: 'photo',
    answers: { photo_count: '1', photo_purpose: 'gift', deadline_mode: 'standard', contact_method: 'call' },
    contact: { name: 'Али', phone: '+998901112233', comment: '' },
    consent: true,
    page_url: 'https://jonlix.uz/',
    started_at: 1,
  };
}

describe('processQueue', () => {
  it('повторяет ошибку таблицы и затем помечает доставку', async () => {
    const db = openDatabase(':memory:');
    insertLead(db, {
      leadId: 'JX-20261121-0001',
      clientRequestId: lead().client_request_id,
      createdAt: '2026-11-21T12:00:00+05:00',
      payload: lead(),
      estimate,
      workingHours: true,
      urgent: false,
    });
    let sheetsCalls = 0;
    await processQueue(db, {
      sheetsEnabled: true,
      telegramEnabled: true,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
      appendLead: async () => {
        sheetsCalls += 1;
        throw new Error('sheets down');
      },
      updateDeliveryCell: async () => undefined,
      sendToAdmins: async (_html, _silent, already) => ({ ...already, '1': 10 }),
      notifyFailedSheet: async () => undefined,
    });
    const row = db.prepare('SELECT * FROM leads WHERE lead_id = ?').get('JX-20261121-0001') as {
      sheets_status: string;
      sheets_attempts: number;
      tg_status: string;
    };
    expect(sheetsCalls).toBe(1);
    expect(row.sheets_status).toBe('pending');
    expect(row.sheets_attempts).toBe(1);
    expect(row.tg_status).toBe('done');
    db.close();
  });
});
