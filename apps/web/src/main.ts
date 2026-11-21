import { LeadSchema, type Service } from '@jonlix/shared';
import { getPortfolio, postLead, type PortfolioItem } from './lib/api.js';
import { installAnalytics, track } from './lib/analytics.js';
import { formatPhoneInput, isCompletePhone } from './lib/phone.js';
import { captureUtm } from './lib/utm.js';
import { isTelegramApp, telegramProfile } from './lib/telegram.js';
import { mountQuiz } from './quiz/quiz.js';

const boot = window.__JONLIX;
captureUtm();
installAnalytics(boot);

const telegramApp = isTelegramApp() ? window.Telegram?.WebApp : undefined;
if (telegramApp) {
  telegramApp.ready();
  telegramApp.expand();
  telegramApp.disableVerticalSwipes?.();
  if (telegramApp.isVersionAtLeast?.('8.0')) telegramApp.requestFullscreen?.();
  document.documentElement.classList.add('tg-app');
  const fit = () => {
    const height = telegramApp.viewportStableHeight || telegramApp.viewportHeight;
    if (height) document.documentElement.style.setProperty('--tg-app-height', `${height}px`);
  };
  telegramApp.onEvent?.('viewportChanged', fit);
  fit();
}

const alive = document.querySelector<HTMLVideoElement>('.alive-video');
if (alive && !telegramApp && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const playAgain = () => {
    window.setTimeout(() => {
      alive.currentTime = 0;
      void alive.play();
    }, 1600);
  };
  alive.addEventListener('ended', playAgain);
  void alive.play();
}

document.querySelectorAll<HTMLAnchorElement>('[data-lang]').forEach((link) => {
  link.addEventListener('click', () => {
    const to = link.dataset.lang ?? boot.lang;
    localStorage.setItem('jx_lang', to);
    if (document.body.classList.contains('quiz-open')) sessionStorage.setItem('jx_quiz_reopen', '1');
    track('lang_switch', { from: boot.lang, to });
  });
});

document.querySelectorAll<HTMLAnchorElement>('[data-privacy]').forEach((link) => {
  link.href = boot.privacy;
});

const menu = document.querySelector<HTMLButtonElement>('[data-menu]');
const sheet = document.querySelector<HTMLElement>('[data-sheet]');
const closeMenu = () => {
  sheet?.setAttribute('hidden', '');
  menu?.setAttribute('aria-expanded', 'false');
};
menu?.addEventListener('click', () => {
  const open = sheet?.hasAttribute('hidden');
  if (open) {
    sheet?.removeAttribute('hidden');
    menu.setAttribute('aria-expanded', 'true');
  } else closeMenu();
});
document.querySelector('[data-menu-close]')?.addEventListener('click', closeMenu);
sheet?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

document.querySelectorAll<HTMLElement>('.print').forEach((print) => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-in');
    });
  }, { threshold: 0.35 });
  observer.observe(print);
});

const floatBtn = document.querySelector<HTMLButtonElement>('.float');
const hero = document.querySelector('.hero');
const prices = document.querySelector('#prices');
const updateFloat = () => {
  if (!floatBtn) return;
  const scrolled = window.scrollY > document.documentElement.scrollHeight * 0.3;
  const heroSeen = !!hero && hero.getBoundingClientRect().bottom > 64;
  const priceSeen = !!prices && prices.getBoundingClientRect().top < window.innerHeight * 0.8 && prices.getBoundingClientRect().bottom > 80;
  const quiz = document.body.classList.contains('quiz-open');
  floatBtn.hidden = window.innerWidth >= 768 || !scrolled || heroSeen || priceSeen || quiz;
};
window.addEventListener('scroll', updateFloat, { passive: true });
window.addEventListener('resize', updateFloat);
updateFloat();

document.querySelectorAll<HTMLAnchorElement>('[data-telegram]').forEach((link) => {
  link.addEventListener('click', () => track('click_telegram', { place: link.dataset.telegram ?? 'link' }));
});

const grid = document.querySelector<HTMLElement>('#portfolio-grid');
if (grid) {
  const tabs = document.querySelectorAll<HTMLButtonElement>('[data-tab]');
  let items: PortfolioItem[] = [];
  let current = 'photo';
  const draw = () => {
    const visible = items.filter((item) => item.category === current);
    grid.replaceChildren();
    if (!visible.length) {
      grid.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: grid.dataset.empty ?? '' }));
      return;
    }
    for (const item of visible) grid.append(card(item));
  };
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      current = tab.dataset.tab ?? 'photo';
      tabs.forEach((item) => item.classList.toggle('is-active', item === tab));
      draw();
    });
  });
  void getPortfolio(boot.api, boot.lang).then((data) => {
    if (!data) {
      document.getElementById('work')?.setAttribute('hidden', '');
      return;
    }
    items = data.items;
    draw();
  });
}

