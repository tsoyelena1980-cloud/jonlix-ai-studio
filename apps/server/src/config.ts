import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env.example'),
  path.resolve(process.cwd(), '../../.env.example'),
];
for (const file of candidates) {
  if (existsSync(file)) dotenv.config({ path: file });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  BOT_TOKEN: z.string().default(''),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  BOT_WEBHOOK_SECRET: z.string().default(''),
  ADMIN_CHAT_IDS: z.string().default(''),
  TG_PUBLIC_USERNAME: z.string().default('jonlix_studio'),
  WEBAPP_URL: z.string().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),
  SHEET_ID: z.string().default(''),
  SHEET_LEADS_TAB: z.string().default('Заявки'),
  SHEET_PORTFOLIO_TAB: z.string().default('Портфолио'),
  WORK_HOURS_START: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  WORK_HOURS_END: z.string().regex(/^\d{2}:\d{2}$/).default('18:00'),
  RESPONSE_SLA_MIN: z.coerce.number().int().positive().default(30),
  TZ_NAME: z.string().default('Asia/Tashkent'),
  SQLITE_PATH: z.string().default('./data/jonlix.db'),
  LOG_LEVEL: z.string().default('info'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  publicBaseUrl: string;
  corsOrigins: string[];
  trustProxy: boolean;
  botToken: string;
  botMode: 'polling' | 'webhook';
  botWebhookSecret: string;
  adminChatIds: string[];
  tgPublicUsername: string;
  webAppUrl: string;
  googleCredentialsJson: string;
  sheetId: string;
  sheetLeadsTab: string;
  sheetPortfolioTab: string;
  workStart: string;
  workEnd: string;
  slaMin: number;
  tz: string;
  sqlitePath: string;
  logLevel: string;
  sheetsEnabled: boolean;
  telegramEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Проверьте переменные окружения:\n${lines.join('\n')}`);
  }
  const data = parsed.data;
  const config: AppConfig = {
    nodeEnv: data.NODE_ENV,
    port: data.PORT,
    publicBaseUrl: data.PUBLIC_BASE_URL.replace(/\/$/, ''),
    corsOrigins: data.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
    trustProxy: data.TRUST_PROXY === 'true',
    botToken: data.BOT_TOKEN.trim(),
    botMode: data.BOT_MODE,
    botWebhookSecret: data.BOT_WEBHOOK_SECRET.trim(),
    adminChatIds: data.ADMIN_CHAT_IDS.split(',').map((item) => item.trim()).filter(Boolean),
    tgPublicUsername: data.TG_PUBLIC_USERNAME.replace(/^@/, ''),
    webAppUrl: data.WEBAPP_URL.trim().replace(/\/$/, ''),
    googleCredentialsJson: data.GOOGLE_SERVICE_ACCOUNT_JSON.trim(),
    sheetId: data.SHEET_ID.trim(),
    sheetLeadsTab: data.SHEET_LEADS_TAB,
    sheetPortfolioTab: data.SHEET_PORTFOLIO_TAB,
    workStart: data.WORK_HOURS_START,
    workEnd: data.WORK_HOURS_END,
    slaMin: data.RESPONSE_SLA_MIN,
    tz: data.TZ_NAME,
    sqlitePath: data.SQLITE_PATH,
    logLevel: data.LOG_LEVEL,
    sheetsEnabled: false,
    telegramEnabled: false,
  };
  config.sheetsEnabled = Boolean(config.sheetId && config.googleCredentialsJson);
  config.telegramEnabled = Boolean(config.botToken);

  if (config.nodeEnv === 'production') {
    const missing: string[] = [];
    if (!config.botToken) missing.push('BOT_TOKEN');
    if (!config.adminChatIds.length) missing.push('ADMIN_CHAT_IDS');
    if (!config.sheetId) missing.push('SHEET_ID');
    if (!config.googleCredentialsJson) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (config.botMode === 'webhook' && config.botWebhookSecret.length < 16) missing.push('BOT_WEBHOOK_SECRET');
    if (missing.length) {
      throw new Error(`В production обязательны: ${missing.join(', ')}`);
    }
  }
  return config;
}
