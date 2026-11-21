import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLead, type LeadRequest, type LeadResponseWriter } from './handler.ts';

const origin = 'https://jonlix-ai-studio.vercel.app';

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
    contact: { name: 'Дилноза', phone: '+998901234567', telegram: '@dilnoza', comment: 'Портрет' },
    consent: true,
    page_url: 'https://jonlix-ai-studio.vercel.app/',
    started_at: Date.now() - 10_000,
    ...patch,
  };
}

function call(payload: unknown, requestOrigin = origin) {
  const holder: { status: number; raw: string } = { status: 0, raw: '' };
  const req: LeadRequest = {
    method: 'POST',
    headers: { origin: requestOrigin },
    body: payload,
  };
  const res: LeadResponseWriter = {
    statusCode: 0,
    setHeader: () => undefined,
    end: (raw) => {
      holder.status = res.statusCode;
      holder.raw = raw ?? '';
    },
  };
  return handleLead(req, res).then(() => ({
    status: holder.status,
    json: holder.raw ? (JSON.parse(holder.raw) as { lead_id?: string; error?: string; estimate?: { totalMin: number } }) : {},
  }));
}

describe('публичная заявка', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BOT_TOKEN;
    delete process.env.ADMIN_CHAT_IDS;
  });

  it('отправляет менеджеру имя, телефон и расчёт', async () => {
    process.env.BOT_TOKEN = 'test-token';
    process.env.ADMIN_CHAT_IDS = '7744756384';
    const sent: { chat_id?: string; text?: string; reply_markup?: { inline_keyboard: { url: string }[][] } }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as typeof sent[number]);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    const response = await call(body('8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f'));
    expect(response.status).toBe(201);
    expect(response.json.lead_id).toMatch(/^JX-\d{8}-\d{4}$/);
    expect(response.json.estimate?.totalMin).toBe(45_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chat_id).toBe('7744756384');
    expect(sent[0]?.text).toContain('Дилноза');
    expect(sent[0]?.text).toContain('+998 90 123 45 67');
    expect(sent[0]?.text).toContain('45');
    expect(sent[0]?.reply_markup?.inline_keyboard[0]?.[0]?.url).toBe('https://t.me/dilnoza');
  });

  it('не пишет менеджеру, если это ловушка для спама', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await call(body('33333333-3333-4333-8333-333333333333', { website: 'http://spam.test' }));
    expect(response.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отклоняет чужой сайт', async () => {
    const response = await call(body('11111111-1111-4111-8111-111111111111'), 'https://evil.example');
    expect(response.status).toBe(403);
  });
});
