import { InlineKeyboard } from 'grammy';
import type { LeadStatus } from '@jonlix/shared';

export const STATUS_ALLOWED: Record<LeadStatus, LeadStatus[]> = {
  new: ['in_work', 'no_answer', 'prepaid', 'rejected'],
  in_work: ['prepaid', 'no_answer', 'rejected'],
  no_answer: ['in_work', 'prepaid', 'rejected'],
  prepaid: ['revision', 'done'],
  revision: ['done'],
  done: [],
  rejected: [],
};

const LABEL: Record<LeadStatus, string> = {
  new: 'Новая',
  in_work: '✅ Взял в работу',
  no_answer: '📵 Не дозвонился',
  prepaid: '💳 Предоплата',
  revision: '✏️ Правка',
  done: '🏁 Сдано',
  rejected: '❌ Отказ',
};

export function statusKeyboard(leadId: string, status: LeadStatus, contactUrl?: string): InlineKeyboard | undefined {
  const next = STATUS_ALLOWED[status];
  if (!next.length && !contactUrl) return undefined;
  const kb = new InlineKeyboard();
  if (contactUrl?.startsWith('https://')) {
    kb.url('Написать клиенту', contactUrl).row();
  }
  next.forEach((item, index) => {
    kb.text(LABEL[item], `st:${leadId}:${item}`);
    if (index % 2 === 1 && index < next.length - 1) kb.row();
  });
  return kb;
}
