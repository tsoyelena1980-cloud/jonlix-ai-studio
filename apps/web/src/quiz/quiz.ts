import {
  LeadSchema,
  addDaysISO,
  branchOf,
  buildReceipt,
  calculatePrice,
  calendarDaysBetween,
  currencySuffix,
  formatNumber,
  todayInTashkent,
  urgencyPercent,
  type Service,
} from '@jonlix/shared';
import en from '../i18n/en.json' with { type: 'json' };
import ru from '../i18n/ru.json' with { type: 'json' };
import uz from '../i18n/uz.json' with { type: 'json' };
import { postLead, type LeadResponse } from '../lib/api.js';
import { track } from '../lib/analytics.js';
import { isCompletePhone, formatPhoneInput } from '../lib/phone.js';
import { captureUtm } from '../lib/utm.js';
import {
  advance,
  back,
  freshState,
  needsExtraText,
  openAtService,
  patchAnswers,
  patchContact,
  questionIndex,
  selectService,
  stepOrder,
  type QuizAnswers,
  type QuizState,
  type StepId,
} from './machine.js';
import { flag, loadState, saveState } from './storage.js';
import { isTelegramApp, openManagerChat, telegramProfile } from '../lib/telegram.js';

const DICTS = { ru, uz, en };

type Tree = { [key: string]: string | Tree };

