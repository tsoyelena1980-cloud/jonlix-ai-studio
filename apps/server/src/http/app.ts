import helmet from '@fastify/helmet';
import {
  LeadSchema,
  calculatePrice,
  formatTashkent,
  isWorkingTime,
  todayInTashkent,
  zodErrors,
  type Lang,
  type PriceResult,
} from '@jonlix/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { nextLeadId } from '../lib/leadId.js';
import { maskPhone } from '../lib/escape.js';
import {
  findByClientRequest,
  insertLead,
  pendingCount,
  type Sqlite,
} from '../queue/db.js';
import type { AppConfig } from '../config.js';
import type { PortfolioItem } from '../sheets/portfolio.js';

export interface AppDeps {
  config: AppConfig;
  db: Sqlite;
  kick: (leadId: string) => void;
  loadPortfolio: (lang: Lang) => Promise<PortfolioItem[]>;
  integrationStatus: () => { sheets: 'ok' | 'error' | 'skipped'; telegram: 'ok' | 'error' | 'skipped' };
}

function clientIp(reqIp: string, forwarded: string | string[] | undefined, trust: boolean): string {
  if (trust && typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]!.trim();
  return reqIp;
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

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const hits = new Map<string, number[]>();
  const rateLimited = (ip: string, now: number): boolean => {
    const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < 3_600_000);
    const last10 = recent.filter((stamp) => now - stamp < 600_000);
    if (last10.length >= 3 || recent.length >= 20) {
      hits.set(ip, recent);
      return true;
    }
    recent.push(now);
    hits.set(ip, recent);
    return false;
  };
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel },
    bodyLimit: 16 * 1024,
    trustProxy: config.trustProxy,
  });
  await app.register(helmet);

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && config.corsOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      await reply.code(204).send();
    }
  });

  app.get('/api/health', async () => {
    const status = deps.integrationStatus();
    return { ok: true, sheets: status.sheets, telegram: status.telegram, queue_pending: pendingCount(db) };
  });

  app.get('/api/portfolio', async (req, reply) => {
    const langParam = (req.query as { lang?: string }).lang;
    const lang: Lang = langParam === 'uz' || langParam === 'en' ? langParam : 'ru';
    try {
      const items = await deps.loadPortfolio(lang);
      reply.header('Cache-Control', 'public, max-age=300');
      return { items };
    } catch (error) {
      req.log.error({ event: 'portfolio_cache_refresh', err: String(error) }, 'portfolio failed');
      return reply.code(503).send({ items: [] });
    }
  });

  app.post('/api/leads', async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && !config.corsOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'origin' });
    }
    if (!origin && config.nodeEnv === 'production') {
      return reply.code(403).send({ error: 'origin' });
    }

    const ip = clientIp(req.ip, req.headers['x-forwarded-for'], config.trustProxy);
    if (rateLimited(ip, Date.now())) return reply.code(429).send({ error: 'rate_limit' });

    const parsed = LeadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ errors: zodErrors(parsed.error) });
    const lead = parsed.data;

    const honeypot = Boolean(lead.website?.trim());
    const delta = Date.now() - lead.started_at;
    if (honeypot || (delta >= 0 && delta < 4000)) {
      req.log.warn({ event: 'spam_blocked', ip, honeypot }, 'spam blocked');
      const fakeId = `JX-${formatTashkent(new Date(), 'yyyyMMdd')}-${String(9000 + Math.floor(Math.random() * 1000)).padStart(4, '0')}`;
      return reply.code(201).send({
        lead_id: fakeId,
        working_hours: true,
        sla_min: config.slaMin,
        estimate: { kind: 'individual', totalMin: null, totalMax: null, prepaymentMin: null, prepaymentMax: null, urgencyPct: 0, discountPct: 0 },
      });
    }

    const existing = findByClientRequest(db, lead.client_request_id);
    if (existing) {
      req.log.info({ event: 'lead_duplicate', lead_id: existing.lead_id }, 'duplicate lead');
      return reply.code(200).send({
        lead_id: existing.lead_id,
        working_hours: existing.working_hours === 1,
        sla_min: config.slaMin,
        estimate: publicEstimate(JSON.parse(existing.estimate_json) as PriceResult),
      });
    }

    const now = new Date();
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
    if (lead.estimate_client && lead.estimate_client.totalMin !== estimate.totalMin) {
      req.log.warn({ event: 'estimate_mismatch', service: lead.service, phone: maskPhone(lead.contact.phone) }, 'client estimate differs');
    }

    const working = isWorkingTime(now, config.workStart, config.workEnd);
    const urgent = lead.answers.deadline_mode === 'date' && (estimate.urgencyDays ?? 99) <= 6;
    const leadId = nextLeadId(db, now);
    const createdAt = formatTashkent(now, "yyyy-MM-dd'T'HH:mm:ssXXX");
    const sheetsStatus = config.sheetsEnabled ? 'pending' : 'skipped';
    const tgStatus = config.telegramEnabled ? 'pending' : 'skipped';

    try {
      insertLead(db, {
        leadId,
        clientRequestId: lead.client_request_id,
        createdAt,
        payload: lead,
        estimate,
        workingHours: working,
        urgent,
        sheetsStatus,
        tgStatus,
      });
    } catch (error) {
      const again = findByClientRequest(db, lead.client_request_id);
      if (again) {
        return reply.code(200).send({
          lead_id: again.lead_id,
          working_hours: again.working_hours === 1,
          sla_min: config.slaMin,
          estimate: publicEstimate(JSON.parse(again.estimate_json) as PriceResult),
        });
      }
      req.log.error({ err: String(error) }, 'lead insert failed');
      return reply.code(500).send({ error: 'store' });
    }

    req.log.info({ event: 'lead_created', lead_id: leadId, service: lead.service, phone: maskPhone(lead.contact.phone) }, 'lead created');
    deps.kick(leadId);
    return reply.code(201).send({
      lead_id: leadId,
      working_hours: working,
      sla_min: config.slaMin,
      estimate: publicEstimate(estimate),
    });
  });

  return app;
}
