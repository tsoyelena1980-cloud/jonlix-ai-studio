import { PRICES, currencySuffix, formatNumber, type Lang } from '@jonlix/shared';
import en from '../i18n/en.json' with { type: 'json' };
import ru from '../i18n/ru.json' with { type: 'json' };
import uz from '../i18n/uz.json' with { type: 'json' };

const DICTS = { ru, uz, en };

type Tree = { [key: string]: string | Tree };

function text(lang: Lang, path: string): string {
  let cursor: string | Tree = DICTS[lang] as Tree;
  for (const part of path.split('.')) {
    if (typeof cursor === 'string' || !(part in cursor)) return path;
    cursor = cursor[part] ?? path;
  }
  return typeof cursor === 'string' ? cursor : path;
}

function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function money(amount: number, lang: Lang): string {
  return `${formatNumber(amount, lang)} ${currencySuffix(lang)}`;
}

export interface RenderOptions {
  lang: Lang;
  kind: 'home' | 'privacy';
  siteUrl?: string;
  apiUrl?: string;
  telegram?: string;
  instagram?: string;
  phone?: string;
  gaId?: string;
  ymId?: string;
  pixelId?: string;
  quizEntry?: boolean;
}

const PREFIX: Record<Lang, string> = { ru: '', uz: '/uz', en: '/en' };

function href(lang: Lang, kind: 'home' | 'privacy'): string {
  const base = PREFIX[lang] || '';
  if (kind === 'privacy') return `${base}/privacy/`;
  return `${base}/` || '/';
}

export function renderPage(options: RenderOptions): string {
  const lang = options.lang;
  const t = (key: string) => esc(text(lang, key));
  const site = (options.siteUrl ?? 'https://jonlix.uz').replace(/\/$/, '');
  const tg = (options.telegram ?? 'jonlix_studio').replace(/^@/, '');
  const ig = options.instagram ?? 'jonlix';
  const phone = options.phone ?? '';
  const home = href(lang, 'home');
  const privacy = href(lang, 'privacy');
  const title = options.kind === 'privacy' ? t('meta.privacyTitle') : t('meta.title');
  const description = options.kind === 'privacy' ? t('meta.privacyDescription') : t('meta.description');
  const boot = {
    lang,
    api: options.apiUrl ?? '',
    tg,
    ig,
    phone,
    ga: options.gaId ?? '',
    ym: options.ymId ?? '',
    pixel: options.pixelId ?? '',
    privacy,
  };

  return `<!doctype html>
<html lang="${lang}"${options.quizEntry ? ' class="quiz-boot"' : ''}>
<head>
  <script>
    if (/\\/quiz\\/?$/.test(location.pathname) || /(?:^|[?&])quiz=1(?:&|$)/.test(location.search)) {
      document.documentElement.classList.add('quiz-boot');
    }
  </script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${site}${options.kind === 'privacy' ? privacy : home}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${site}${home}" />
  <meta property="og:image" content="${site}/og.svg" />
  <meta name="theme-color" content="#F4EEE3" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/src/styles/global.css" />
  <script src="https://telegram.org/js/telegram-web-app.js" defer></script>
</head>
<body>
  <a class="skip" href="#main">${lang === 'en' ? 'Skip to content' : lang === 'uz' ? 'Matnga oʻtish' : 'К содержанию'}</a>
  ${header(t, lang)}
  <main id="main">
    ${options.kind === 'privacy' ? privacyPage(t) : homePage(t, lang, tg)}
  </main>
  ${footer(t, tg, ig, phone, privacy)}
  <button class="float" type="button" data-open-quiz hidden>${t('float')}</button>
  <div id="quiz-root">${options.quizEntry ? quizShell(t) : ''}</div>
  <script>window.__JONLIX = ${JSON.stringify(boot)};</script>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`;
}

function quizShell(t: (k: string) => string): string {
  const options = ['photo', 'animation', 'video', 'landing', 'post_generator', 'accounting', 'other'];
  const tickets = [1, 2, 3, 4, 5, 6].map((n) => `<span class="ticket${n === 1 ? ' is-now' : ''}">${n}</span>`).join('');
  const rows = options.map((key) => `<button class="option" type="button"><span class="box"></span><span class="option-name">${t(`quiz.opt.${key}`)}</span></button>`).join('');
  return `<div class="quiz full"><div class="quiz-sheet"><div class="quiz-body">
    <div class="quiz-bar"><p class="label">${t('quiz.blank')}</p><button class="text-btn" type="button">${t('quiz.close')}</button></div>
    <div class="ticket-row"><div class="tickets">${tickets}</div><p class="label">${t('quiz.progress').replace('{n}', '1')}</p></div>
    <div class="step"><h2 id="quiz-title">${t('quiz.qService')}</h2><div class="options">${rows}</div></div>
  </div></div></div>`;
}