function t(path: string, vars: Record<string, string | number> = {}): string {
  const lang = window.__JONLIX.lang;
  let cursor: string | Tree = DICTS[lang] as Tree;
  for (const part of path.split('.')) {
    if (typeof cursor !== 'object' || !(part in cursor)) return path;
    cursor = cursor[part] ?? path;
  }
  const raw = typeof cursor === 'string' ? cursor : path;
  return raw.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

let state: QuizState = loadState() ?? freshState();
const profile = telegramProfile();
if (profile.username && !state.contact.telegram) {
  state = patchContact(state, { telegram: profile.username });
  saveState(state);
}
let mode: 'closed' | 'peek' | 'full' = 'closed';
let last: LeadResponse | null = null;
let timer = 0;
let trigger: 'auto' | 'cta' | 'card' = 'cta';

export function mountQuiz(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const pathQuiz = /\/quiz\/?$/.test(location.pathname);
  const forceQuiz = pathQuiz || params.get('quiz') === '1' || window.Telegram?.WebApp?.initDataUnsafe?.start_param === 'quiz';
  const reopen = sessionStorage.getItem('jx_quiz_reopen') === '1';
  sessionStorage.removeItem('jx_quiz_reopen');
  document.querySelectorAll<HTMLElement>('[data-open-quiz]').forEach((node) => {
    node.addEventListener('click', () => open('cta'));
  });
  document.querySelectorAll<HTMLElement>('[data-quiz-service]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      const service = node.dataset.quizService as Service;
      state = openAtService(state.clientRequestId ? state : freshState(), service);
      saveState(state);
      open('card');
    });
  });
  if (forceQuiz || reopen) {
    if (forceQuiz || !state.clientRequestId) {
      state = freshState();
      if (profile.username) state = patchContact(state, { telegram: profile.username });
      saveState(state);
    }
    if (forceQuiz) sessionStorage.setItem('jx_resume_ok', state.clientRequestId);
    open('cta');
  } else if (!isTelegramApp() && flag('jx_quiz_dismissed') !== '1' && flag('jx_quiz_done') !== '1') {
    window.setTimeout(() => {
      if (mode === 'closed') showPeek();
    }, 1500);
  }

  function showPeek() {
    mode = 'peek';
    trigger = 'auto';
    track('quiz_open', { trigger });
    paint(root);
  }

  function open(nextTrigger: 'auto' | 'cta' | 'card') {
    if (!state.clientRequestId) state = freshState();
    mode = 'full';
    trigger = nextTrigger;
    track('quiz_open', { trigger });
    track('quiz_step', { step_id: state.stepId, index: questionIndex(state) });
    paint(root);
  }

  function close() {
    track('quiz_close', { step_id: state.stepId });
    flag('jx_quiz_dismissed', '1');
    mode = 'closed';
    root.replaceChildren();
    document.body.classList.remove('quiz-open');
    document.documentElement.classList.remove('quiz-boot');
  }

  function paint(host: HTMLElement) {
    host.replaceChildren();
    if (mode === 'closed') {
      document.body.classList.remove('quiz-open');
      return;
    }
    document.body.classList.add('quiz-open');
    const layer = el('div', mode === 'peek' ? 'quiz peek' : 'quiz full');
    const dialog = el('div', 'quiz-sheet');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'quiz-title');
    if (mode === 'peek') dialog.append(peekBody(close, () => open('cta')));
    else dialog.append(fullBody(close));
    if (mode === 'full') {
      const backdrop = el('button', 'quiz-backdrop');
      backdrop.type = 'button';
      backdrop.setAttribute('aria-label', t('quiz.close'));
      backdrop.addEventListener('click', close);
      layer.append(backdrop);
    }
    layer.append(dialog);
    host.append(layer);
    dialog.addEventListener('keydown', (event) => trap(event, dialog, close));
    const title = dialog.querySelector<HTMLElement>('#quiz-title');
    title?.focus();
    if (state.billReady) dialog.querySelector('.btn-push')?.scrollIntoView({ block: 'end' });
    const viewport = window.visualViewport;
    if (viewport) {
      const lift = () => {
        const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        dialog.style.paddingBottom = overlap ? `${overlap + 12}px` : '';
      };
      viewport.addEventListener('resize', lift);
      viewport.addEventListener('scroll', lift);
    }
  }

  function fullBody(onClose: () => void): HTMLElement {
    const body = el('div', 'quiz-body');
    const bar = el('div', 'quiz-bar');
    const backBtn = el('button', 'text-btn', state.history.length ? t('quiz.back') : '');
    backBtn.type = 'button';
    backBtn.hidden = state.history.length === 0 || state.status === 'success';
    backBtn.addEventListener('click', () => {
      state = back(state);
      saveState(state);
      paint(root);
    });
    const meta = el('p', 'label', t('quiz.blank'));
    const closeBtn = el('button', 'text-btn', t('quiz.close'));
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', onClose);
    const manager = el('button', 'text-btn', 'К менеджеру');
    manager.type = 'button';
    manager.hidden = !isTelegramApp();
    manager.addEventListener('click', () => openManagerChat(window.__JONLIX.tg));
    bar.append(backBtn, meta, manager, closeBtn);
    body.append(bar, tickets(), resumeBanner());
    if (state.status === 'success' && last) body.append(thanks(last));
    else if (state.status === 'error') body.append(failure());
    else body.append(step());
    return body;
  }

  function resumeBanner(): HTMLElement {
    const wrap = el('div');
    const start = new Date(`${todayInTashkent()}T00:00:00+05:00`).getTime();
    if (sessionStorage.getItem('jx_resume_ok') === state.clientRequestId) return wrap;
    if (state.startedAt >= start || state.status !== 'in_progress' || (state.stepId === 'service' && !state.history.length)) return wrap;
    const note = el('p', 'resume', t('quiz.resume'));
    const row = el('div', 'row-actions');
    const cont = el('button', 'btn btn-primary', t('quiz.continue'));
    cont.type = 'button';
    cont.addEventListener('click', () => {
      sessionStorage.setItem('jx_resume_ok', state.clientRequestId);
      paint(root);
    });
    const restart = el('button', 'btn btn-ghost', t('quiz.restart'));
    restart.type = 'button';
    restart.addEventListener('click', () => {
      state = freshState();
      saveState(state);
      paint(root);
    });
    row.append(cont, restart);
    wrap.append(note, row);
    return wrap;
  }

  function tickets(): HTMLElement {
    const row = el('div', 'tickets');
    const order = stepOrder(state.service);
    const current = Math.max(0, order.indexOf(state.stepId));
    for (let i = 0; i < 6; i += 1) {
      const ticket = el('span', 'ticket' + (i < current ? ' is-done' : i === current ? ' is-now' : ''), String(i + 1));
      row.append(ticket);
    }
    const label = el('p', 'label', t('quiz.progress', { n: questionIndex(state) }));
    const wrap = el('div', 'ticket-row');
    wrap.append(row, label);
    return wrap;
  }

  function step(): HTMLElement {
    const wrap = el('div', 'step');
    const title = el('h2');
    title.id = 'quiz-title';
    title.tabIndex = -1;
    title.textContent = state.stepId === 'contacts' && state.billReady ? t('quiz.bill') : questionText(state.stepId);
    wrap.append(title);
    if (state.stepId === 'contacts') {
      if (state.billReady) wrap.append(receipt());
      wrap.append(contactForm());
    } else wrap.append(options());
    return wrap;
  }

  function options(): HTMLElement {
    const box = el('div', 'options');
    for (const option of optionsFor(state.stepId)) {
      const pressed = isSelected(option.value);
      const row = el('button', 'option' + (pressed ? ' is-on' : ''));
      row.type = 'button';
      row.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      const mark = el('span', 'box');
      mark.innerHTML = pressed ? '<svg viewBox="0 0 24 24" class="tick" aria-hidden="true"><path d="M4 13.5 9 18 20 7"/></svg>' : '';
      const name = el('span', 'option-name', t(`quiz.${option.label}`));
      row.append(mark, name);
      if (option.price) row.append(el('span', 'mono', option.price));
      row.addEventListener('click', () => choose(option.value));
      box.append(row);
    }
    if (showExtra()) box.append(extraField(), nextButton());
    else if (state.stepId === 'business_assets' || (state.stepId === 'deadline' && state.answers.deadline_mode === 'date')) box.append(nextButton());
    if (state.stepId === 'deadline') box.append(deadlineHint());
    return box;
  }

  function choose(value: string) {
    window.clearTimeout(timer);
    if (state.stepId === 'service') {
      state = selectService(state, value as Service);
      track('quiz_branch', { branch: branchOf(value as Service), service: value });
    } else if (state.stepId === 'business_assets') {
      const current = new Set(state.answers.business_assets ?? []);
      const asset = value as NonNullable<QuizAnswers['business_assets']>[number];
      if (asset === 'nothing') current.clear();
      else current.delete('nothing');
      if (current.has(asset) && asset !== 'nothing') current.delete(asset);
      else current.add(asset);
      state = patchAnswers(state, { business_assets: [...current] });
      saveState(state);
      paint(root);
      return;
    } else {
      state = patchAnswers(state, answerPatch(state.stepId, value));
    }
    saveState(state);
    const wait = state.stepId === 'business_assets' || needsExtraText(state) || (state.stepId === 'deadline' && value === 'date');
    if (wait) {
      paint(root);
      return;
    }
    timer = window.setTimeout(() => {
      state = advance(state);
      saveState(state);
      track('quiz_step', { step_id: state.stepId, index: questionIndex(state) });
      paint(root);
    }, 250);
  }

  function nextButton(): HTMLButtonElement {
    const button = el('button', 'btn btn-primary', t('quiz.next'));
    button.type = 'button';
    button.disabled = needsExtraText(state);
    button.addEventListener('click', () => {
      if (needsExtraText(state)) return;
      state = advance(state);
      saveState(state);
      track('quiz_step', { step_id: state.stepId, index: questionIndex(state) });
      paint(root);
    });
    return button;
  }

  function extraField(): HTMLElement {
    const field = el('label', 'field');
    const key = state.stepId === 'service' ? 'other_idea' : state.stepId === 'video_occasion' ? 'video_occasion_other' : 'business_type_other';
    field.append(el('span', '', t('quiz.otherIdea')));
    const input = el('input');
    input.value = (state.answers[key] as string | undefined) ?? '';
    input.placeholder = t('quiz.otherText');
    input.addEventListener('input', () => {
      state = patchAnswers(state, { [key]: input.value } as Partial<QuizAnswers>);
      saveState(state);
      const button = field.parentElement?.querySelector<HTMLButtonElement>('.btn-primary');
      if (button) button.disabled = needsExtraText(state);
    });
    field.append(input);
    return field;
  }

  function showExtra(): boolean {
    if (state.stepId === 'service') return state.service === 'other';
    if (state.stepId === 'video_occasion') return state.answers.video_occasion === 'other';
    if (state.stepId === 'business_type') return state.answers.business_type === 'other';
    return false;
  }

  function deadlineHint(): HTMLElement {
    const p = el('p', 'hint');
    const mode = state.answers.deadline_mode;
    if (mode === 'date' && state.answers.deadline_date) {
      const days = Math.max(1, calendarDaysBetween(state.answers.deadline_date, todayInTashkent()));
      const business = state.service ? branchOf(state.service) === 'business' : false;
      if (business) p.textContent = t('quiz.rushBusiness', { date: state.answers.deadline_date });
      else if (days >= 7) p.textContent = t('quiz.far', { days });
      else p.textContent = t('quiz.rush', { days, pct: urgencyPercent(days) });
    } else p.textContent = t('quiz.usual');
    if (mode === 'date') {
      const input = el('input');
      input.type = 'date';
      const today = todayInTashkent();
      input.min = addDaysISO(today, 1);
      input.max = addDaysISO(today, 365);
      input.value = state.answers.deadline_date ?? '';
      input.addEventListener('change', () => {
        state = patchAnswers(state, { deadline_date: input.value });
        saveState(state);
        paint(root);
      });
      const wrap = el('div');
      wrap.append(input, p);
      return wrap;
    }
    return p;
  }

  function receipt(): HTMLElement {
    const box = el('div', 'receipt');
    if (!state.service) return box;
    const result = calculatePrice({
      service: state.service,
      photoCount: state.answers.photo_count,
      videoVariant: state.answers.video_variant,
      videoDuration: state.answers.video_duration,
      deadlineMode: state.answers.deadline_mode ?? 'standard',
      deadlineDate: state.answers.deadline_date,
      today: todayInTashkent(),
      discount: true,
    });
    const view = buildReceipt(
      {
        service: state.service,
        photoCount: state.answers.photo_count,
        videoVariant: state.answers.video_variant,
        videoDuration: state.answers.video_duration,
        deadlineMode: state.answers.deadline_mode ?? 'standard',
        deadlineDate: state.answers.deadline_date,
        today: todayInTashkent(),
        discount: true,
      },
      result,
      window.__JONLIX.lang,
    );
    if (!view.showFigures) {
      box.append(el('p', '', t('quiz.individual')));
      return box;
    }
    for (const row of view.rows) {
      const line = el('p', 'receipt-row');
      line.append(el('span', '', row.label), el('span', 'dots'), el('span', 'mono', row.value));
      box.append(line);
    }
    const total = el('p', 'receipt-total');
    total.append(el('span', '', view.totalLabel), el('span', '', `${view.totalValue} ${currencySuffix(window.__JONLIX.lang)}`));
    const pre = el('p', 'receipt-row');
    pre.append(el('span', '', view.prepayLabel), el('span', 'mono', `${view.prepayValue} ${currencySuffix(window.__JONLIX.lang)}`));
    box.append(total, pre, el('p', 'hand', t('quiz.note')));
    return box;
  }

  function contactForm(): HTMLElement {
    if (state.service && branchOf(state.service) === 'video' && !state.answers.contact_method) {
      state = patchAnswers(state, { contact_method: 'telegram' });
    }
    const form = el('form', 'slip');
    form.noValidate = true;
    if (state.service && branchOf(state.service) === 'video') {
      const method = el('div', 'methods');
      for (const item of ['telegram', 'call', 'whatsapp'] as const) {
        const button = el('button', 'option' + (state.answers.contact_method === item ? ' is-on' : ''), t(`quiz.opt.${item}`));
        button.type = 'button';
        button.addEventListener('click', () => {
          state = patchAnswers(state, { contact_method: item });
          saveState(state);
          paint(root);
        });
        method.append(button);
      }
      form.append(method);
    }
    form.append(field(t('quiz.name'), 'text', state.contact.name ?? '', t('cta.namePh'), (value) => {
      state = patchContact(state, { name: value });
    }));
    const phone = field(t('quiz.phone'), 'tel', state.contact.phone ?? '+998', '', () => undefined);
    const phoneInput = phone.querySelector('input');
    if (phoneInput) {
      phoneInput.inputMode = 'tel';
      const formatted = formatPhoneInput(phoneInput.value);
      phoneInput.value = formatted.display;
      phoneInput.addEventListener('input', () => {
        const next = formatPhoneInput(phoneInput.value);
        phoneInput.value = next.display;
        state = patchContact(state, { phone: next.e164 });
        saveState(state);
      });
      phoneInput.addEventListener('blur', () => {
        const error = phone.querySelector('.err');
        if (!isCompletePhone(state.contact.phone ?? '')) {
          if (!error) phone.append(el('span', 'err', t('quiz.phoneError')));
        } else error?.remove();
      });
    }
    form.append(phone);
    form.append(field(t('quiz.telegram'), 'text', state.contact.telegram ?? '', t('quiz.telegramHint'), (value) => {
      state = patchContact(state, { telegram: value });
    }));
    const comment = el('label', 'field');
    comment.append(el('span', '', t('quiz.comment')));
    const area = el('textarea');
    area.value = state.contact.comment ?? '';
    area.addEventListener('input', () => {
      state = patchContact(state, { comment: area.value });
      saveState(state);
    });
    comment.append(area);
    const consent = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = state.contact.consent === true;
    box.addEventListener('change', () => {
      state = patchContact(state, { consent: box.checked });
      saveState(state);
      paint(root);
    });
    const consentText = el('span', '', `${t('quiz.consent')} `);
    const more = el('a', '', t('quiz.more'));
    more.href = window.__JONLIX.privacy;
    consentText.append(more);
    consent.append(box, consentText);
    const honey = el('div', 'hp');
    const honeyInput = el('input');
    honeyInput.name = 'website';
    honeyInput.tabIndex = -1;
    honeyInput.autocomplete = 'off';
    honey.append(honeyInput);
    const missing = el('p', 'err');
    missing.hidden = true;
    missing.textContent = t('quiz.needContact');
    form.addEventListener('input', () => {
      saveState(state);
      if (canSubmit()) missing.hidden = true;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!canSubmit()) {
        missing.hidden = false;
        return;
      }
      if (!state.billReady) {
        state = { ...state, billReady: true };
        saveState(state);
        paint(root);
        return;
      }
      void send(honeyInput.value);
    });
    form.append(comment, consent, honey, el('p', 'fine', t('cta.note')), missing);
    if (!state.billReady) {
      const quote = el('button', 'btn btn-primary btn-push', t('quiz.submit'));
      quote.type = 'button';
      quote.addEventListener('click', () => {
        pressButton(quote, () => {
          if (!canSubmit()) {
            missing.hidden = false;
            quote.classList.remove('is-down');
            quote.disabled = false;
            return;
          }
          state = { ...state, billReady: true };
          saveState(state);
          paint(root);
        });
      });
      form.append(quote);
    } else {
      const sendButton = el('button', 'btn btn-primary btn-push', state.status === 'submitting' ? t('quiz.preparing') : t('quiz.sendManager'));
      sendButton.type = 'button';
      sendButton.disabled = state.status === 'submitting';
      sendButton.addEventListener('click', () => {
        if (!canSubmit()) {
          missing.hidden = false;
          return;
        }
        pressButton(sendButton, () => {
          void send(honeyInput.value);
        });
      });
      form.prepend(sendButton);
    }
    return form;
  }

  function pressButton(button: HTMLButtonElement, next: () => void) {
    button.disabled = true;
    button.classList.add('is-down');
    button.setAttribute('aria-pressed', 'true');
    window.setTimeout(next, 180);
  }

  async function send(website: string) {
    if (!state.service || !canSubmit()) return;
    const service = state.service;
    state = { ...state, status: 'submitting' };
    saveState(state);
    paint(root);
    const result = calculatePrice({
      service,
      photoCount: state.answers.photo_count,
      videoVariant: state.answers.video_variant,
      videoDuration: state.answers.video_duration,
      deadlineMode: state.answers.deadline_mode ?? 'standard',
      deadlineDate: state.answers.deadline_date,
      today: todayInTashkent(),
      discount: true,
    });
    const payload = {
      client_request_id: state.clientRequestId,
      source: 'quiz' as const,
      lang: window.__JONLIX.lang,
      service,
      answers: {
        ...state.answers,
        deadline_mode: state.answers.deadline_mode ?? 'standard',
        contact_method: state.answers.contact_method ?? 'telegram',
      },
      contact: {
        name: state.contact.name?.trim() ?? '',
        phone: state.contact.phone ?? '',
        telegram: state.contact.telegram || profile.username,
        telegram_id: profile.id,
        comment: state.contact.comment ?? '',
      },
      consent: true as const,
      estimate_client: { totalMin: result.totalMin, totalMax: result.totalMax },
      utm: captureUtm(),
      page_url: location.href.slice(0, 500),
      website,
      started_at: state.startedAt,
    };
    track('lead_submit', { source: 'quiz', service });
    const parsed = LeadSchema.safeParse(payload);
    if (!parsed.success) {
      state = { ...state, status: 'error' };
      saveState(state);
      paint(root);
      return;
    }
    try {
      const response = await postLead(window.__JONLIX.api, parsed.data);
      if (response.status === 200 || response.status === 201) {
        last = response.body as LeadResponse;
        track('lead_success', { source: 'quiz', service, value: last.estimate.totalMin });
        flag('jx_quiz_done', '1');
        saveState(null);
        state = { ...state, status: 'success' };
        paint(root);
        return;
      }
      track('lead_error', { code: response.status });
      state = { ...state, status: 'error' };
      saveState(state);
      paint(root);
    } catch {
      track('lead_error', { code: 'network' });
      state = { ...state, status: 'error' };
      saveState(state);
      paint(root);
    }
  }

  function canSubmit(): boolean {
    return Boolean(state.contact.name && state.contact.name.trim().length >= 2 && isCompletePhone(state.contact.phone ?? '') && state.contact.consent && state.answers.contact_method);
  }

  function thanks(response: LeadResponse): HTMLElement {
    const card = el('div', 'stub');
    const title = el('h2');
    title.id = 'quiz-title';
    title.tabIndex = -1;
    title.textContent = t('quiz.thanks', { name: state.contact.name ?? '' });
    card.append(el('p', 'label', 'Jonlix'), title, el('p', 'mono lead-id', response.lead_id));
    card.append(el('p', '', t('quiz.accepted', { id: response.lead_id })));
    card.append(el('p', '', response.working_hours ? t('quiz.soon', { min: response.sla_min }) : t('quiz.laterHours')));
    if (response.estimate.totalMin != null) {
      const suffix = currencySuffix(window.__JONLIX.lang);
      const total = response.estimate.totalMax && response.estimate.totalMax !== response.estimate.totalMin
        ? `${formatNumber(response.estimate.totalMin, window.__JONLIX.lang)} – ${formatNumber(response.estimate.totalMax, window.__JONLIX.lang)}`
        : formatNumber(response.estimate.totalMin, window.__JONLIX.lang);
      card.append(el('p', 'mono', `${total} ${suffix}`));
    }
    if (state.service && branchOf(state.service) !== 'business') card.append(el('p', '', t('quiz.photos')));
    const actions = el('div', 'row-actions');
    const write = el('button', 'btn btn-primary', 'Написать менеджеру');
    write.type = 'button';
    write.addEventListener('click', () => {
      track('click_telegram', { place: 'thanks' });
      openManagerChat(window.__JONLIX.tg);
    });
    const save = el('button', 'btn btn-ghost', t('quiz.save'));
    save.type = 'button';
    save.addEventListener('click', () => saveTicket(response.lead_id, state.contact.name ?? '', card.innerText));
    actions.append(write, save);
    card.append(actions);
    return card;
  }

  function failure(): HTMLElement {
    const card = el('div', 'stub');
    const title = el('h2', '', t('quiz.failTitle'));
    title.id = 'quiz-title';
    title.tabIndex = -1;
    card.append(title, el('p', '', t('quiz.failText')));
    const actions = el('div', 'row-actions');
    const retry = el('button', 'btn btn-primary', t('quiz.retry'));
    retry.type = 'button';
    retry.addEventListener('click', () => {
      state = { ...state, status: 'in_progress' };
      void send('');
    });
    const write = el('button', 'btn btn-ghost', 'Написать менеджеру');
    write.type = 'button';
    write.addEventListener('click', () => openManagerChat(window.__JONLIX.tg));
    actions.append(retry, write);
    card.append(actions);
    return card;
  }
}

