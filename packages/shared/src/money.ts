import type { Lang } from './catalog.js';

export function formatNumber(amount: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace(/[\u00A0\u202F]/g, ' ');
}

export function currencySuffix(lang: Lang): string {
  if (lang === 'en') return 'UZS';
  if (lang === 'uz') return 'soʻm';
  return 'сум';
}

export function formatMoney(amount: number, lang: Lang): string {
  return `${formatNumber(amount, lang)} ${currencySuffix(lang)}`;
}

export function formatSignedMoney(amount: number, lang: Lang): string {
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
  return `${sign}${formatNumber(Math.abs(amount), lang)}`;
}
