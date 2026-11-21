import { describe, expect, it } from 'vitest';
import { addDaysISO, todayInTashkent } from './dates.js';
import { LeadSchema } from './schema.js';
import type { Lead } from './schema.js';

function lead(patch: Partial<Lead> = {}): Lead {
  const base: Lead = {
    client_request_id: '8c1c7a2e-1d4b-4e5a-9c1f-0a0b0c0d0e0f',
    source: 'quiz',
    lang: 'ru',
    service: 'photo',
    answers: {
      photo_count: '1',
      photo_purpose: 'gift',
      deadline_mode: 'standard',
      contact_method: 'telegram',
    },
    contact: {
      name: 'Дилноза',
      phone: '+998901234567',
      telegram: '@dilnoza',
      comment: '',
    },
    consent: true,
    page_url: 'https://jonlix.uz/',
    started_at: Date.now() - 20_000,
  };
  return {
    ...base,
    ...patch,
    answers: { ...base.answers, ...patch.answers },
    contact: { ...base.contact, ...patch.contact },
  };
}

describe('LeadSchema', () => {
  it('принимает фото-заявку', () => {
    expect(LeadSchema.safeParse(lead()).success).toBe(true);
  });

  it('отклоняет телефон короче 9 цифр', () => {
    const parsed = LeadSchema.safeParse(lead({ contact: { name: 'Али', phone: '+99890123', telegram: '' } }));
    expect(parsed.success).toBe(false);
  });

  it('требует согласие', () => {
    const parsed = LeadSchema.safeParse({ ...lead(), consent: false });
    expect(parsed.success).toBe(false);
  });

  it('для видео нужны повод, вариант и длина', () => {
    const parsed = LeadSchema.safeParse(
      lead({
        service: 'video',
        answers: { deadline_mode: 'standard', contact_method: 'call', video_occasion: 'jubilee' },
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it('принимает видео', () => {
    const parsed = LeadSchema.safeParse(
      lead({
        service: 'video',
        answers: {
          video_occasion: 'jubilee',
          video_variant: 'B',
          video_duration: 30,
          deadline_mode: 'date',
          deadline_date: addDaysISO(todayInTashkent(), 5),
          contact_method: 'telegram',
        },
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('дату сегодня не принимает', () => {
    const parsed = LeadSchema.safeParse(
      lead({
        answers: {
          photo_count: '1',
          photo_purpose: 'personal',
          deadline_mode: 'date',
          deadline_date: todayInTashkent(),
          contact_method: 'call',
        },
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it('короткая форма без ответов квиза проходит', () => {
    const parsed = LeadSchema.safeParse(
      lead({
        source: 'form_footer',
        service: 'landing',
        answers: { deadline_mode: 'standard', contact_method: 'call' },
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('для «другое» нужно описание', () => {
    const parsed = LeadSchema.safeParse(
      lead({
        service: 'other',
        answers: {
          business_type: 'retail',
          business_assets: ['nothing'],
          deadline_mode: 'no_rush',
          contact_method: 'whatsapp',
        },
      }),
    );
    expect(parsed.success).toBe(false);
  });
});
