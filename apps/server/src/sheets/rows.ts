import {
  SHEET_STATUS,
  answerLines,
  formatTashkent,
  label,
  type Lead,
  type PriceResult,
} from '@jonlix/shared';
import { normalizeTelegram, sheetPhone, sheetText } from '../lib/escape.js';

export const LEAD_HEADERS = [
  'lead_id',
  'Дата',
  'Источник',
  'Язык',
  'Услуга',
  'Ответы',
  'Срок',
  'Надбавка %',
  'База',
  'Скидка %',
  'Итого',
  'Предоплата',
  'Имя',
  'Телефон',
  'Telegram',
  'Комментарий',
  'Способ связи',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'Страница',
  'В рабочее время',
  'Статус',
  'Доставка в TG',
];

export const PORTFOLIO_HEADERS = [
  'Категория',
  'Заголовок RU',
  'Заголовок UZ',
  'Заголовок EN',
  'Ссылка «до»',
  'Ссылка «после» / видео',
  'Порядок',
  'Показывать',
];

export const STATUS_OPTIONS = [
  'Новая',
  'В работе',
  'Не дозвонился',
  'Предоплата получена',
  'Правка',
  'Сдано',
  'Отказ',
];

function deadlineCell(lead: Lead, estimate: PriceResult): string {
  if (lead.answers.deadline_mode === 'no_rush') return 'Не спешит';
  if (lead.answers.deadline_mode === 'date' && lead.answers.deadline_date) {
    const [y, m, d] = lead.answers.deadline_date.split('-');
    const days = estimate.urgencyDays ?? '';
    return `${d}.${m}.${y} (${days} дн.)`;
  }
  return 'Стандарт (7 дн.)';
}

function totalCell(estimate: PriceResult): string | number {
  if (estimate.kind === 'individual' || estimate.totalMin == null) return 'Индивидуально';
  if (estimate.kind === 'from') return `от ${estimate.totalMin}`;
  if (estimate.kind === 'range') return `${estimate.totalMin}–${estimate.totalMax}`;
  return estimate.totalMin;
}

function prepayCell(estimate: PriceResult): string | number {
  if (estimate.prepaymentMin == null) return '';
  if (estimate.kind === 'range' && estimate.prepaymentMax != null) {
    return `${estimate.prepaymentMin}–${estimate.prepaymentMax}`;
  }
  if (estimate.kind === 'from') return `от ${estimate.prepaymentMin}`;
  return estimate.prepaymentMin;
}

export function leadToRow(input: {
  leadId: string;
  createdAt: string;
  workingHours: boolean;
  lead: Lead;
  estimate: PriceResult;
  tgStatus: string;
}): (string | number)[] {
  const { lead, estimate } = input;
  const base =
    estimate.baseMin == null
      ? ''
      : estimate.baseMax != null && estimate.baseMax !== estimate.baseMin
        ? `${estimate.baseMin}–${estimate.baseMax}`
        : estimate.baseMin;
  return [
    input.leadId,
    formatTashkent(new Date(input.createdAt), 'dd.MM.yyyy HH:mm'),
    lead.source,
    lead.lang.toUpperCase(),
    label.service(lead.service, 'ru'),
    sheetText(answerLines(lead, 'ru').join('; ')),
    deadlineCell(lead, estimate),
    estimate.urgencyPct,
    base,
    estimate.discountPct,
    typeof totalCell(estimate) === 'number' ? totalCell(estimate) : sheetText(String(totalCell(estimate))),
    typeof prepayCell(estimate) === 'number' ? prepayCell(estimate) : sheetText(String(prepayCell(estimate))),
    sheetText(lead.contact.name),
    sheetPhone(lead.contact.phone),
    sheetText(normalizeTelegram(lead.contact.telegram)),
    sheetText(lead.contact.comment?.trim() ?? ''),
    label.contact(lead.answers.contact_method, 'ru'),
    sheetText(lead.utm?.source ?? ''),
    sheetText(lead.utm?.medium ?? ''),
    sheetText(lead.utm?.campaign ?? ''),
    sheetText(lead.page_url),
    input.workingHours ? 'да' : 'нет',
    SHEET_STATUS.new,
    input.tgStatus === 'done' ? 'ок' : input.tgStatus === 'failed' ? 'ошибка' : '',
  ];
}
