import {
  LeadSchema,
  calculatePrice,
  formatTashkent,
  isWorkingTime,
  todayInTashkent,
  zodErrors,
  type PriceResult,
} from '@jonlix/shared';
import { clientChatUrl, formatLeadMessage } from '../../../server/src/bot/format.ts';

const ALLOWED_HOSTS = new Set(['jonlix-ai-studio.vercel.app', 'localhost', '127.0.0.1']);

export interface LeadRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface LeadResponseWriter {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

function header(req: LeadRequest, name: string): string {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function originAllowed(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (ALLOWED_HOSTS.has(url.hostname)) return url.protocol === 'https:' || url.hostname !== 'jonlix-ai-studio.vercel.app';
    return url.protocol === 'https:' && url.hostname.startsWith('jonlix-ai-studio') && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function publicEstimate(estimate: PriceResult) {
  return {
    kind: estimate.kind,
    totalMin: estimate.totalMin,
    totalMax: estimate.totalMax,
    prepaymentMin: estimate.prepaymentMin,
    prepaymentMax: estimate.prepaymentMax,
    urgencyPct: estimate.urgencyPct,
    discountPct: estimate.discountPct,
  };
}

function send(res: LeadResponseWriter, status: number, body: unknown, origin = ''): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.end(JSON.stringify(body));
}

async function readBody(req: LeadRequest): Promise<unknown> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body) as unknown;
  const stream = req as LeadRequest & AsyncIterable<Uint8Array>;
  if (typeof stream[Symbol.asyncIterator] !== 'function') return {};
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as unknown) : {};
}

export async function handleLead(req: LeadRequest, res: LeadResponseWriter): Promise<void> {
  const origin = header(req, 'origin');
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) {
      send(res, 403, { error: 'origin' });
      return;
    }
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method' }, originAllowed(origin) ? origin : '');
    return;
  }
  if (!originAllowed(origin)) {
    send(res, 403, { error: 'origin' });
    return;
  }

  let payload: unknown;
  try {
    payload = await readBody(req);
  } catch {
    send(res, 400, { error: 'json' }, origin);
    return;
  }

  const parsed = LeadSchema.safeParse(payload);
  if (!parsed.success) {
    send(res, 422, { errors: zodErrors(parsed.error) }, origin);
    return;
  }
  const lead = parsed.data;
  const now = new Date();
  if (lead.website?.trim() || (Date.now() - lead.started_at >= 0 && Date.now() - lead.started_at < 4000)) {
    const fakeId = `JX-${formatTashkent(now, 'yyyyMMdd')}-${String(9000 + Math.floor(Math.random() * 1000)).padStart(4, '0')}`;
    send(res, 201, {
      lead_id: fakeId,
      working_hours: true,
      sla_min: 30,
      estimate: { kind: 'individual', totalMin: null, totalMax: null, prepaymentMin: null, prepaymentMax: null, urgencyPct: 0, discountPct: 0 },
    }, origin);
    return;
  }

  const token = process.env.BOT_TOKEN?.trim() ?? '';
  const chats = (process.env.ADMIN_CHAT_IDS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!token || !chats.length) {
    send(res, 500, { error: 'telegram' }, origin);
    return;
  }

  const today = todayInTashkent(now);
  const estimate = calculatePrice({
    service: lead.service,
    photoCount: lead.answers.photo_count,
    videoVariant: lead.answers.video_variant,
    videoDuration: lead.answers.video_duration,
    deadlineMode: lead.answers.deadline_mode,
    deadlineDate: lead.answers.deadline_date,
    today,
    discount: lead.source === 'quiz',
  });
  const working = isWorkingTime(now, process.env.WORK_HOURS_START || '09:00', process.env.WORK_HOURS_END || '18:00');
  const urgent = lead.answers.deadline_mode === 'date' && (estimate.urgencyDays ?? 99) <= 6;
  const leadId = `JX-${formatTashkent(now, 'yyyyMMdd')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const createdAt = formatTashkent(now, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const html = formatLeadMessage({ leadId, createdAt, workingHours: working, urgent, lead, estimate });
  const contactUrl = clientChatUrl(lead.contact.telegram);
  const replyMarkup = contactUrl
    ? { inline_keyboard: [[{ text: 'Написать клиенту', url: contactUrl }]] }
    : undefined;

  let delivered = false;
  for (const chatId of chats) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_notification: !working,
        reply_markup: replyMarkup,
      }),
    });
    if (response.ok) delivered = true;
  }
  if (!delivered) {
    send(res, 502, { error: 'telegram' }, origin);
    return;
  }

  send(res, 201, {
    lead_id: leadId,
    working_hours: working,
    sla_min: Number(process.env.RESPONSE_SLA_MIN || 30),
    estimate: publicEstimate(estimate),
  }, origin);
}
