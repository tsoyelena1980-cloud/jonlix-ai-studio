import { z } from 'zod';
import { SERVICE_BRANCH, type Service } from './catalog.js';
import { addDaysISO, isIsoDate, todayInTashkent } from './dates.js';

const phone = z.string().regex(/^\+998\d{9}$/);

export const LeadSchema = z
  .object({
    client_request_id: z.string().uuid(),
    source: z.enum(['quiz', 'form_business', 'form_footer']),
    lang: z.enum(['ru', 'uz', 'en']),
    service: z.enum(['photo', 'animation', 'video', 'landing', 'post_generator', 'accounting', 'other']),
    answers: z.object({
      photo_count: z.enum(['1', '2-3', '4-5', '6+']).optional(),
      photo_purpose: z.enum(['personal', 'gift', 'archive', 'business']).optional(),
      video_occasion: z.enum(['love_story', 'birthday', 'jubilee', 'time_machine', 'other']).optional(),
      video_occasion_other: z.string().max(200).optional(),
      video_variant: z.enum(['A', 'B', 'unknown']).optional(),
      video_duration: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal('unknown')]).optional(),
      business_type: z.enum(['retail', 'services', 'food', 'production', 'other']).optional(),
      business_type_other: z.string().max(200).optional(),
      business_assets: z.array(z.enum(['site', 'social', 'spreadsheet', 'nothing'])).max(4).optional(),
      other_idea: z.string().max(500).optional(),
      deadline_mode: z.enum(['standard', 'date', 'no_rush']),
      deadline_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      contact_method: z.enum(['telegram', 'call', 'whatsapp']),
    }),
    contact: z.object({
      name: z.string().trim().min(2).max(60),
      phone,
      telegram: z.string().max(33).optional().or(z.literal('')),
      telegram_id: z.string().regex(/^\d{5,20}$/).optional().or(z.literal('')),
      comment: z.string().max(500).optional().or(z.literal('')),
    }),
    consent: z.literal(true),
    estimate_client: z
      .object({
        totalMin: z.number().nullable(),
        totalMax: z.number().nullable(),
      })
      .optional(),
    utm: z
      .object({
        source: z.string().max(100).optional(),
        medium: z.string().max(100).optional(),
        campaign: z.string().max(100).optional(),
        content: z.string().max(100).optional(),
        term: z.string().max(100).optional(),
      })
      .optional(),
    page_url: z.string().url().max(500),
    website: z.string().max(200).optional(),
    started_at: z.number().int(),
  })
  .superRefine((lead, ctx) => {
    const tg = lead.contact.telegram?.trim() ?? '';
    if (tg && !/^@?[A-Za-z0-9_]{5,32}$/.test(tg)) {
      ctx.addIssue({ code: 'custom', path: ['contact', 'telegram'], message: 'telegram' });
    }

    const today = todayInTashkent();
    if (lead.answers.deadline_mode === 'date') {
      const date = lead.answers.deadline_date;
      if (!date || !isIsoDate(date)) {
        ctx.addIssue({ code: 'custom', path: ['answers', 'deadline_date'], message: 'required' });
      } else {
        const min = addDaysISO(today, 1);
        const max = addDaysISO(today, 365);
        if (date < min || date > max) {
          ctx.addIssue({ code: 'custom', path: ['answers', 'deadline_date'], message: 'range' });
        }
      }
    }

    if (lead.source !== 'quiz') return;

    const branch = SERVICE_BRANCH[lead.service as Service];
    const a = lead.answers;
    const need = (path: (string | number)[], ok: boolean) => {
      if (!ok) ctx.addIssue({ code: 'custom', path, message: 'required' });
    };

    if (branch === 'photo') {
      need(['answers', 'photo_count'], Boolean(a.photo_count));
      need(['answers', 'photo_purpose'], Boolean(a.photo_purpose));
    } else if (branch === 'video') {
      need(['answers', 'video_occasion'], Boolean(a.video_occasion));
      need(['answers', 'video_variant'], Boolean(a.video_variant));
      need(['answers', 'video_duration'], a.video_duration != null);
      if (a.video_occasion === 'other') need(['answers', 'video_occasion_other'], Boolean(a.video_occasion_other?.trim()));
    } else {
      need(['answers', 'business_type'], Boolean(a.business_type));
      need(['answers', 'business_assets'], Boolean(a.business_assets && a.business_assets.length > 0));
      if (a.business_type === 'other') need(['answers', 'business_type_other'], Boolean(a.business_type_other?.trim()));
      if (lead.service === 'other') need(['answers', 'other_idea'], Boolean(a.other_idea?.trim()));
    }
  });

export type Lead = z.infer<typeof LeadSchema>;

export function zodErrors(error: z.ZodError): { path: string; code: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code === 'custom' ? String(issue.message) : issue.code,
  }));
}