function card(item: PortfolioItem): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'print';
  figure.style.transform = `rotate(${item.rotate}deg)`;
  if (item.before && item.media === 'image') {
    const compare = document.createElement('div');
    compare.className = 'compare';
    const before = document.createElement('img');
    before.src = item.before;
    before.alt = item.title;
    before.loading = 'lazy';
    const after = document.createElement('img');
    after.src = item.after;
    after.alt = item.title;
    after.loading = 'lazy';
    const clip = document.createElement('div');
    clip.className = 'compare-top';
    clip.append(after);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = '50';
    range.className = 'compare-range';
    range.setAttribute('aria-valuemin', '0');
    range.setAttribute('aria-valuemax', '100');
    range.setAttribute('aria-valuenow', '50');
    range.addEventListener('input', () => {
      clip.style.width = `${range.value}%`;
      range.setAttribute('aria-valuenow', range.value);
    });
    compare.append(before, clip, range);
    figure.append(compare);
  } else if (item.media === 'video') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'video-poster';
    button.textContent = '▶';
    button.addEventListener('click', () => {
      const video = document.createElement('video');
      video.src = item.after;
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      button.replaceWith(video);
    });
    figure.append(button);
  } else {
    const image = document.createElement('img');
    image.src = item.after;
    image.alt = item.title;
    image.loading = 'lazy';
    figure.append(image);
  }
  const caption = document.createElement('figcaption');
  caption.className = 'hand';
  caption.textContent = item.title;
  figure.append(caption);
  return figure;
}

const startedAt = Date.now();
document.querySelectorAll<HTMLFormElement>('[data-lead-form]').forEach((form) => {
  const phone = form.querySelector<HTMLInputElement>('input[name="phone"]');
  phone?.addEventListener('input', () => {
    if (!phone) return;
    const next = formatPhoneInput(phone.value);
    phone.value = next.display;
    phone.dataset.e164 = next.e164;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const e164 = phone?.dataset.e164 || formatPhoneInput(String(data.get('phone') ?? '')).e164;
    const error = form.querySelector<HTMLElement>('[data-form-error]');
    if (!isCompletePhone(e164)) {
      if (error) {
        error.hidden = false;
        error.textContent = boot.lang === 'en' ? 'Check the phone number.' : boot.lang === 'uz' ? 'Telefon raqamini tekshiring.' : 'Проверьте номер телефона.';
      }
      return;
    }
    const payload = {
      client_request_id: crypto.randomUUID(),
      source: form.dataset.leadForm,
      lang: boot.lang,
      service: String(data.get('service')) as Service,
      answers: { deadline_mode: 'standard', contact_method: 'call' },
      contact: {
        name: String(data.get('name') ?? '').trim(),
        phone: e164,
        telegram: telegramProfile().username,
        telegram_id: telegramProfile().id,
        comment: String(data.get('comment') ?? ''),
      },
      consent: data.get('consent') === 'on',
      utm: captureUtm(),
      page_url: location.href.slice(0, 500),
      website: String(data.get('website') ?? ''),
      started_at: startedAt,
    };
    const parsed = LeadSchema.safeParse({ ...payload, consent: payload.consent ? true : false });
    if (!parsed.success) {
      if (error) {
        error.hidden = false;
        error.textContent = boot.lang === 'en' ? 'Check the form.' : 'Проверьте бланк.';
      }
      return;
    }
    track('lead_submit', { source: payload.source, service: payload.service });
    const button = form.querySelector('button');
    if (button) button.disabled = true;
    try {
      const response = await postLead(boot.api, parsed.data);
      if (response.status === 200 || response.status === 201) {
        const body = response.body as { lead_id?: string };
        track('lead_success', { source: payload.source, service: payload.service, value: null });
        form.replaceChildren(Object.assign(document.createElement('p'), { textContent: body.lead_id ?? '' }));
        return;
      }
      track('lead_error', { code: response.status });
    } catch {
      track('lead_error', { code: 'network' });
    }
    if (button) button.disabled = false;
    if (error) {
      error.hidden = false;
      error.textContent = boot.lang === 'en'
        ? 'Could not send. Write to us on Telegram.'
        : 'Не удалось отправить. Напишите нам в Telegram.';
    }
  });
});

const quizRoot = document.querySelector<HTMLElement>('#quiz-root');
if (quizRoot) mountQuiz(quizRoot);
setInterval(updateFloat, 400);