function header(t: (k: string) => string, lang: Lang): string {
  return `<header class="top">
    <a class="brand" href="${href(lang, 'home')}">
      <span class="brand-name">Jonlix</span>
      <span class="label">Фотоателье · AI</span>
    </a>
    <nav class="desk-nav" aria-label="Jonlix">
      <a href="${href(lang, 'home')}#work">${t('nav.work')}</a>
      <a href="${href(lang, 'home')}#prices">${t('nav.prices')}</a>
      <a href="${href(lang, 'home')}#order">${t('nav.order')}</a>
      <a href="${href(lang, 'home')}#faq">${t('nav.faq')}</a>
    </nav>
    <div class="top-tools">
      <button class="btn btn-primary btn-small" type="button" data-open-quiz>${t('nav.calc')}</button>
      <button class="menu-btn" type="button" data-menu aria-expanded="false">${t('nav.menu')}</button>
    </div>
  </header>
  <div class="sheet-nav" hidden data-sheet>
    <button class="text-btn" type="button" data-menu-close>${t('nav.close')}</button>
    <a href="${href(lang, 'home')}#work">${t('nav.work')}</a>
    <a href="${href(lang, 'home')}#prices">${t('nav.prices')}</a>
    <a href="${href(lang, 'home')}#order">${t('nav.order')}</a>
    <a href="${href(lang, 'home')}#faq">${t('nav.faq')}</a>
  </div>`;
}

