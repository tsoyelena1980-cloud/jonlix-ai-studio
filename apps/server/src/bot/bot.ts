import {
  SHEET_STATUS,
  minutesInTashkent,
  parseClock,
  todayInTashkent,
  type LeadStatus,
} from '@jonlix/shared';
import { Bot, InlineKeyboard, Keyboard, type Context } from 'grammy';
import cron from 'node-cron';
import { clientChatUrl, formatLeadMessage } from './format.js';
import { STATUS_ALLOWED, statusKeyboard } from './keyboards.js';
import type { AppConfig } from '../config.js';
import {
  getLead,
  leadsOnDay,
  leadsSince,
  markSla,
  newLeads,
  readEstimate,
  readPayload,
  rememberReminder,
  updateLeadStatus,
  type Sqlite,
} from '../queue/db.js';

export interface BotDeps {
  config: AppConfig;
  db: Sqlite;
  updateSheetStatus: (row: number, label: string) => Promise<void>;
}

function isAdmin(config: AppConfig, chatId: number | undefined): boolean {
  return chatId != null && config.adminChatIds.includes(String(chatId));
}

function clientKeyboard(config: AppConfig): Keyboard | undefined {
  const url = config.webAppUrl;
  if (!url.startsWith('https://')) return undefined;
  return new Keyboard()
    .webApp('Пройти квиз', `${url}/quiz`)
    .row()
    .webApp('Перейти на сайт', `${url}/`)
    .resized()
    .persistent();
}

function greet(hasApp: boolean, manager = 'jonlix_studio', name?: string): string {
  const hello = name ? `Здравствуйте, ${name}!` : 'Здравствуйте!';
  const managerLine = `Написать менеджеру: https://t.me/${manager}`;
  if (hasApp) {
    return `${hello} Это Jonlix AI Studio.\n\nПортрет в любом городе, оживлённые семейные фото и видео к празднику.\n\n${managerLine}`;
  }
  return `${hello} Это Jonlix AI Studio. Оставьте заявку на сайте, и менеджер получит её в этом боте.\n\n${managerLine}`;
}

function cardFromRow(row: ReturnType<typeof getLead>, statusAt?: string) {
  if (!row) return null;
  return formatLeadMessage({
    leadId: row.lead_id,
    createdAt: row.created_at,
    workingHours: row.working_hours === 1,
    urgent: row.urgent === 1,
    lead: readPayload(row),
    estimate: readEstimate(row),
    status: row.lead_status,
    statusAt,
  });
}

async function sendCard(ctx: Context, db: Sqlite, leadId: string): Promise<void> {
  const row = getLead(db, leadId);
  if (!row) {
    await ctx.reply('Заявка не найдена. Проверьте номер: /lead JX-ГГГГММДД-0001');
    return;
  }
  const text = cardFromRow(row);
  if (!text) return;
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: statusKeyboard(row.lead_id, row.lead_status, clientChatUrl(readPayload(row).contact.telegram)),
  });
}