function peekBody(onLater: () => void, onFill: () => void): HTMLElement {
  const body = el('div', 'peek-body');
  const title = el('h2', '', t('quiz.peek'));
  title.id = 'quiz-title';
  title.tabIndex = -1;
  const actions = el('div', 'row-actions');
  const fill = el('button', 'btn btn-primary', t('quiz.fill'));
  fill.type = 'button';
  fill.addEventListener('click', onFill);
  const later = el('button', 'btn btn-ghost', t('quiz.later'));
  later.type = 'button';
  later.addEventListener('click', onLater);
  actions.append(fill, later);
  body.append(el('p', 'label', t('quiz.blank')), title, stampNote(), actions);
  return body;
}

function stampNote(): HTMLElement {
  return el('p', 'stamp-note', '−10%');
}

function questionText(step: StepId): string {
  const map: Record<StepId, string> = {
    service: 'quiz.qService',
    photo_count: 'quiz.qCount',
    photo_purpose: 'quiz.qPurpose',
    video_occasion: 'quiz.qOccasion',
    video_variant: 'quiz.qVariant',
    video_duration: 'quiz.qDuration',
    business_type: 'quiz.qBusiness',
    business_assets: 'quiz.qAssets',
    deadline: 'quiz.qDeadline',
    contact_method: 'quiz.qContact',
    contacts: 'quiz.qContacts',
  };
  return t(map[step]);
}

