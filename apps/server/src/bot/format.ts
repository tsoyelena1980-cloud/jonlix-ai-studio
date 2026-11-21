import {
  SHEET_STATUS,
  answerLines,
  branchOf,
  buildReceipt,
  formatNumber,
  formatTashkent,
  label,
  type Lead,
  type LeadStatus,
  type PriceResult,
} from '@jonlix/shared';
import { displayPhone, escapeHtml, normalizeTelegram } from '../lib/escape.js';

export interface CardInput {
  leadId: string;
  createdAt: string;
  workingHours: boolean;
  urgent: boolean;
  lead: Lead;
  estimate: PriceResult;
  status?: LeadStatus;
  statusAt?: string;
}

const SOURCE: Record<Lead['source'], string> = {
  quiz: 'квиз',
  form_business: 'форма «для бизнеса»',
  form_footer: 'форма внизу страницы',
};

const SERVICE_MARK: Record<Lead['service'], string> = {
  photo: '📸',
  animation: '✨',
  video: '🎬',
  landing: '🌐',
  post_generator: '📝',
  accounting: '📊',
  other: '💡',
};

function money(value: number): string {
  return formatNumber(value, 'ru');
}

function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function calculation(card: CardInput): string[] {
  const { estimate, lead } = card;
  const lines: string[] = ['', '💰 <b>Расчёт:</b>'];
  if (estimate.kind === 'individual' || estimate.totalMin == null) {
    lines.push(
      lead.source === 'quiz'
        ? 'Стоимость: индивидуальный расчёт (скидка 10% закреплена)'
        : 'Стоимость: индивидуальный расчёт',
    );
    return lines;
  }
  const receipt = buildReceipt(
    {
      service: lead.service,
      photoCount: lead.answers.photo_count,
      videoVariant: lead.answers.video_variant,
      videoDuration: lead.answers.video_duration,
      deadlineMode: lead.answers.deadline_mode,
      deadlineDate: lead.answers.deadline_date,
      today: card.createdAt.slice(0, 10),
      discount: lead.source === 'quiz',
    },
    estimate,
    'ru',
  );
  if (estimate.kind === 'fixed' && estimate.baseMin != null) {
    const bits = [`База ${money(estimate.baseMin)}`];
    const urgency = receipt.rows.find((row) => row.label.startsWith('Срочность'));
    const discount = receipt.rows.find((row) => row.label.startsWith('Скидка'));
    if (urgency) bits.push(`срочность +${urgency.value.replace(/^\+/, '')}`);
    if (discount) bits.push(`скидка ${estimate.discountPct}% −${discount.value.replace(/^−/, '')}`);
    lines.push(bits.join(' → '));
    lines.push(`<b>Итого: ${money(estimate.totalMin)} сум</b> · Предоплата 50%: ${money(estimate.prepaymentMin ?? 0)} сум`);
    return lines;
  }
  if (estimate.kind === 'range') {
    lines.push(`<b>Итого: ${money(estimate.totalMin)} – ${money(estimate.totalMax ?? estimate.totalMin)} сум</b>`);
    return lines;
  }
  lines.push(`<b>Итого: от ${money(estimate.totalMin)} сум</b>`);
  return lines;
}

export function clientChatUrl(telegram: string | undefined): string | undefined {
  const username = normalizeTelegram(telegram);
  if (username) return `https://t.me/${username.slice(1)}`;
  return undefined;
}

export function formatLeadMessage(card: CardInput): string {
  const { lead } = card;
  const utm = [lead.utm?.source, lead.utm?.campaign].filter(Boolean).join(' / ');
  const lines = [
    `🆕 <b>Новая заявка #${escapeHtml(card.leadId)}</b>`,
    `📍 Источник: ${SOURCE[lead.source]}${utm ? ` · ${escapeHtml(utm)}` : ''}`,
  ];
  if (lead.lang !== 'ru') {
    const hint = lead.lang === 'uz' ? 'общаться на узбекском' : 'reply in English';
    lines.push(`🌐 Язык клиента: ${lead.lang.toUpperCase()} — ${hint}`);
  }
  lines.push('', `${SERVICE_MARK[lead.service]} <b>Услуга:</b> ${escapeHtml(label.service(lead.service, 'ru'))}`);
  for (const line of answerLines(lead, 'ru')) lines.push(`• ${escapeHtml(line)}`);

  if (card.estimate.urgencyPct > 0 && lead.answers.deadline_date) {
    lines.push(
      `⚡ <b>Срочно:</b> к ${ruDate(lead.answers.deadline_date)} (${card.estimate.urgencyDays} дн., +${card.estimate.urgencyPct}%)`,
    );
  } else if (branchOf(lead.service) === 'business' && card.urgent && lead.answers.deadline_date) {
    lines.push(`⚡ <b>Нужно срочно:</b> к ${ruDate(lead.answers.deadline_date)} (расчёт индивидуально)`);
  }

  lines.push(...calculation(card));
  lines.push('', `👤 ${escapeHtml(lead.contact.name)}`);
  lines.push(`📞 <a href="tel:${lead.contact.phone}">${escapeHtml(displayPhone(lead.contact.phone))}</a>`);
  const username = normalizeTelegram(lead.contact.telegram);
  if (username) {
    lines.push(`✈️ <a href="https://t.me/${encodeURIComponent(username.slice(1))}">${escapeHtml(username)}</a>`);
  } else if (lead.contact.telegram_id && /^\d+$/.test(lead.contact.telegram_id)) {
    lines.push(`✈️ Написать клиенту: tg://user?id=${lead.contact.telegram_id}`);
  }
  if (lead.contact.comment?.trim()) lines.push(`💬 «${escapeHtml(lead.contact.comment.trim())}»`);
  lines.push(`Связь: ${escapeHtml(label.contact(lead.answers.contact_method, 'ru'))}`);
  if (lead.answers.contact_method === 'whatsapp') {
    lines.push(`WhatsApp: https://wa.me/${lead.contact.phone.replace('+', '')}`);
  }
  const created = new Date(card.createdAt);
  lines.push('', `🕒 ${formatTashkent(created, 'dd.MM.yyyy HH:mm')}`);
  if (card.status && card.status !== 'new') {
    const when = card.statusAt ? formatTashkent(new Date(card.statusAt), 'HH:mm') : '';
    lines.push(`📌 Статус: ${SHEET_STATUS[card.status] ?? card.status}${when ? ` · ${when}` : ''}`);
  }
  if (!card.workingHours) lines.push('🌙 Получена вне рабочего времени — ответить утром');
  return lines.join('\n');
}