function homePage(t: (k: string) => string, lang: Lang, tg: string): string {
  const photo = money(PRICES.photo, lang);
  const videoA = money(PRICES.videoA, lang);
  const videoB = money(PRICES.videoB, lang);
  return `<section class="hero wrap">
      <div class="hero-copy">
        <p class="label">${t('hero.mark')}</p>
        <h1>${t('hero.before')}<em>${t('hero.em')}</em>${t('hero.after')}</h1>
        <p class="lead">${t('hero.lead')}</p>
        <button class="btn btn-primary" type="button" data-open-quiz>${t('hero.cta')}</button>
        <p class="label note">${t('hero.note')}</p>
      </div>
      <div class="hero-prints">
        <figure class="print tilt-a">
          <div class="print-photo"><img src="/photos/hero-city.jpg" alt="${t('hero.caption')}" /></div>
          <figcaption class="hand">${t('hero.caption')}</figcaption>
        </figure>
        <div class="hero-pair">
          <figure class="print print-small tilt-b">
            <div class="print-photo print-photo-old"><img src="/photos/hero-old.jpg" alt="${t('hero.small')}" /></div>
            <figcaption class="hand">${t('hero.small')}</figcaption>
          </figure>
          <figure class="print print-small tilt-c">
            <div class="print-photo print-photo-alive">
              <video class="alive-video" poster="/photos/hero-alive.jpg" muted playsinline preload="none" aria-label="${t('hero.alive')}">
                <source src="/photos/hero-alive.mp4" type="video/mp4" />
              </video>
            </div>
            <figcaption class="hand">${t('hero.alive')}</figcaption>
          </figure>
        </div>
      </div>
    </section>
    <section class="wrap section" id="services">
      <p class="label">${t('services.kicker')}</p>
      <h2>${t('services.title')}</h2>
      <div class="mosaic">
        ${printCard('photo', '/photos/card-photo.jpg', t('services.photoTitle'), t('services.photoText'), `${photo} · ${t('services.perPhoto')}`, t('services.order'), 'tilt-c')}
        ${printCard('animation', '/photos/card-anim.jpg', t('services.animTitle'), t('services.animText'), `${photo} · ${t('services.perPhoto')}`, t('services.order'), 'tilt-d')}
        ${printCard('video', '/photos/card-video.jpg', t('services.videoTitle'), t('services.videoText'), `${videoA} / ${videoB}`, t('services.order'), 'tilt-a')}
      </div>
    </section>
    <section class="wrap section" id="work">
      <p class="label">${t('portfolio.kicker')}</p>
      <h2>${t('portfolio.title')}</h2>
      <div class="tabs" role="tablist">
        ${['photo', 'animation', 'video', 'business'].map((id) => `<button type="button" class="tab${id === 'photo' ? ' is-active' : ''}" data-tab="${id}" role="tab">${t('portfolio.' + id)}</button>`).join('')}
      </div>
      <div id="portfolio-grid" class="portfolio-grid" data-empty="${t('portfolio.empty')}" data-was="${t('portfolio.was')}" data-now="${t('portfolio.now')}"></div>
    </section>
    <section class="darkroom" id="video">
      <figure class="holiday-poster">
        <img src="/photos/video-holiday.jpg" alt="Jonlix AI Creative Studio — видео к празднику" />
      </figure>
      <div class="darkroom-side">
        <div class="darkroom-copy">
          <p class="label label-dim">${t('video.kicker')}</p>
          <h2>${t('video.title')}</h2>
          <p class="lead dim">${t('video.lead')}</p>
        </div>
        <div class="darkroom-offers">
          <article class="envelope">
            <img src="/photos/card-script.jpg" alt="" />
            <div>
              <h3>${t('video.aTitle')}</h3>
              <p>${t('video.aText')}</p>
              <p class="mono price">${videoA} <span class="label label-dim">${t('video.per')}</span></p>
              <button class="btn btn-ghost" type="button" data-quiz-service="video">${t('video.choose')}</button>
            </div>
          </article>
          <article class="envelope">
            <img src="/photos/card-turnkey.jpg" alt="" />
            <div>
              <h3>${t('video.bTitle')}</h3>
              <p>${t('video.bText')}</p>
              <p class="mono price">${videoB} <span class="label label-dim">${t('video.per')}</span></p>
              <button class="btn btn-primary" type="button" data-quiz-service="video">${t('video.choose')}</button>
            </div>
          </article>
          <p class="themes">${t('video.themes')}</p>
        </div>
      </div>
    </section>
    <section class="wrap section" id="business">
      <p class="label">${t('business.kicker')}</p>
      <h2>${t('business.title')}</h2>
      ${ledger('04', 'landing', '/photos/card-landing.jpg', t('business.landingTitle'), t('business.landingText'), t('business.price'), t('business.discuss'))}
      ${ledger('05', 'post_generator', '/photos/card-posts.jpg', t('business.postsTitle'), t('business.postsText'), t('business.price'), t('business.discuss'))}
      ${ledger('06', 'accounting', '/photos/card-books.jpg', t('business.booksTitle'), t('business.booksText'), t('business.price'), t('business.discuss'))}
      ${formBlock(t, 'form_business')}
    </section>
    <section class="wrap section" id="prices">
      <p class="label">${t('price.kicker')}</p>
      <h2>${t('price.title')}</h2>
      <article class="pricesheet">
        <div class="pricesheet-head">
          <p class="label">${t('price.label')}</p>
          ${stamp()}
        </div>
        ${priceRow(t('price.photo'), money(PRICES.photo, lang), t('price.each'))}
        ${priceRow(t('price.anim'), money(PRICES.animation, lang), t('price.each'))}
        ${priceRow(t('price.videoA'), money(PRICES.videoA, lang), t('price.sec'))}
        ${priceRow(t('price.videoB'), money(PRICES.videoB, lang), t('price.sec'))}
        ${priceRow(t('price.landing'), t('price.custom'), '')}
        ${priceRow(t('price.posts'), t('price.custom'), '')}
        ${priceRow(t('price.books'), t('price.custom'), '')}
        <p class="fine">${t('price.note')}</p>
        <h3 class="label">${t('price.terms')}</h3>
        <ul class="terms">
          <li>${t('price.t1')}</li><li>${t('price.t2')}</li><li>${t('price.t3')}</li>
          <li>${t('price.t4')}</li><li>${t('price.t5')}</li><li>${t('price.t6')}</li>
        </ul>
        <button class="btn btn-primary" type="button" data-open-quiz>${t('hero.cta')}</button>
      </article>
    </section>
    <section class="wrap section" id="order">
      <p class="label">${t('how.kicker')}</p>
      <h2>${t('how.title')}</h2>
      <ol class="steps">
        ${[1, 2, 3, 4].map((n) => `<li><span class="label">0${n}</span><h3>${t('how.s' + n)}</h3><p>${t('how.s' + n + 't')}</p></li>`).join('')}
      </ol>
    </section>
    <section class="wrap section" id="faq">
      <p class="label">${t('faq.kicker')}</p>
      <h2>${t('faq.title')}</h2>
      <div class="faq">
        ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<details><summary>${t('faq.q' + n)}</summary><p>${t('faq.a' + n)}</p></details>`).join('')}
      </div>
    </section>
    <section class="band" id="request">
      <div class="wrap">
        <p class="label">${t('cta.kicker')}</p>
        <h2>${t('cta.title')}</h2>
        <p class="lead">${t('cta.text')}</p>
        ${formBlock(t, 'form_footer')}
        <p><a class="btn btn-ghost" href="https://t.me/${tg}" data-telegram="footer">${t('cta.telegram')}</a></p>
      </div>
    </section>`;
}

function printCard(service: string, image: string, title: string, copy: string, price: string, action: string, tilt: string): string {
  return `<article class="print ${tilt}">
    <div class="print-photo"><img src="${image}" alt="${title}" /></div>
    <h3>${title}</h3>
    <p>${copy}</p>
    <p class="mono">${price}</p>
    <button class="text-btn" type="button" data-quiz-service="${service}">${action} →</button>
  </article>`;
}

function ledger(num: string, service: string, image: string, title: string, copy: string, price: string, action: string): string {
  return `<a class="ledger" href="#request" data-quiz-service="${service}">
    <img src="${image}" alt="" />
    <span class="label">${num}</span>
    <span><strong>${title}</strong><small>${copy}</small></span>
    <span class="mono">${price}</span>
    <span class="text-btn">${action} →</span>
  </a>`;
}

function priceRow(name: string, value: string, hint: string): string {
  return `<div class="price-row"><span>${name}${hint ? `<small>${hint}</small>` : ''}</span><span class="dots"></span><span class="mono">${value}</span></div>`;
}

function formBlock(t: (k: string) => string, source: string): string {
  const services = ['photo', 'animation', 'video', 'landing', 'post_generator', 'accounting', 'other'];
  const labels = ['opt.photo', 'opt.animation', 'opt.video', 'opt.landing', 'opt.post_generator', 'opt.accounting', 'opt.other'];
  const options = services.map((id, index) => `<option value="${id}">${t('quiz.' + labels[index])}</option>`).join('');
  return `<form class="slip" data-lead-form="${source}" novalidate>
    <label>${t('cta.name')}<input name="name" required minlength="2" maxlength="60" autocomplete="name" placeholder="${t('cta.namePh')}" /></label>
    <label>${t('cta.phone')}<input name="phone" required inputmode="tel" autocomplete="tel" value="+998 " /></label>
    <label>${t('cta.service')}<select name="service">${options}</select></label>
    <label>${t('cta.comment')}<textarea name="comment" maxlength="500"></textarea></label>
    <label class="check"><input type="checkbox" name="consent" required /> <span>${t('cta.consent')} <a href="#" data-privacy>${t('cta.more')}</a></span></label>
    <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off" /></label></div>
    <p class="fine">${t('cta.note')}</p>
    <p class="form-error" data-form-error hidden></p>
    <button class="btn btn-primary" type="submit">${t('cta.submit')}</button>
  </form>`;
}

function privacyPage(t: (k: string) => string): string {
  return `<article class="wrap prose">
    <h1>${t('privacy.h')}</h1>
    ${[1, 2, 3, 4, 5, 6].map((n) => `<p>${t('privacy.p' + n)}</p>`).join('')}
  </article>`;
}

function footer(t: (k: string) => string, tg: string, ig: string, phone: string, privacy: string): string {
  return `<footer class="foot">
    <div class="suzani" aria-hidden="true"></div>
    <div class="wrap foot-grid">
      <div>${stamp()}<p class="label">Jonlix · Toshkent</p></div>
      <div>
        <p>${t('footer.hours')}</p>
        <p class="mono"><a href="https://t.me/${tg}" data-telegram="footer">@${tg}</a></p>
        <p class="mono"><a href="https://instagram.com/${ig}">@${ig}</a></p>
        ${phone ? `<p class="mono"><a href="tel:${phone}">${esc(phone)}</a></p>` : ''}
      </div>
      <div>
        <p><a href="${privacy}">${t('footer.privacy')}</a></p>
        <p class="label">${t('footer.rights')}</p>
      </div>
    </div>
  </footer>`;
}

function stamp(): string {
  return `<svg class="stamp" viewBox="0 0 88 88" aria-hidden="true">
    <circle cx="44" cy="44" r="40" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="44" cy="44" r="33" fill="none" stroke="currentColor" stroke-width="1"/>
    <text x="44" y="52" text-anchor="middle" font-size="28" font-family="Literata, serif">J</text>
  </svg>`;
}