function optionsFor(step: StepId): { value: string; label: string; price?: string }[] {
  const lang = window.__JONLIX.lang;
  const photo = (count: number) => `${formatNumber(50_000 * count, lang)} ${currencySuffix(lang)}`;
  if (step === 'service') {
    return [
      ['photo', 'opt.photo'],
      ['animation', 'opt.animation'],
      ['video', 'opt.video'],
      ['landing', 'opt.landing'],
      ['post_generator', 'opt.post_generator'],
      ['accounting', 'opt.accounting'],
      ['other', 'opt.other'],
    ].map(([value, label]) => ({ value: value!, label: label! }));
  }
  if (step === 'photo_count') {
    return [
      { value: '1', label: 'opt.c1', price: photo(1) },
      { value: '2-3', label: 'opt.c23', price: `${formatNumber(100_000, lang)} – ${formatNumber(150_000, lang)}` },
      { value: '4-5', label: 'opt.c45', price: `${formatNumber(200_000, lang)} – ${formatNumber(250_000, lang)}` },
      { value: '6+', label: 'opt.c6', price: `${t('quiz.from')} ${formatNumber(300_000, lang)}` },
    ];
  }
  if (step === 'photo_purpose') return ['personal', 'gift', 'archive', 'ad'].map((value) => ({ value: value === 'ad' ? 'business' : value, label: `opt.${value}` }));
  if (step === 'video_occasion') return ['love_story', 'birthday', 'jubilee', 'time_machine', 'occasionOther'].map((value) => ({ value: value === 'occasionOther' ? 'other' : value, label: `opt.${value}` }));
  if (step === 'video_variant') {
    return [
      { value: 'A', label: 'opt.A', price: formatNumber(100_000, lang) },
      { value: 'B', label: 'opt.B', price: formatNumber(250_000, lang) },
      { value: 'unknown', label: 'opt.unknown' },
    ];
  }
  if (step === 'video_duration') return [
    { value: '15', label: 'opt.d15' },
    { value: '30', label: 'opt.d30' },
    { value: '45', label: 'opt.d45' },
    { value: '60', label: 'opt.d60' },
    { value: 'unknown', label: 'opt.dUnknown' },
  ];
  if (step === 'business_type') return ['retail', 'services', 'food', 'production', 'bizOther'].map((value) => ({ value: value === 'bizOther' ? 'other' : value, label: `opt.${value}` }));
  if (step === 'business_assets') return ['site', 'social', 'spreadsheet', 'nothing'].map((value) => ({ value, label: `opt.${value}` }));
  if (step === 'deadline') return [
    { value: 'standard', label: 'standard' },
    { value: 'date', label: 'pickDate' },
    { value: 'no_rush', label: 'noRush' },
  ];
  if (step === 'contact_method') return ['telegram', 'call', 'whatsapp'].map((value) => ({ value, label: `opt.${value}` }));
  return [];
}

