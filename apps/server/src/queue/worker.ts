import { GrammyError } from 'grammy';
import type { Lead, PriceResult } from '@jonlix/shared';
import { clientChatUrl, formatLeadMessage } from '../bot/format.js';
import { getLead, listPending, readEstimate, readPayload, saveDelivery, type LeadRow, type Sqlite } from './db.js';

const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000];

export interface DeliveryDeps {
  sheetsEnabled: boolean;
  telegramEnabled: boolean;
  appendLead: (input: {
    leadId: string;
    createdAt: string;
    workingHours: boolean;
    lead: Lead;
    estimate: PriceResult;
    tgStatus: string;
  }) => Promise<number | null>;
  updateDeliveryCell: (row: number, value: string) => Promise<void>;
  sendToAdmins: (html: string, silent: boolean, already: Record<string, number>, leadId: string, contactUrl?: string) => Promise<Record<string, number>>;
  notifyFailedSheet: (text: string) => Promise<void>;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)] ?? 3_600_000;
}

function ageExceeded(createdAt: string, now: number): boolean {
  return now - new Date(createdAt).getTime() > 24 * 60 * 60 * 1000;
}

export async function processQueue(db: Sqlite, deps: DeliveryDeps, now = new Date()): Promise<void> {
  const rows = listPending(db, now.toISOString());
  for (const row of rows) {
    await deliverOne(db, deps, row, now);
  }
}

async function deliverOne(db: Sqlite, deps: DeliveryDeps, row: LeadRow, now: Date): Promise<void> {
  let current = row;
  const lead = readPayload(current);
  const estimate = readEstimate(current);
  let sheetsAttempts = current.sheets_attempts;
  let tgAttempts = current.tg_attempts;

  if (current.sheets_status === 'pending') {
    if (!deps.sheetsEnabled) {
      current = { ...current, sheets_status: 'skipped' };
      saveDelivery(db, current.lead_id, { sheets_status: 'skipped' });
    } else {
      try {
        const sheetsRow = await deps.appendLead({
          leadId: current.lead_id,
          createdAt: current.created_at,
          workingHours: current.working_hours === 1,
          lead,
          estimate,
          tgStatus: current.tg_status === 'done' ? 'done' : 'pending',
        });
        sheetsAttempts = 0;
        current = { ...current, sheets_status: 'done', sheets_row: sheetsRow, sheets_attempts: sheetsAttempts };
        saveDelivery(db, current.lead_id, {
          sheets_status: 'done',
          sheets_row: sheetsRow,
          sheets_attempts: 0,
        });
        deps.log.info({ event: 'sheets_append_ok', lead_id: current.lead_id, row: sheetsRow }, 'sheets append');
      } catch (error) {
        sheetsAttempts += 1;
        const failed = ageExceeded(current.created_at, now.getTime());
        saveDelivery(db, current.lead_id, {
          sheets_status: failed ? 'failed' : 'pending',
          sheets_attempts: sheetsAttempts,
          next_attempt_at: new Date(now.getTime() + backoff(sheetsAttempts)).toISOString(),
        });
        deps.log.error({ event: 'sheets_append_fail', lead_id: current.lead_id, err: String(error) }, 'sheets append failed');
        if (failed) {
          const text = `⚠️ Заявка ${current.lead_id} не записана в таблицу\n\n${formatLeadMessage({
            leadId: current.lead_id,
            createdAt: current.created_at,
            workingHours: current.working_hours === 1,
            urgent: current.urgent === 1,
            lead,
            estimate,
          })}`;
          await deps.notifyFailedSheet(text).catch(() => undefined);
        }
        current = getLead(db, current.lead_id) ?? current;
      }
    }
  }

  if (current.tg_status === 'pending') {
    if (!deps.telegramEnabled) {
      saveDelivery(db, current.lead_id, { tg_status: 'skipped' });
    } else {
      const html = formatLeadMessage({
        leadId: current.lead_id,
        createdAt: current.created_at,
        workingHours: current.working_hours === 1,
        urgent: current.urgent === 1,
        lead,
        estimate,
      });
      const already = current.tg_message_ids ? (JSON.parse(current.tg_message_ids) as Record<string, number>) : {};
      try {
        const ids = await deps.sendToAdmins(
          html,
          current.working_hours === 0,
          already,
          current.lead_id,
          clientChatUrl(lead.contact.telegram),
        );
        saveDelivery(db, current.lead_id, {
          tg_status: 'done',
          tg_message_ids: JSON.stringify(ids),
          tg_attempts: tgAttempts,
        });
        deps.log.info({ event: 'tg_send_ok', lead_id: current.lead_id }, 'telegram sent');
        if (current.sheets_status === 'done' && current.sheets_row) {
          await deps.updateDeliveryCell(current.sheets_row, 'ок').catch((error: unknown) => {
            deps.log.warn({ event: 'sheets_append_fail', lead_id: current.lead_id, err: String(error) }, 'tg column update failed');
          });
        }
      } catch (error) {
        tgAttempts += 1;
        const retryAfter = error instanceof GrammyError && error.error_code === 429
          ? (error.parameters.retry_after ?? 30) * 1000
          : backoff(tgAttempts);
        const failed = ageExceeded(current.created_at, now.getTime());
        saveDelivery(db, current.lead_id, {
          tg_status: failed ? 'failed' : 'pending',
          tg_attempts: tgAttempts,
          tg_message_ids: JSON.stringify(already),
          next_attempt_at: new Date(now.getTime() + retryAfter).toISOString(),
        });
        deps.log.error({ event: 'tg_send_fail', lead_id: current.lead_id, err: String(error) }, 'telegram failed');
        if (failed && current.sheets_row) {
          await deps.updateDeliveryCell(current.sheets_row, 'ошибка').catch(() => undefined);
        }
      }
    }
  }
}

export function startWorker(db: Sqlite, deps: DeliveryDeps): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await processQueue(db, deps);
    } catch (error) {
      deps.log.error({ err: String(error) }, 'queue tick failed');
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 10_000);
  void tick();
  return () => clearInterval(timer);
}
