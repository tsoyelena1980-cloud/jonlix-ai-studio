import type { Lang } from './catalog.js';
import { label } from './labels.js';
import { formatNumber } from './money.js';
import { applyAdjustments, prepaymentOf, type PriceInput, type PriceResult } from './pricing.js';

export interface ReceiptRow {
  label: string;
  value: string;
}

export interface ReceiptView {
  showFigures: boolean;
  rows: ReceiptRow[];
  totalLabel: string;
  totalValue: string;
  prepayLabel: string;
  prepayValue: string;
}

const copy = {
  photo: { ru: 'Фото', uz: 'Surat', en: 'Photo' },
  animation: { ru: 'Оживление', uz: 'Jonlantirish', en: 'Animation' },
  videoA: { ru: 'Видео по сценарию', uz: 'Ssenariy boʻyicha video', en: 'Video from your script' },
  videoB: { ru: 'Видео под ключ', uz: 'Toʻliq video', en: 'Video, done for you' },
  urgency: { ru: 'Срочность', uz: 'Shoshilinchlik', en: 'Rush' },
  days: { ru: 'дн.', uz: 'kun', en: 'days' },
  discount: { ru: 'Скидка за тест', uz: 'Test uchun chegirma', en: 'Quiz discount' },
  total: { ru: 'Итого', uz: 'Jami', en: 'Total' },
  prepay: { ru: 'Предоплата 50%', uz: 'Oldindan toʻlov 50%', en: '50% prepayment' },
  from: { ru: 'от', uz: 'dan', en: 'from' },
} as const;

function word<K extends keyof typeof copy>(key: K, lang: Lang): string {
  return copy[key][lang];
}

function span(min: number, max: number | null, lang: Lang, from = false): string {
  if (from || max == null) return `${word('from', lang)} ${formatNumber(min, lang)}`;
  if (min === max) return formatNumber(min, lang);
  return `${formatNumber(min, lang)} – ${formatNumber(max, lang)}`;
}

function split(base: number, urgencyPct: number, discountPct: number) {
  const gross = Math.round((base * (100 + urgencyPct)) / 100);
  const total = applyAdjustments(base, urgencyPct, discountPct);
  return {
    urgencyAdd: Math.max(0, gross - base),
    discount: Math.max(0, gross - total),
    total,
    prepay: prepaymentOf(total),
  };
}

function title(input: PriceInput, lang: Lang): string {
  if (input.service === 'photo' || input.service === 'animation') {
    const name = input.service === 'photo' ? word('photo', lang) : word('animation', lang);
    return input.photoCount ? `${name}, ${label.photoCount(input.photoCount, lang)}` : name;
  }
  if (input.service === 'video') {
    const name = input.videoVariant === 'A' ? word('videoA', lang) : word('videoB', lang);
    if (input.videoDuration && input.videoDuration !== 'unknown') {
      const unit = lang === 'en' ? 'sec' : lang === 'uz' ? 'soniya' : 'сек';
      return `${name}, ${input.videoDuration} ${unit}`;
    }
    return name;
  }
  return label.service(input.service, lang);
}

function mapEnds(
  result: PriceResult,
  pick: (base: number) => number,
): { min: number; max: number | null } | null {
  if (result.baseMin == null) return null;
  const min = pick(result.baseMin);
  const max = result.baseMax == null ? null : pick(result.baseMax);
  return { min, max };
}

export function buildReceipt(input: PriceInput, result: PriceResult, lang: Lang): ReceiptView {
  const totalLabel = word('total', lang);
  const prepayLabel = word('prepay', lang);
  if (result.kind === 'individual' || result.baseMin == null || result.totalMin == null) {
    return { showFigures: false, rows: [], totalLabel, totalValue: '', prepayLabel, prepayValue: '' };
  }

  const from = result.kind === 'from';
  const rows: ReceiptRow[] = [
    {
      label: title(input, lang),
      value: span(result.baseMin, from ? null : result.baseMax, lang, from),
    },
  ];

  if (result.urgencyPct > 0) {
    const urgency = mapEnds(result, (base) => split(base, result.urgencyPct, 0).urgencyAdd);
    if (urgency) {
      rows.push({
        label: `${word('urgency', lang)}, ${result.urgencyDays} ${word('days', lang)} (+${result.urgencyPct}%)`,
        value: from ? `+${formatNumber(urgency.min, lang)}` : `+${span(urgency.min, urgency.max, lang)}`,
      });
    }
  }

  if (result.discountPct > 0) {
    const discount = mapEnds(result, (base) => split(base, result.urgencyPct, result.discountPct).discount);
    if (discount && discount.min > 0) {
      const value = from || discount.max == null ? formatNumber(discount.min, lang) : span(discount.min, discount.max, lang);
      rows.push({
        label: `${word('discount', lang)} (−${result.discountPct}%)`,
        value: `−${value}`,
      });
    }
  }

  return {
    showFigures: true,
    rows,
    totalLabel,
    totalValue: span(result.totalMin, from ? null : result.totalMax, lang, from),
    prepayLabel,
    prepayValue:
      result.prepaymentMin == null
        ? ''
        : span(result.prepaymentMin, from ? null : result.prepaymentMax, lang, from),
  };
}
