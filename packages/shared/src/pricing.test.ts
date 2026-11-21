import { describe, expect, it } from 'vitest';
import { calculatePrice, type PriceInput } from './pricing.js';

function price(partial: Partial<PriceInput> & Pick<PriceInput, 'service'>): ReturnType<typeof calculatePrice> {
  return calculatePrice({
    deadlineMode: 'standard',
    today: '2026-11-21',
    discount: true,
    ...partial,
  });
}

describe('calculatePrice', () => {
  it('1. одно фото, стандарт, скидка', () => {
    const result = price({ service: 'photo', photoCount: '1' });
    expect(result.kind).toBe('fixed');
    expect(result.totalMin).toBe(45_000);
    expect(result.prepaymentMin).toBe(23_000);
    expect(result.urgencyPct).toBe(0);
    expect(result.discountPct).toBe(10);
  });

  it('2. оживление, 2–3, вилка', () => {
    const result = price({ service: 'animation', photoCount: '2-3' });
    expect(result.kind).toBe('range');
    expect(result.totalMin).toBe(90_000);
    expect(result.totalMax).toBe(135_000);
  });

  it('3. больше 5 фото', () => {
    const result = price({ service: 'photo', photoCount: '6+' });
    expect(result.kind).toBe('from');
    expect(result.totalMin).toBe(270_000);
    expect(result.totalMax).toBeNull();
  });

  it('4. видео А, 15 сек, без скидки', () => {
    const result = price({
      service: 'video',
      videoVariant: 'A',
      videoDuration: 15,
      discount: false,
    });
    expect(result.totalMin).toBe(100_000);
    expect(result.discountPct).toBe(0);
  });

  it('5. видео Б, 30 сек, через 5 дней, скидка', () => {
    const result = price({
      service: 'video',
      videoVariant: 'B',
      videoDuration: 30,
      deadlineMode: 'date',
      deadlineDate: '2026-11-26',
    });
    expect(result.urgencyDays).toBe(5);
    expect(result.urgencyPct).toBe(40);
    expect(result.totalMin).toBe(630_000);
    expect(result.prepaymentMin).toBe(315_000);
  });

  it('6. видео Б, 60 сек, через 1 день', () => {
    const result = price({
      service: 'video',
      videoVariant: 'B',
      videoDuration: 60,
      deadlineMode: 'date',
      deadlineDate: '2026-11-22',
    });
    expect(result.urgencyPct).toBe(120);
    expect(result.totalMin).toBe(1_980_000);
  });

  it('7. дата через 10 дней — надбавка 0', () => {
    const result = price({
      service: 'video',
      videoVariant: 'B',
      videoDuration: 60,
      deadlineMode: 'date',
      deadlineDate: '2026-12-01',
      discount: false,
    });
    expect(result.urgencyDays).toBe(10);
    expect(result.urgencyPct).toBe(0);
    expect(result.totalMin).toBe(1_000_000);
  });

  it('8. неизвестный вариант видео', () => {
    const result = price({ service: 'video', videoVariant: 'unknown', videoDuration: 30 });
    expect(result.kind).toBe('individual');
    expect(result.totalMin).toBeNull();
  });

  it('9. лендинг срочно — без процента надбавки', () => {
    const result = price({
      service: 'landing',
      deadlineMode: 'date',
      deadlineDate: '2026-11-23',
    });
    expect(result.kind).toBe('individual');
    expect(result.urgencyPct).toBe(0);
    expect(result.urgencyDays).toBe(2);
    expect(result.discountPct).toBe(10);
  });

  it('10. дата сегодня приводится к 1 дню и +120%', () => {
    const result = price({
      service: 'video',
      videoVariant: 'B',
      videoDuration: 15,
      deadlineMode: 'date',
      deadlineDate: '2026-11-21',
      discount: false,
    });
    expect(result.urgencyDays).toBe(1);
    expect(result.urgencyPct).toBe(120);
    expect(result.totalMin).toBe(550_000);
  });

  it('11. не спешу', () => {
    const result = price({ service: 'photo', photoCount: '1', deadlineMode: 'no_rush' });
    expect(result.totalMin).toBe(45_000);
    expect(result.urgencyPct).toBe(0);
  });
});