export function createBot(token: string, deps: BotDeps): Bot {
  const bot = new Bot(token);
  const { config, db } = deps;
  bot.catch((err) => {
    console.error('Telegram:', err.message);
  });

  bot.command('start', async (ctx) => {
    const keyboard = clientKeyboard(config);
    const extra = keyboard ? { reply_markup: keyboard } : {};
    await ctx.reply(greet(Boolean(keyboard), config.tgPublicUsername, ctx.from?.first_name), extra);
  });

  bot.command('client', async (ctx) => {
    const keyboard = clientKeyboard(config);
    const extra = keyboard ? { reply_markup: keyboard } : {};
    if (!isAdmin(config, ctx.chat.id)) {
      await ctx.reply(greet(Boolean(keyboard), config.tgPublicUsername), extra);
      return;
    }
    await ctx.reply(`Так бот отвечает клиенту:\n\n${greet(Boolean(keyboard), config.tgPublicUsername)}`, extra);
  });

  bot.command('help', async (ctx) => {
    if (!isAdmin(config, ctx.chat.id)) {
      const keyboard = clientKeyboard(config);
      return ctx.reply(greet(Boolean(keyboard), config.tgPublicUsername), keyboard ? { reply_markup: keyboard } : {});
    }
    await ctx.reply('/client — ответ для клиента\n/today\n/stats\n/lead JX-ГГГГММДД-0001\n/id');
  });

  bot.command('id', async (ctx) => {
    await ctx.reply(`chat.id: ${ctx.chat.id}`);
  });

  bot.command('today', async (ctx) => {
    if (!isAdmin(config, ctx.chat.id)) {
      const keyboard = clientKeyboard(config);
      return ctx.reply(greet(Boolean(keyboard), config.tgPublicUsername), keyboard ? { reply_markup: keyboard } : {});
    }
    const day = todayInTashkent();
    const rows = leadsOnDay(db, day);
    const byService = new Map<string, number>();
    const byStatus = new Map<string, number>();
    for (const row of rows) {
      const lead = readPayload(row);
      byService.set(lead.service, (byService.get(lead.service) ?? 0) + 1);
      byStatus.set(row.lead_status, (byStatus.get(row.lead_status) ?? 0) + 1);
    }
    const services = [...byService.entries()].map(([key, n]) => `${key}: ${n}`).join(', ') || '—';
    const statuses = [...byStatus.entries()].map(([key, n]) => `${SHEET_STATUS[key] ?? key}: ${n}`).join(', ') || '—';
    const last = rows.slice(0, 10).map((row) => {
      const lead = readPayload(row);
      return `${row.lead_id} · ${lead.contact.name} · ${lead.service} · ${SHEET_STATUS[row.lead_status] ?? row.lead_status}`;
    });
    await ctx.reply([`Сегодня (${day}): ${rows.length}`, `Услуги: ${services}`, `Статусы: ${statuses}`, '', ...last].join('\n'));
  });

  bot.command('stats', async (ctx) => {
    if (!isAdmin(config, ctx.chat.id)) {
      const keyboard = clientKeyboard(config);
      return ctx.reply(greet(Boolean(keyboard), config.tgPublicUsername), keyboard ? { reply_markup: keyboard } : {});
    }
    const blocks = [7, 30].map((days) => {
      const since = new Date(Date.now() - days * 86_400_000);
      const rows = leadsSince(db, since);
      const quiz = rows.filter((row) => readPayload(row).source === 'quiz').length;
      const done = rows.filter((row) => row.lead_status === 'done').length;
      const sum = rows.reduce((acc, row) => acc + (readEstimate(row).totalMin ?? 0), 0);
      const share = rows.length ? Math.round((quiz / rows.length) * 100) : 0;
      const doneShare = rows.length ? Math.round((done / rows.length) * 100) : 0;
      return `${days} дн.: ${rows.length} заявок, из квиза ${share}%, предварительная сумма ${sum}, сдано ${doneShare}%`;
    });
    await ctx.reply(blocks.join('\n'));
  });

  bot.command('lead', async (ctx) => {
    if (!isAdmin(config, ctx.chat.id)) {
      const keyboard = clientKeyboard(config);
      return ctx.reply(greet(Boolean(keyboard), config.tgPublicUsername), keyboard ? { reply_markup: keyboard } : {});
    }
    const id = String(ctx.match ?? '').trim();
    if (!id) {
      await ctx.reply('Напишите номер: /lead JX-ГГГГММДД-0001');
      return;
    }
    await sendCard(ctx, db, id);
  });

  bot.on('callback_query:data', async (ctx) => {
    if (!isAdmin(config, ctx.chat?.id)) {
      await ctx.answerCallbackQuery();
      return;
    }
    const data = ctx.callbackQuery.data;
    const match = /^st:(JX-\d{8}-\d{4}):([a-z_]+)$/.exec(data);
    if (!match) {
      await ctx.answerCallbackQuery({ text: 'Не понял кнопку' });
      return;
    }
    const leadId = match[1]!;
    const status = match[2] as LeadStatus;
    const row = getLead(db, leadId);
    if (!row || !STATUS_ALLOWED[row.lead_status]?.includes(status)) {
      await ctx.answerCallbackQuery({ text: 'Этот статус уже нельзя сменить' });
      return;
    }
    updateLeadStatus(db, leadId, status);
    const fresh = getLead(db, leadId);
    if (fresh?.sheets_row) {
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        try {
          await deps.updateSheetStatus(fresh.sheets_row, SHEET_STATUS[status] ?? status);
          saved = true;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    const text = cardFromRow(fresh, new Date().toISOString());
    if (text) {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: statusKeyboard(leadId, status, fresh ? clientChatUrl(readPayload(fresh).contact.telegram) : undefined),
      });
    }
    await ctx.answerCallbackQuery({ text: 'Статус обновлён' });
  });

  bot.on('message', async (ctx) => {
    if (isAdmin(config, ctx.chat.id)) return;
    await ctx.reply(greet(Boolean(clientKeyboard(config)), config.tgPublicUsername), clientKeyboard(config) ? { reply_markup: clientKeyboard(config) } : {});
  });

  return bot;
}

