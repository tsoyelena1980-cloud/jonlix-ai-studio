export const PRICES = {
  photo: 50_000,
  animation: 50_000,
  videoA: 100_000,
  videoB: 250_000,
} as const;

export const STANDARD_DAYS = 7;
export const URGENCY_PCT_PER_DAY = 20;
export const QUIZ_DISCOUNT_PCT = 10;
export const PREPAYMENT_PCT = 50;

export type Service =
  | 'photo'
  | 'animation'
  | 'video'
  | 'landing'
  | 'post_generator'
  | 'accounting'
  | 'other';

export type Branch = 'photo' | 'video' | 'business';

export const SERVICE_BRANCH: Record<Service, Branch> = {
  photo: 'photo',
  animation: 'photo',
  video: 'video',
  landing: 'business',
  post_generator: 'business',
  accounting: 'business',
  other: 'business',
};

export type PhotoCount = '1' | '2-3' | '4-5' | '6+';

export const PHOTO_COUNT_RANGE: Record<PhotoCount, [number, number | null]> = {
  '1': [1, 1],
  '2-3': [2, 3],
  '4-5': [4, 5],
  '6+': [6, null],
};

export type PhotoPurpose = 'personal' | 'gift' | 'archive' | 'business';
export type VideoOccasion = 'love_story' | 'birthday' | 'jubilee' | 'time_machine' | 'other';
export type VideoVariant = 'A' | 'B' | 'unknown';
export type VideoDuration = 15 | 30 | 45 | 60 | 'unknown';
export type BusinessType = 'retail' | 'services' | 'food' | 'production' | 'other';
export type BusinessAsset = 'site' | 'social' | 'spreadsheet' | 'nothing';
export type DeadlineMode = 'standard' | 'date' | 'no_rush';
export type ContactMethod = 'telegram' | 'call' | 'whatsapp';
export type Lang = 'ru' | 'uz' | 'en';
export type LeadSource = 'quiz' | 'form_business' | 'form_footer';
export type LeadStatus =
  | 'new'
  | 'in_work'
  | 'no_answer'
  | 'prepaid'
  | 'revision'
  | 'done'
  | 'rejected';

export const SERVICES: Service[] = [
  'photo',
  'animation',
  'video',
  'landing',
  'post_generator',
  'accounting',
  'other',
];

export function branchOf(service: Service): Branch {
  return SERVICE_BRANCH[service];
}
