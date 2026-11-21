import type { Lang } from './catalog.js';
import { label } from './labels.js';
import type { Lead } from './schema.js';

export function answerLines(lead: Lead, lang: Lang): string[] {
  const a = lead.answers;
  const lines: string[] = [];
  if (a.photo_count) lines.push(label.photoCount(a.photo_count, lang));
  if (a.photo_purpose) lines.push(label.photoPurpose(a.photo_purpose, lang));
  if (a.video_occasion) {
    lines.push(
      a.video_occasion === 'other' && a.video_occasion_other?.trim()
        ? `${label.occasion(a.video_occasion, lang)}: ${a.video_occasion_other.trim()}`
        : label.occasion(a.video_occasion, lang),
    );
  }
  if (a.video_variant) lines.push(label.variant(a.video_variant, lang));
  if (a.video_duration != null) lines.push(label.duration(a.video_duration, lang));
  if (a.business_type) {
    lines.push(
      a.business_type === 'other' && a.business_type_other?.trim()
        ? `${label.businessType(a.business_type, lang)}: ${a.business_type_other.trim()}`
        : label.businessType(a.business_type, lang),
    );
  }
  if (a.business_assets?.length) lines.push(a.business_assets.map((item) => label.asset(item, lang)).join(', '));
  if (a.other_idea?.trim()) lines.push(a.other_idea.trim());
  return lines;
}
