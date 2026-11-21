import { describe, expect, it } from 'vitest';
import { escapeHtml, maskPhone, sheetPhone, sheetText } from './escape.js';

describe('escape', () => {
  it('экранирует HTML', () => {
    expect(escapeHtml(`<b>А&Б</b>`)).toBe('&lt;b&gt;А&amp;Б&lt;/b&gt;');
  });

  it('защищает формулы и телефон', () => {
    expect(sheetText('=SUM(A1)')).toBe(`'=SUM(A1)`);
    expect(sheetText('+998')).toBe(`'+998`);
    expect(sheetText('Дилноза')).toBe('Дилноза');
    expect(sheetPhone('+998901234567')).toBe(`'+998901234567`);
  });

  it('маскирует телефон', () => {
    expect(maskPhone('+998901234567')).toBe('+99890***4567');
  });
});
