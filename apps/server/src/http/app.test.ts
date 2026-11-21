import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createApp } from './app.js';
import { openDatabase } from '../queue/db.js';

const config = loadConfig({
  NODE_ENV: 'test',
  PORT: '3999',
  CORS_ORIGINS: 'http://localhost:5173',
  SQLITE_PATH: ':memory:',
  BOT_TOKEN: '',
  SHEET_ID: '',
  GOOGLE_SERVICE_ACCOUNT_JSON: '',
});

function body(id: string, patch: Record<string, unknown> = {}) {
  return {
    client_request_id: id,
    source: 'quiz',
    lang: 'ru',
    service: 'photo',
    answers: {
      photo_count: '1',
      photo_purpose: 'gift',
      deadline_mode: 'standard',
      contact_method: 'telegram',
    },
    contact: { name: 'Дилноза', phone: '+998901234567', telegram: '@dilnoza', comment: '' },
    consent: true,
    page_url: 'http://localhost:5173/',
    started_at: Date.now() - 10_000,
    ...patch,
  };
}

describe('POST /api/leads', () => {
  async function makeApp() {
    const db = openDatabase(':memory:');
    const app = await createApp({
      config,
      db,
      kick: () => undefined,
      loadPortfolio: async () => [],
      integrationStatus: () => ({ sheets: 'skipped', telegram: 'skipped' }),
    });
    return { app, db };
  }

  it('создаёт заявку и повторяет тот же номер', async () => {
    const { app, db } = await makeApp();
    const id = '8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f';
    const created = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: body(id),
    });
    expect(created.statusCode).toBe(201);
    const first = created.json() as { lead_id: string; estimate: { totalMin: number } };
    expect(first.lead_id).toMatch(/^JX-\d{8}-0001$/);
    expect(first.estimate.totalMin).toBe(45_000);

    const again = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: body(id),
    });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { lead_id: string }).lead_id).toBe(first.lead_id);
    await app.close();
    db.close();
  });

  it('отклоняет чужой origin, плохой телефон и считает honeypot успехом без записи', async () => {
    const { app, db } = await makeApp();
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      payload: body('11111111-1111-4111-8111-111111111111'),
    });
    expect(foreign.statusCode).toBe(403);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: body('22222222-2222-4222-8222-222222222222', {
        contact: { name: 'А', phone: '123', telegram: '' },
      }),
    });
    expect(invalid.statusCode).toBe(422);

    const spam = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: body('33333333-3333-4333-8333-333333333333', { website: 'http://spam.test' }),
    });
    expect(spam.statusCode).toBe(201);
    const count = db.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number };
    expect(count.n).toBe(0);
    await app.close();
    db.close();
  });

  it('ограничивает частоту с чистого счётчика', async () => {
    const fresh = openDatabase(':memory:');
    const limited = await createApp({
      config,
      db: fresh,
      kick: () => undefined,
      loadPortfolio: async () => [],
      integrationStatus: () => ({ sheets: 'skipped', telegram: 'skipped' }),
    });
    const headers = { origin: 'http://localhost:5173', 'content-type': 'application/json' };
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await limited.inject({
        method: 'POST',
        url: '/api/leads',
        headers,
        payload: body(`55555555-5555-4555-8555-55555555555${i}`),
      });
      codes.push(response.statusCode);
    }
    expect(codes.slice(0, 3).every((code) => code === 201)).toBe(true);
    expect(codes[3]).toBe(429);
    await limited.close();
    fresh.close();
  });
});