export function bindReminders(bot: Bot, deps: BotDeps): { stop: () => void } {
  const sendAdmins = async (text: string) => {
    for (const chatId of deps.config.adminChatIds) {
      await bot.api.sendMessage(chatId, text).catch(() => undefined);
    }
  };

  const night = async () => {
    const day = todayInTashkent();
    const lines: string[] = [];
    for (const row of newLeads(deps.db)) {
      if (row.working_hours === 1) continue;
      if (!rememberReminder(deps.db, row.lead_id, 'night', day)) continue;
      const lead = readPayload(row);
      lines.push(`${row.lead_id} · ${lead.contact.name} · ${lead.service}`);
    }
    if (lines.length) await sendAdmins(`🌅 Ночные заявки (${lines.length}):\n${lines.join('\n')}`);
  };

  const sla = async () => {
    const now = new Date();
    const minutes = minutesInTashkent(now);
    const start = parseClock(deps.config.workStart);
    const end = parseClock(deps.config.workEnd);
    if (minutes < start + 30 || minutes > end) return;
    for (const row of newLeads(deps.db)) {
      const created = new Date(row.created_at);
      const waitStart = row.working_hours === 1 ? created : new Date(`${todayInTashkent(now)}T${deps.config.workStart}:00+05:00`);
      const mins = Math.floor((now.getTime() - waitStart.getTime()) / 60_000);
      if (mins < deps.config.slaMin) continue;
      if (row.last_sla_at && now.getTime() - new Date(row.last_sla_at).getTime() < 60 * 60 * 1000) continue;
      markSla(deps.db, row.lead_id, now.toISOString());
      await sendAdmins(`⏰ Заявка ${row.lead_id} ждёт ответа ${mins} мин`);
    }
  };

  const tasks = [
    cron.schedule('0 9 * * *', () => void night(), { timezone: 'Asia/Tashkent' }),
    cron.schedule('30 9 * * *', () => void sla(), { timezone: 'Asia/Tashkent' }),
    cron.schedule('0,30 10-17 * * *', () => void sla(), { timezone: 'Asia/Tashkent' }),
    cron.schedule('0 18 * * *', () => void sla(), { timezone: 'Asia/Tashkent' }),
  ];
  return { stop: () => tasks.forEach((task) => task.stop()) };
}

export async function registerMiniApp(bot: Bot, url: string): Promise<void> {
  if (!url.startsWith('https://')) return;
  await bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Студия', web_app: { url } },
  });
}

export async function registerCommands(bot: Bot, config: AppConfig): Promise<void> {
  await bot.api.deleteMyCommands();
  await bot.api.deleteMyCommands({ scope: { type: 'all_private_chats' } });
  await bot.api.deleteMyCommands({ scope: { type: 'all_group_chats' } });
  for (const chatId of config.adminChatIds) {
    await bot.api.deleteMyCommands({ scope: { type: 'chat', chat_id: Number(chatId) } });
  }
}
