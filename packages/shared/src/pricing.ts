import {
  PHOTO_COUNT_RANGE,
  PRICES,
  type Branch,
  type DeadlineMode,
  type Lang,
  type PhotoCount,
  type Service,
  type VideoDuration,
  type VideoVariant,
} from './catalog.js';
import { calendarDaysBetween } from './dates.js';

export interface PriceInput {
  service: Service;
  photoCount?: PhotoCount;
  videoVariant?: VideoVariant;
  videoDuration?: VideoDuration;
  deadlineMode: DeadlineMode;
  deadlineDate?: string;
  today: string;
  discount: boolean;
}

export interface PriceResult {
  kind: 'fixed' | 'range' | 'from' | 'individual';
  baseMin: number | null;
  baseMax: number | null;
  urgencyDays: number | null;
  urgencyPct: number;
  discountPct: number;
  totalMin: number | null;
  totalMax: number | null;
  prepaymentMin: number | null;
  prepaymentMax: number | null;
}

export function urgencyPercent(days: number): number {
  const safe = Math.max(1, days);
  if (safe >= 7) return 0;
  return 20 * (7 - safe);
}

/** Целые сумы, округление вверх до 1 000. См. SPEC 4.2. */
export function applyAdjustments(base: number, urgencyPct: number, discountPct: number): number {
  const raw = base * (100 + urgencyPct) * (100 - discountPct);
  return Math.ceil(raw / 10_000_000) * 1000;
}

export function prepaymentOf(total: number): number {
  return Math.ceil(total / 2000) * 1000;
}

function emptyIndividual(discountPct: number): PriceResult {
  return {
    kind: 'individual',
    baseMin: null,
    baseMax: null,
    urgencyDays: null,
    urgencyPct: 0,
    discountPct,
    totalMin: null,
    totalMax: null,
    prepaymentMin: null,
    prepaymentMax: null,
  };
}

export function priceBranch(service: Service): Branch {
  if (service === 'photo' || service === 'animation') return 'photo';
  if (service === 'video') return 'video';
  return 'business';
}

export function calculatePrice(input: PriceInput): PriceResult {
  const discountPct = input.discount ? 10 : 0;
  const branch = priceBranch(input.service);

  let urgencyDays: number | null = null;
  let urgencyPct = 0;
  if (input.deadlineMode === 'date' && input.deadlineDate) {
    urgencyDays = Math.max(1, calendarDaysBetween(input.deadlineDate, input.today));
    if (branch !== 'business') urgencyPct = urgencyPercent(urgencyDays);
  }

  if (branch === 'business') {
    const result = emptyIndividual(discountPct);
    result.urgencyDays = urgencyDays;
    return result;
  }

  let baseMin: number | null = null;
  let baseMax: number | null = null;
  let kind: PriceResult['kind'] = 'fixed';

  if (input.service === 'photo' || input.service === 'animation') {
    if (!input.photoCount) return { ...emptyIndividual(discountPct), urgencyDays, urgencyPct };
    const unit = PRICES[input.service];
    const [minCount, maxCount] = PHOTO_COUNT_RANGE[input.photoCount];
    baseMin = unit * minCount;
    if (maxCount == null) {
      kind = 'from';
      baseMax = null;
    } else if (minCount === maxCount) {
      kind = 'fixed';
      baseMax = baseMin;
    } else {
      kind = 'range';
      baseMax = unit * maxCount;
    }
  } else {
    const variant = input.videoVariant;
    const duration = input.videoDuration;
    if (!variant || variant === 'unknown' || duration == null || duration === 'unknown') {
      return { ...emptyIndividual(discountPct), urgencyDays, urgencyPct };
    }
    const unit = variant === 'A' ? PRICES.videoA : PRICES.videoB;
    baseMin = unit * (duration / 15);
    baseMax = baseMin;
    kind = 'fixed';
  }

  const totalMin = baseMin == null ? null : applyAdjustments(baseMin, urgencyPct, discountPct);
  const totalMax = baseMax == null ? null : applyAdjustments(baseMax, urgencyPct, discountPct);

  return {
    kind,
    baseMin,
    baseMax,
    urgencyDays,
    urgencyPct,
    discountPct,
    totalMin,
    totalMax,
    prepaymentMin: totalMin == null ? null : prepaymentOf(totalMin),
    prepaymentMax: totalMax == null ? null : prepaymentOf(totalMax),
  };
}
