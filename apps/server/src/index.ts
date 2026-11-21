import { loadConfig } from './config.js';
import { createBot, registerCommands, registerMiniApp, bindReminders } from './bot/bot.js';
import { createApp } from './http/app.js';
import { openDatabase } from './queue/db.js';
import { processQueue, startWorker, type DeliveryDeps } from './queue/worker.js';
import { statusKeyboard } from './bot/keyboards.js';
import { createSheets } from './sheets/client.js';
import { appendLead, updateCell } from './sheets/leads.js';
import { mapPortfolioRows, readPortfolio, type PortfolioItem } from './sheets/portfolio.js';
import type { Lang } from '@jonlix/shared';
import type { sheets_v4 } from 'googleapis';

const config = loadConfig();
const db = openDatabase(config.sqlitePath);

let sheets: sheets_v4.Sheets | null = null;
let sheetsHealth: 'ok' | 'error' | 'skipped' = config.sheetsEnabled ? 'ok' : 'skipped';
let telegramHealth: 'ok' | 'error' | 'skipped' = config.telegramEnabled ? 'ok' : 'skipped';

if (config.sheetsEnabled) {
  try {
    sheets = createSheets(config);
  } catch (error) {
    sheetsHealth = 'error';
    console.error('Google Sheets не подключились:', error);
  }
}

const portfolioCache = new Map<Lang, { at: number; items: PortfolioItem[] }>();
let portfolioStale: PortfolioItem[] | null = null;

async function loadPortfolio(lang: Lang): Promise<PortfolioItem[]> {
  const cached = portfolioCache.get(lang);
  if (cached && Date.now() - cached.at < 300_000) return cached.items;
  if (!sheets || !config.sheetsEnabled) return [];
  try {
    const rows = await readPortfolio(sheets, config.sheetId, config.sheetPortfolioTab);
    const mapped = mapPortfolioRows(rows, lang);
    if (mapped.skipped) console.warn(`portfolio: пропущено строк ${mapped.skipped}`);
    portfolioCache.set(lang, { at: Date.now(), items: mapped.items });
    portfolioStale = mapped.items;
    sheetsHealth = 'ok';
    return mapped.items;
  } catch (error) {
    sheetsHealth = 'error';
    if (portfolioStale) return portfolioStale;
    if (cached) return cached.items;
    throw error;
  }
}

const delivery: DeliveryDeps = {
  sheetsEnabled: Boolean(sheets),
  telegramEnabled: false,
  log: {
    info: (...args: unknown[]) => console.log(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
  },
  appendLead: async (input) => {
    if (!sheets) throw new Error('sheets unavailable');
    return appendLead(sheets, config.sheetId, config.sheetLeadsTab, input);
  },
  updateDeliveryCell: async (row, value) => {
    if (!sheets) return;
    await updateCell(sheets, config.sheetId, config.sheetLeadsTab, row, 'X', value);
  },
  sendToAdmins: async () => {
    throw new Error('telegram is not ready');
  },
  notifyFailedSheet: async () => undefined,
};

let kickQueue = () => {};

const app = await createApp({
  config,
  db,
  kick: () => kickQueue(),
  loadPortfolio,
  integrationStatus: () => ({
    sheets: sheetsHealth,
    telegram: telegramHealth,
  }),
});

let stopWorker = () => {};
let stopReminders = () => {};
let stopBot = async () => {};

if (config.telegramEnabled) {
  const bot = createBot(config.botToken, {
    config,
    db,
    updateSheetStatus: async (row, label) => {
      if (!sheets) return;
      await updateCell(sheets, config.sheetId, config.sheetLeadsTab, row, 'W', label);
    },
  });
  delivery.telegramEnabled = true;
  delivery.sendToAdmins = async (html, silent, already, leadId, contactUrl) => {
    if (!config.adminChatIds.length) throw new Error('ADMIN_CHAT_IDS is empty');
    const ids = { ...already };
    for (const chatId of config.adminChatIds) {
      if (ids[chatId]) continue;
      const message = await bot.api.sendMessage(chatId, html, {
        parse_mode: 'HTML',
        disable_notification: silent,
        reply_markup: statusKeyboard(leadId, 'new', contactUrl),
      });
      ids[chatId] = message.message_id;
    }
    return ids;
  };
  delivery.notifyFailedSheet = async (text) => {
    for (const chatId of config.adminChatIds) {
      await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => undefined);
    }
  };

  if (config.botMode === 'webhook') {
    const secret = config.botWebhookSecret;
    app.post(`/bot/${secret}`, async (req, reply) => {
      const header = req.headers['x-telegram-bot-api-secret-token'];
      if (header !== secret) return reply.code(401).send({ ok: false });
      await bot.handleUpdate(req.body as never);
      return reply.send({ ok: true });
    });
    const url = `${config.publicBaseUrl}/bot/${secret}`;
    await bot.api.setWebhook(url, { secret_token: secret });
  }

  try {
    const me = await bot.api.getMe();
    telegramHealth = 'ok';
    console.log(`Telegram подключён: @${me.username}, чатов менеджера: ${config.adminChatIds.length}, сайт: ${config.webAppUrl ? 'да' : 'нет'}`);
    await registerCommands(bot, config);
    await registerMiniApp(bot, config.webAppUrl);
  } catch (error) {
    telegramHealth = 'error';
    console.error('Telegram getMe не удался:', error);
  }

  if (config.botMode === 'polling') {
    void bot.start({
      onStart: () => console.log('Telegram: long polling'),
    });
    stopBot = async () => {
      await bot.stop();
    };
  }
  stopReminders = bindReminders(bot, { config, db, updateSheetStatus: async () => undefined }).stop;
}

stopWorker = startWorker(db, delivery);
kickQueue = () => {
  void processQueue(db, delivery);
};

const close = async () => {
  stopWorker();
  stopReminders();
  await stopBot();
  await app.close();
  db.close();
};
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`Jonlix API http://localhost:${config.port}`);