function isSelected(value: string): boolean {
  const answers = state.answers;
  if (state.stepId === 'service') return state.service === value;
  if (state.stepId === 'business_assets') return Boolean(answers.business_assets?.includes(value as 'site'));
  if (state.stepId === 'video_duration') return String(answers.video_duration ?? '') === value;
  const keyMap: Partial<Record<StepId, keyof QuizAnswers>> = {
    photo_count: 'photo_count',
    photo_purpose: 'photo_purpose',
    video_occasion: 'video_occasion',
    video_variant: 'video_variant',
    business_type: 'business_type',
    deadline: 'deadline_mode',
    contact_method: 'contact_method',
  };
  const key = keyMap[state.stepId];
  return key ? String(answers[key] ?? '') === value : false;
}

function answerPatch(step: StepId, value: string): Partial<QuizAnswers> {
  if (step === 'photo_count') return { photo_count: value as QuizAnswers['photo_count'] };
  if (step === 'photo_purpose') return { photo_purpose: value as QuizAnswers['photo_purpose'] };
  if (step === 'video_occasion') return { video_occasion: value as QuizAnswers['video_occasion'] };
  if (step === 'video_variant') return { video_variant: value as QuizAnswers['video_variant'] };
  if (step === 'video_duration') return { video_duration: value === 'unknown' ? 'unknown' : (Number(value) as 15) };
  if (step === 'business_type') return { business_type: value as QuizAnswers['business_type'] };
  if (step === 'deadline') return { deadline_mode: value as QuizAnswers['deadline_mode'] };
  if (step === 'contact_method') return { contact_method: value as QuizAnswers['contact_method'] };
  return {};
}

function field(label: string, type: string, value: string, placeholder: string, onInput: (value: string) => void): HTMLLabelElement {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label));
  const input = el('input');
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input);
  return wrap;
}

function trap(event: KeyboardEvent, dialog: HTMLElement, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select')].filter((node) => !node.hasAttribute('disabled') && !node.hidden);
  if (!items.length) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function saveTicket(leadId: string, name: string, details: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1040;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#FBF8F2';
  ctx.fillRect(0, 0, 800, 1040);
  ctx.strokeStyle = '#B42A1E';
  ctx.strokeRect(24, 24, 752, 992);
  ctx.fillStyle = '#1E1B18';
  ctx.font = '28px Literata, serif';
  ctx.fillText('Jonlix', 64, 120);
  ctx.font = '42px "PT Mono", monospace';
  ctx.fillText(leadId, 64, 220);
  ctx.font = '32px Literata, serif';
  ctx.fillText(name, 64, 300);
  ctx.font = '22px "Golos Text", sans-serif';
  const lines = details.split('\n').slice(0, 12);
  lines.forEach((line, index) => ctx.fillText(line.slice(0, 42), 64, 380 + index * 36));
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${leadId}.png`;
  link.click();
}
