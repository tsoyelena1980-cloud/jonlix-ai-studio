import { branchOf, type Service } from '@jonlix/shared';

export type StepId =
  | 'service'
  | 'photo_count'
  | 'photo_purpose'
  | 'video_occasion'
  | 'video_variant'
  | 'video_duration'
  | 'business_type'
  | 'business_assets'
  | 'deadline'
  | 'contact_method'
  | 'contacts';

export interface QuizAnswers {
  photo_count?: '1' | '2-3' | '4-5' | '6+';
  photo_purpose?: 'personal' | 'gift' | 'archive' | 'business';
  video_occasion?: 'love_story' | 'birthday' | 'jubilee' | 'time_machine' | 'other';
  video_occasion_other?: string;
  video_variant?: 'A' | 'B' | 'unknown';
  video_duration?: 15 | 30 | 45 | 60 | 'unknown';
  business_type?: 'retail' | 'services' | 'food' | 'production' | 'other';
  business_type_other?: string;
  business_assets?: Array<'site' | 'social' | 'spreadsheet' | 'nothing'>;
  other_idea?: string;
  deadline_mode?: 'standard' | 'date' | 'no_rush';
  deadline_date?: string;
  contact_method?: 'telegram' | 'call' | 'whatsapp';
}

export interface QuizContact {
  name?: string;
  phone?: string;
  telegram?: string;
  comment?: string;
  consent?: boolean;
}

export interface QuizState {
  version: 1;
  stepId: StepId;
  history: StepId[];
  service?: Service;
  answers: QuizAnswers;
  contact: QuizContact;
  startedAt: number;
  clientRequestId: string;
  status: 'in_progress' | 'submitting' | 'success' | 'error';
  billReady?: boolean;
}

const PHOTO: StepId[] = ['service', 'photo_count', 'photo_purpose', 'deadline', 'contact_method', 'contacts'];
const VIDEO: StepId[] = ['service', 'video_occasion', 'video_variant', 'video_duration', 'deadline', 'contacts'];
const BUSINESS: StepId[] = ['service', 'business_type', 'business_assets', 'deadline', 'contact_method', 'contacts'];

export function stepOrder(service?: Service): StepId[] {
  if (!service) return PHOTO;
  const branch = branchOf(service);
  if (branch === 'video') return VIDEO;
  if (branch === 'business') return BUSINESS;
  return PHOTO;
}

export function freshState(id = crypto.randomUUID(), startedAt = Date.now()): QuizState {
  return {
    version: 1,
    stepId: 'service',
    history: [],
    answers: {},
    contact: {},
    startedAt,
    clientRequestId: id,
    status: 'in_progress',
  };
}

export function questionIndex(state: QuizState): number {
  const order = stepOrder(state.service);
  const index = order.indexOf(state.stepId);
  return index < 0 ? 1 : index + 1;
}

function clearForeign(answers: QuizAnswers, service: Service): QuizAnswers {
  const branch = branchOf(service);
  const next: QuizAnswers = {
    deadline_mode: answers.deadline_mode,
    deadline_date: answers.deadline_date,
    contact_method: answers.contact_method,
  };
  if (branch === 'photo') {
    next.photo_count = answers.photo_count;
    next.photo_purpose = answers.photo_purpose;
  } else if (branch === 'video') {
    next.video_occasion = answers.video_occasion;
    next.video_occasion_other = answers.video_occasion_other;
    next.video_variant = answers.video_variant;
    next.video_duration = answers.video_duration;
  } else {
    next.business_type = answers.business_type;
    next.business_type_other = answers.business_type_other;
    next.business_assets = answers.business_assets;
    if (service === 'other') next.other_idea = answers.other_idea;
  }
  return next;
}

export function selectService(state: QuizState, service: Service): QuizState {
  return {
    ...state,
    service,
    answers: clearForeign(state.answers, service),
    status: 'in_progress',
  };
}

export function openAtService(state: QuizState, service: Service): QuizState {
  const next = selectService(state, service);
  const order = stepOrder(service);
  return { ...next, stepId: order[1] ?? 'service', history: ['service'] };
}

export function patchAnswers(state: QuizState, patch: Partial<QuizAnswers>): QuizState {
  return { ...state, answers: { ...state.answers, ...patch }, status: 'in_progress' };
}

export function patchContact(state: QuizState, patch: Partial<QuizContact>): QuizState {
  return { ...state, contact: { ...state.contact, ...patch } };
}

export function advance(state: QuizState): QuizState {
  const order = stepOrder(state.service);
  const index = order.indexOf(state.stepId);
  const next = order[index + 1];
  if (!next) return state;
  return { ...state, history: [...state.history, state.stepId], stepId: next };
}

export function back(state: QuizState): QuizState {
  if (!state.history.length) return state;
  const history = state.history.slice(0, -1);
  const stepId = state.history[state.history.length - 1] ?? 'service';
  return { ...state, history, stepId, status: 'in_progress', billReady: false };
}

export function needsExtraText(state: QuizState): boolean {
  if (state.stepId === 'service' && state.service === 'other' && !state.answers.other_idea?.trim()) return true;
  if (state.stepId === 'video_occasion' && state.answers.video_occasion === 'other' && !state.answers.video_occasion_other?.trim()) return true;
  if (state.stepId === 'business_type' && state.answers.business_type === 'other' && !state.answers.business_type_other?.trim()) return true;
  if (state.stepId === 'deadline' && state.answers.deadline_mode === 'date' && !state.answers.deadline_date) return true;
  if (state.stepId === 'business_assets' && !state.answers.business_assets?.length) return true;
  return false;
}
