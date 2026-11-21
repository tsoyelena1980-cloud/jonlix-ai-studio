import { describe, expect, it } from 'vitest';
import type { Lead, PriceResult } from '@jonlix/shared';
import { formatLeadMessage } from './format.js';

const estimate: PriceResult = {
  kind: 'fixed',
  baseMin: 500_000,
  baseMax: 500_000,
  urgencyDays: 5,
  urgencyPct: 40,
  discountPct: 10,
  totalMin: 630_000,
  totalMax: 630_000,
  prepaymentMin: 315_000,
  prepaymentMax: 315_000,
};

function videoLead(): Lead {
  return {
    client_request_id: '8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f',
    source: 'quiz',
    lang: 'uz',
    service: 'video',
    answers: {
      video_occasion: 'jubilee',
      video_variant: 'B',
      video_duration: 30,
      deadline_mode: 'date',
      deadline_date: '2026-11-26',
      contact_method: 'telegram',
    },
    contact: {
      name: 'Дилноза <b>',
      phone: '+998901234567',
      telegram: 'dilnoza_t',
      comment: 'Юбилей мамы',
    },
    consent: true,
    utm: { source: 'instagram', campaign: 'video_nov' },
    page_url: 'https://jonlix.uz/?utm_source=instagram',
    started_at: 1,
  };
}

describe('formatLeadMessage', () => {
  it('собирает карточку видео и экранирует имя', () => {
    const text = formatLeadMessage({
      leadId: 'JX-20261121-0007',
      createdAt: '2026-11-21T15:12:00+05:00',
      workingHours: true,
      urgent: true,
      lead: videoLead(),
      estimate,
    });
    expect(text).toContain('JX-20261121-0007');
    expect(text).toContain('instagram / video_nov');
    expect(text).toContain('UZ — общаться на узбекском');
    expect(text).toContain('630 000 сум');
    expect(text).toContain('315 000 сум');
    expect(text).toContain('Дилноза &lt;b&gt;');
    expect(text).toContain('https://t.me/dilnoza_t');
    expect(text).not.toContain('вне рабочего времени');
  });

  it('помечает ночную заявку и не показывает пустой telegram', () => {
    const lead = videoLead();
    lead.lang = 'ru';
    lead.contact.telegram = '';
    lead.contact.comment = '';
    const text = formatLeadMessage({
      leadId: 'JX-20261121-0008',
      createdAt: '2026-11-21T22:05:00+05:00',
      workingHours: false,
      urgent: true,
      lead,
      estimate,
    });
    expect(text).toContain('🌙 Получена вне рабочего времени');
    expect(text).not.toContain('Язык клиента');
    expect(text).not.toContain('t.me/');
    expect(text).not.toContain('💬');
  });

  it('для бизнеса пишет про индивидуальный срочный расчёт', () => {
    const lead = videoLead();
    lead.service = 'landing';
    lead.lang = 'ru';
    lead.answers = {
      business_type: 'retail',
      business_assets: ['nothing'],
      deadline_mode: 'date',
      deadline_date: '2026-11-23',
      contact_method: 'call',
    };
    const text = formatLeadMessage({
      leadId: 'JX-20261121-0009',
      createdAt: '2026-11-21T12:00:00+05:00',
      workingHours: true,
      urgent: true,
      lead,
      estimate: { ...estimate, kind: 'individual', baseMin: null, baseMax: null, totalMin: null, totalMax: null, prepaymentMin: null, prepaymentMax: null, urgencyPct: 0, urgencyDays: 2 },
    });
    expect(text).toContain('расчёт индивидуально');
    expect(text).toContain('скидка 10% закреплена');
  });
});
