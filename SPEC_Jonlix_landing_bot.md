# SPEC: Jonlix AI Studio — лендинг, квиз и Telegram-бот (Node.js)

| Параметр | Значение |
|---|---|
| Версия | 1.0 |
| Дата | 21.11.2026 |
| Основание | PRD «Jonlix AI Studio» v1.1 |
| Бэкенд и бот | Node.js 20 LTS, TypeScript |
| Часовой пояс | Asia/Tashkent (UTC+5) — во всех расчётах дат и рабочего времени |

> **Отличие от PRD.** В PRD обработчиком заявок был Google Apps Script. Так как бот пишется на Node.js и у него будет свой сервер, заявки принимает **Node.js-сервер** (тот же процесс, что и бот). Google Sheets остаётся хранилищем заявок и портфолио. Это даёт рабочие inline-кнопки статуса в Telegram и серверную проверку цены.

---

## 1. Состав системы

```
┌───────────────────────┐        HTTPS         ┌──────────────────────────────────┐
│  Лендинг (статика)    │ ───────────────────► │  Node.js сервис (один процесс)   │
│  jonlix.uz            │  POST /api/leads     │  ├─ HTTP API (Fastify)           │
│  RU / UZ / EN + квиз  │  GET  /api/portfolio │  ├─ Telegram-бот (grammY)        │
└───────────────────────┘                      │  ├─ Очередь доставки (SQLite)    │
                                               │  └─ Клиент Google Sheets         │
                                               └──────┬──────────────┬────────────┘
                                                      │              │
                                         Google Sheets API     Telegram Bot API
                                         (Заявки, Портфолио)   (личный чат менеджера)
```

| Компонент | Назначение |
|---|---|
| `apps/web` | Лендинг и квиз, статическая сборка |
| `apps/server` | HTTP API + Telegram-бот + фоновые задачи |
| `packages/shared` | Общий код: расчёт цены, схемы валидации, типы, тексты услуг |

---

## 2. Технологии

| Слой | Технология | Причина |
|---|---|---|
| Язык | TypeScript 5 (strict) | Общие типы фронта и бэка |
| Фронтенд | Astro 4 + vanilla TS (квиз как island) или Vite + TS | Статика, быстрый LCP, мультиязычные маршруты из коробки |
| Стили | Tailwind CSS | Скорость вёрстки, mobile-first |
| HTTP-сервер | Fastify 4 | Быстрый, встроенная валидация схем |
| Telegram | grammY | Типизированный, простой, поддерживает webhook и long polling |
| Валидация | zod (+ `zod-to-json-schema` для Fastify) | Одна схема на фронте и бэке |
| Google Sheets | `googleapis` (сервисный аккаунт) | Официальный клиент |
| Локальное хранилище | SQLite (`better-sqlite3`) | Идемпотентность, очередь повторной отправки, счётчик номеров заявок |
| Даты | `date-fns` + `date-fns-tz` | Расчёты в Asia/Tashkent |
| Логи | `pino` | Встроен в Fastify |
| Тесты | Vitest (unit), Playwright (e2e) | |
| Монорепо | pnpm workspaces | |
| Запуск | Docker + docker-compose, либо PM2 на VPS | |

---

## 3. Структура репозитория

```
jonlix/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ pages/            # / , /uz/ , /en/ , /privacy
│  │  │  ├─ components/       # Header, Hero, Services, Portfolio, VideoVariants,
│  │  │  │                    # HowWeWork, Payment, Business, Pricing, Faq, Cta, Footer
│  │  │  ├─ quiz/
│  │  │  │  ├─ quiz.ts        # машина состояний
│  │  │  │  ├─ steps.ts       # описание вопросов и веток
│  │  │  │  ├─ render.ts      # отрисовка шагов
│  │  │  │  └─ storage.ts     # localStorage
│  │  │  ├─ i18n/ru.json, uz.json, en.json
│  │  │  ├─ lib/api.ts, analytics.ts, utm.ts, phone.ts
│  │  │  └─ styles/
│  │  └─ public/              # шрифты, иконки, og-image
│  └─ server/
│     ├─ src/
│     │  ├─ index.ts          # запуск HTTP + бота + воркера
│     │  ├─ config.ts         # чтение и проверка env
│     │  ├─ http/
│     │  │  ├─ routes/leads.ts
│     │  │  ├─ routes/portfolio.ts
│     │  │  ├─ routes/health.ts
│     │  │  └─ plugins/cors.ts, rateLimit.ts
│     │  ├─ bot/
│     │  │  ├─ bot.ts         # инициализация grammY
│     │  │  ├─ commands.ts    # /start /id /today /stats /help
│     │  │  ├─ callbacks.ts   # inline-кнопки статуса
│     │  │  └─ format.ts      # шаблон сообщения о заявке
│     │  ├─ sheets/
│     │  │  ├─ client.ts
│     │  │  ├─ leads.ts       # append, updateStatus, findRow
│     │  │  └─ portfolio.ts   # чтение + кэш
│     │  ├─ queue/
│     │  │  ├─ db.ts          # SQLite, миграции
│     │  │  └─ worker.ts      # повторная доставка
│     │  └─ lib/leadId.ts, time.ts, escape.ts
│     ├─ data/                # файл SQLite (volume)
│     └─ Dockerfile
├─ packages/shared/
│  └─ src/
│     ├─ pricing.ts           # расчёт стоимости
│     ├─ schema.ts            # zod-схема заявки
│     ├─ catalog.ts           # услуги, цены, варианты ответов (ключи)
│     └─ types.ts
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

---

## 4. Общий модуль `packages/shared`

### 4.1. Каталог (`catalog.ts`)

Ответы квиза хранятся **ключами**, а не текстом: текст берётся из i18n на сайте и из русского словаря на сервере (для Telegram).

```ts
export const PRICES = {
  photo: 50_000,           // за фото (услуга 1)
  animation: 50_000,       // за фото (услуга 2)
  videoA: 100_000,         // за 15 сек
  videoB: 250_000,         // за 15 сек
} as const;

export const STANDARD_DAYS = 7;
export const URGENCY_PCT_PER_DAY = 20;
export const QUIZ_DISCOUNT_PCT = 10;
export const PREPAYMENT_PCT = 50;

export type Service =
  | 'photo' | 'animation' | 'video'
  | 'landing' | 'post_generator' | 'accounting' | 'other';

export type Branch = 'photo' | 'video' | 'business';

export const SERVICE_BRANCH: Record<Service, Branch> = {
  photo: 'photo', animation: 'photo', video: 'video',
  landing: 'business', post_generator: 'business',
  accounting: 'business', other: 'business',
};

export type PhotoCount = '1' | '2-3' | '4-5' | '6+';
export const PHOTO_COUNT_RANGE: Record<PhotoCount, [number, number | null]> = {
  '1': [1, 1], '2-3': [2, 3], '4-5': [4, 5], '6+': [6, null],
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
```

### 4.2. Расчёт стоимости (`pricing.ts`)

```ts
export interface PriceInput {
  service: Service;
  photoCount?: PhotoCount;
  videoVariant?: VideoVariant;
  videoDuration?: VideoDuration;
  deadlineMode: DeadlineMode;
  deadlineDate?: string;      // 'YYYY-MM-DD'
  today: string;              // 'YYYY-MM-DD' по Ташкенту
  discount: boolean;          // true для заявок из квиза
}

export interface PriceResult {
  kind: 'fixed' | 'range' | 'from' | 'individual';
  baseMin: number | null;
  baseMax: number | null;
  urgencyDays: number | null;  // дней до готовности, 1..7
  urgencyPct: number;          // 0..120
  discountPct: number;         // 0 | 10
  totalMin: number | null;
  totalMax: number | null;
  prepaymentMin: number | null;
  prepaymentMax: number | null;
}
```

**Алгоритм**

1. **База:**
   - `photo`/`animation`: `PRICES[service] × count`. `1` → fixed; `2-3`, `4-5` → range; `6+` → from (min = 6 × 50 000 = 300 000, max = null).
   - `video`: если `variant` или `duration` = `unknown` → individual. Иначе `PRICES.videoA|videoB × duration / 15` → fixed.
   - Ветка `business` → individual (база = null).
2. **Срочность** (только для photo/animation/video, и только при `deadlineMode = 'date'`):
   - `days = differenceInCalendarDays(deadlineDate, today)`, ограничить снизу 1.
   - `urgencyPct = days >= 7 ? 0 : 20 × (7 − days)`.
   - Для ветки `business` срочность не считается: `urgencyPct = 0`, флаг «срочно» передаётся отдельно (см. 6.2).
3. **Скидка:** `discountPct = discount ? 10 : 0`.
4. **Итог:** считать **в целых числах**, чтобы не было ошибок округления с плавающей точкой: `raw = base × (100 + urgencyPct) × (100 − discountPct)`, затем `total = ceil(raw / 10 000 / 1 000) × 1 000`, т.е. `Math.ceil(raw / 10_000_000) * 1000`. (Вариант `500000 * 1.4 * 0.9` в JS даёт 630000.0000000001 и после округления вверх — 631 000.)
5. **Предоплата:** `ceil(total × 0.5 / 1000) × 1000`.

**Тест-кейсы (обязательные, Vitest)**

| # | Вход | Итог |
|---|---|---|
| 1 | photo, 1 шт, standard, скидка | 45 000; предоплата 23 000 |
| 2 | animation, 2-3, standard, скидка | 90 000 – 135 000 |
| 3 | photo, 6+, standard, скидка | от 270 000 |
| 4 | video A, 15 сек, standard, без скидки | 100 000 |
| 5 | video B, 30 сек, дата через 5 дн., скидка | 500 000 × 1,4 × 0,9 = **630 000**; предоплата 315 000 |
| 6 | video B, 60 сек, дата через 1 дн., скидка | 1 000 000 × 2,2 × 0,9 = 1 980 000 |
| 7 | video B, 60 сек, дата через 10 дн. | надбавка 0% |
| 8 | video, variant unknown | individual |
| 9 | landing, дата через 2 дн. | individual, urgencyPct = 0 |
| 10 | deadlineDate = today (0 дн.) | приводится к 1 дню, +120% |
| 11 | photo, 1 шт, no_rush | 45 000 |

### 4.3. Схема заявки (`schema.ts`, zod)

```ts
export const LeadSchema = z.object({
  client_request_id: z.string().uuid(),          // идемпотентность
  source: z.enum(['quiz', 'form_business', 'form_footer']),
  lang: z.enum(['ru', 'uz', 'en']),
  service: z.enum(['photo','animation','video','landing','post_generator','accounting','other']),
  answers: z.object({
    photo_count: z.enum(['1','2-3','4-5','6+']).optional(),
    photo_purpose: z.enum(['personal','gift','archive','business']).optional(),
    video_occasion: z.enum(['love_story','birthday','jubilee','time_machine','other']).optional(),
    video_occasion_other: z.string().max(200).optional(),
    video_variant: z.enum(['A','B','unknown']).optional(),
    video_duration: z.union([z.literal(15),z.literal(30),z.literal(45),z.literal(60),z.literal('unknown')]).optional(),
    business_type: z.enum(['retail','services','food','production','other']).optional(),
    business_type_other: z.string().max(200).optional(),
    business_assets: z.array(z.enum(['site','social','spreadsheet','nothing'])).max(4).optional(),
    other_idea: z.string().max(500).optional(),
    deadline_mode: z.enum(['standard','date','no_rush']),
    deadline_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    contact_method: z.enum(['telegram','call','whatsapp']),
  }),
  contact: z.object({
    name: z.string().trim().min(2).max(60),
    phone: z.string().regex(/^\+998\d{9}$/),
    telegram: z.string().regex(/^@?[A-Za-z0-9_]{5,32}$/).optional().or(z.literal('')),
    comment: z.string().max(500).optional(),
  }),
  consent: z.literal(true),
  estimate_client: z.object({ totalMin: z.number().nullable(), totalMax: z.number().nullable() }).optional(),
  utm: z.object({
    source: z.string().max(100).optional(), medium: z.string().max(100).optional(),
    campaign: z.string().max(100).optional(), content: z.string().max(100).optional(),
    term: z.string().max(100).optional(),
  }).optional(),
  page_url: z.string().url().max(500),
  website: z.string().max(0).optional(),          // honeypot: должен быть пустым
  started_at: z.number().int(),                    // ms, время открытия квиза/формы
}).superRefine(/* проверка обязательных полей по ветке, см. ниже */);
```

**Обязательные поля по ветке** (`superRefine`):

| Ветка | Обязательно |
|---|---|
| photo | `photo_count`, `photo_purpose` |
| video | `video_occasion`, `video_variant`, `video_duration` |
| business | `business_type`, `business_assets` (≥ 1); для `service = other` — `other_idea` |
| все | `deadline_mode`; если `date` — `deadline_date` ≥ завтра и ≤ сегодня + 365 дн. |

Для `source = form_*` (короткие формы) ответы квиза не нужны: требуются только `service`, `contact`, `consent`; `deadline_mode` = `standard`, `contact_method` = `call`. Скидка 10% для форм **не применяется**.

---

## 5. Фронтенд (`apps/web`)

### 5.1. Маршруты и языки

| URL | Язык |
|---|---|
| `/` | ru |
| `/uz/` | uz (латиница) |
| `/en/` | en |
| `/privacy`, `/uz/privacy`, `/en/privacy` | политика конфиденциальности |

- В `<head>`: `<html lang>`, `hreflang` для всех трёх версий + `x-default` → `/`.
- При первом визите на `/`: если `navigator.language` начинается с `uz` → редирект на `/uz/`, с `en` → на `/en/`. Выбор в переключателе сохраняется в `localStorage['jx_lang']` и имеет приоритет.
- Все тексты — в `i18n/{lang}.json`; в коде нет строк на русском, кроме ключей.
- Формат сумм: `ru` — `630 000 сум`, `uz` — `630 000 so'm`, `en` — `630,000 UZS` (`Intl.NumberFormat`).

### 5.2. Блоки страницы

Порядок и содержание — по PRD, раздел 4. Технические требования:

| Блок | Требование |
|---|---|
| Hero | Фоновое видео MP4/WebM ≤ 2 МБ, `muted autoplay loop playsinline`, постер WebP; на `prefers-reduced-motion` — только постер |
| Карточки услуг | Кнопка `data-quiz-service="<service>"` открывает квиз с предвыбором |
| Портфолио | Загружается с `GET /api/portfolio?lang=`; ленивые изображения (`loading="lazy"`), видео — по клику; вкладки фильтруют по `category`; при ошибке API блок скрывается |
| Прайс | Цены из `catalog.ts` (один источник правды) |
| Формы | Короткая форма → `POST /api/leads` с `source=form_*` |
| Плавающая кнопка | На мобильном, после прокрутки 30% страницы |

### 5.3. Квиз — машина состояний

```
            ┌───────────────┐
 open() ──► │ step: service │
            └──────┬────────┘
     photo/animation│    video│          business/other│
                    ▼         ▼                        ▼
         photo_count   video_occasion            business_type
                    ▼         ▼                        ▼
       photo_purpose   video_variant            business_assets
                    ▼         ▼                        ▼
            deadline   video_duration                deadline
                    ▼         ▼                        ▼
      contact_method     deadline              contact_method
                    ▼         ▼                        ▼
                 contacts  contacts*                contacts
                    ▼         ▼                        ▼
                         success | error
```
`*` в ветке «Видео» выбор способа связи — переключатель на экране контактов.

**Состояние**

```ts
interface QuizState {
  version: 1;
  stepId: StepId;
  history: StepId[];               // для «Назад»
  service?: Service;
  answers: Partial<Answers>;
  contact: Partial<Contact>;
  startedAt: number;
  clientRequestId: string;         // crypto.randomUUID(), создаётся один раз
  status: 'in_progress' | 'submitting' | 'success' | 'error';
}
```

**Правила**
- Автооткрытие через 1500 мс после `DOMContentLoaded`, если `localStorage['jx_quiz_dismissed'] !== '1'` и квиз ещё не отправлен (`jx_quiz_done`).
- Закрытие → `jx_quiz_dismissed = '1'`. Кнопки CTA открывают квиз всегда.
- Состояние сохраняется в `localStorage['jx_quiz_state']` после каждого шага. При открытии — восстановление. Если `version` не совпадает — сброс.
- Открытие с `data-quiz-service` → `service` выставлен, `stepId` = первый шаг ветки, `history = ['service']`.
- Смена `service` на шаге 1 очищает ответы другой ветки.
- Одиночный выбор → автопереход через 250 мс; мультивыбор и поля ввода → кнопка «Далее».
- Прогресс: «Вопрос N из 6» (в ветке «Видео» шагов до контактов 5, экран контактов — 6-й).
- Смена языка на сайте не сбрасывает состояние (тексты перерисовываются из словаря).
- Доступность: фокус на заголовке шага при переходе, `Esc` — закрыть, `role="dialog" aria-modal="true"`, ловушка фокуса.

**Шаг «Срок»**
- Варианты: `standard`, `date`, `no_rush`.
- При `date` — `<input type="date">` с `min` = завтра, `max` = сегодня + 365 (даты по Ташкенту). Под полем — живая подсказка: «через 4 дня — +60% к стоимости» (для веток photo/video).

**Экран контактов**
- Блок расчёта (из `pricing.ts`) — формат по PRD 5.3.
- Поля: имя, телефон (маска `+998 (__) ___-__-__`, хранится как `+998XXXXXXXXX`), Telegram (необязательно, `@` добавляется автоматически), комментарий, согласие.
- Скрытое поле `website` (honeypot): `position:absolute; left:-9999px`, `tabindex="-1"`, `autocomplete="off"`.
- Кнопка неактивна до прохождения валидации (та же zod-схема из `shared`).

**Отправка**
1. `status = 'submitting'`, кнопка с индикатором.
2. `POST /api/leads`, таймаут 10 с.
3. `201` или `200` (дубль) → экран «Спасибо» с `lead_id`, `jx_quiz_done = '1'`, состояние квиза удаляется.
4. Ошибка сети/5xx → экран ошибки: «Не удалось отправить заявку» + кнопки «Повторить» и «Написать в Telegram» (`t.me/<TG_PUBLIC_USERNAME>`). Повтор использует тот же `clientRequestId`.
5. `422` → подсветить поля из ответа сервера.

**Экран «Спасибо»** — текст по рабочему времени берётся из ответа сервера (`working_hours: true|false`), чтобы не зависеть от часов на устройстве.

### 5.4. UTM и аналитика

- При входе UTM-параметры из URL сохраняются в `sessionStorage['jx_utm']` (first touch в сессии).
- Счётчики: GA4 и/или Яндекс Метрика, Meta Pixel. ID — из переменных сборки; если ID не задан, скрипт не подключается.
- События (единая функция `track(name, params)`):

| Событие | Когда | Параметры |
|---|---|---|
| `quiz_open` | открытие квиза | `trigger: auto|cta|card` |
| `quiz_step` | показ шага | `step_id`, `index` |
| `quiz_branch` | выбор услуги | `branch`, `service` |
| `quiz_close` | закрытие | `step_id` |
| `lead_submit` | нажатие «Получить расчёт» | `source`, `service` |
| `lead_success` | ответ 200/201 | `source`, `service`, `value` = totalMin |
| `lead_error` | ошибка | `code` |
| `click_telegram` | клик по ссылке на Telegram | `place` |
| `lang_switch` | смена языка | `from`, `to` |

`lead_success` также отправляется как `Lead` в Meta Pixel.

### 5.5. Производительность

- Lighthouse Mobile Performance ≥ 85, LCP ≤ 2,5 с, CLS ≤ 0,1.
- Изображения AVIF/WebP с `srcset`; шрифты — 2 начертания, `font-display: swap`, preload.
- JS квиза ≤ 30 КБ gzip; загружается с `defer`.

---

## 6. Сервер (`apps/server`)

### 6.1. Переменные окружения

| Переменная | Пример | Описание |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `PUBLIC_BASE_URL` | `https://api.jonlix.uz` | Базовый URL API (для webhook) |
| `CORS_ORIGINS` | `https://jonlix.uz,https://www.jonlix.uz` | Разрешённые источники |
| `BOT_TOKEN` | `123456:ABC…` | Токен бота |
| `BOT_MODE` | `polling` \| `webhook` | Режим получения обновлений |
| `BOT_WEBHOOK_SECRET` | случайная строка 32+ симв. | Заголовок `X-Telegram-Bot-Api-Secret-Token` |
| `ADMIN_CHAT_IDS` | `123456789` | Личные чаты, куда идут заявки (через запятую, на старте один) |
| `TG_PUBLIC_USERNAME` | `jonlix_studio` | Аккаунт для кнопки «Написать в Telegram» |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | base64 JSON ключа | Сервисный аккаунт |
| `SHEET_ID` | `1AbC…` | ID таблицы |
| `SHEET_LEADS_TAB` | `Заявки` | |
| `SHEET_PORTFOLIO_TAB` | `Портфолио` | |
| `WORK_HOURS_START` | `09:00` | |
| `WORK_HOURS_END` | `18:00` | |
| `RESPONSE_SLA_MIN` | `30` | Текст «свяжемся в течение N минут» |
| `TZ_NAME` | `Asia/Tashkent` | |
| `SQLITE_PATH` | `./data/jonlix.db` | |
| `LOG_LEVEL` | `info` | |

`config.ts` проверяет все переменные через zod при старте; при ошибке процесс завершается с понятным сообщением.

### 6.2. API

#### `POST /api/leads`

**Запрос:** JSON по `LeadSchema`. Лимит тела — 16 КБ.

**Обработка (по шагам):**
1. CORS: `Origin` ∈ `CORS_ORIGINS`, иначе 403.
2. Rate limit: не более 3 заявок за 10 минут с одного IP и не более 20 в час (`@fastify/rate-limit`) → 429.
3. Валидация zod → 422 с `{ errors: [{ path, code }] }`.
4. Антиспам: если `website` не пуст **или** `now − started_at < 4000 мс` → ответить `201` с фиктивным `lead_id`, **ничего не сохранять** (бот не должен понять, что его отсеяли). Записать в лог `spam_blocked`.
5. Идемпотентность: поиск `client_request_id` в SQLite. Если найден → `200` с тем же `lead_id`.
6. Серверный пересчёт цены через `pricing.ts` (`today` — по Ташкенту, `discount = source === 'quiz'`). Клиентская оценка игнорируется; если она отличается от серверной — в лог `estimate_mismatch` (warn).
7. Генерация `lead_id`: `JX-YYYYMMDD-NNNN`, где `NNNN` — счётчик за сутки по Ташкенту из SQLite (транзакция).
8. Флаги: `working_hours` (сейчас в 09:00–18:00 по Ташкенту), `urgent` (`deadline_mode = 'date'` и дней ≤ 6).
9. Запись в SQLite: таблица `leads` (полный JSON + статусы доставки `sheets_status`, `tg_status` = `pending`).
10. Ответ клиенту **сразу** (не дожидаясь Sheets/Telegram):
    ```json
    { "lead_id": "JX-20261121-0007", "working_hours": true, "sla_min": 30,
      "estimate": { "kind": "fixed", "totalMin": 630000, "totalMax": 630000,
                    "prepaymentMin": 315000, "prepaymentMax": 315000,
                    "urgencyPct": 40, "discountPct": 10 } }
    ```
    Код `201`.
11. Асинхронно (в том же процессе, через воркер): запись в Sheets → отправка в Telegram (см. 6.5).

**Коды ответа:** 201 создано, 200 дубль, 403 чужой origin, 413 слишком большое тело, 422 ошибка валидации, 429 лимит, 500 внутренняя ошибка (заявка не сохранена — фронт показывает экран ошибки).

#### `GET /api/portfolio?lang=ru|uz|en`

- Читает лист «Портфолио», фильтр `show = да`, сортировка по `order`.
- Кэш в памяти на **5 минут**; при ошибке Sheets отдаёт последний успешный кэш (stale), если его нет — `503`.
- Заголовок `Cache-Control: public, max-age=300`.
- Ответ:
  ```json
  { "items": [
    { "id": "row-5", "category": "animation", "title": "Оживление семейного фото 1975 г.",
      "before": "https://…/before.webp", "after": "https://…/after.mp4", "media": "video" } ] }
  ```
- `media` определяется по расширению ссылки «после» (`.mp4|.webm` → video, иначе image).
- Ссылки Google Drive вида `/file/d/<ID>/view` автоматически преобразуются в прямые (`https://drive.google.com/uc?export=view&id=<ID>` для изображений; для видео рекомендуется внешний хостинг — см. 7.2).

#### `GET /api/health`

`{ "ok": true, "sheets": "ok|error", "telegram": "ok|error", "queue_pending": 0 }` — для мониторинга.

#### `POST /bot/<BOT_WEBHOOK_SECRET>` (только при `BOT_MODE=webhook`)

Webhook grammY; проверка заголовка `X-Telegram-Bot-Api-Secret-Token`.

### 6.3. SQLite

```sql
CREATE TABLE leads (
  lead_id           TEXT PRIMARY KEY,
  client_request_id TEXT UNIQUE NOT NULL,
  created_at        TEXT NOT NULL,           -- ISO с +05:00
  payload_json      TEXT NOT NULL,           -- валидированная заявка
  estimate_json     TEXT NOT NULL,
  working_hours     INTEGER NOT NULL,
  sheets_status     TEXT NOT NULL DEFAULT 'pending',   -- pending|done|failed
  sheets_row        INTEGER,
  sheets_attempts   INTEGER NOT NULL DEFAULT 0,
  tg_status         TEXT NOT NULL DEFAULT 'pending',   -- pending|done|failed
  tg_message_ids    TEXT,                    -- JSON: {chat_id: message_id}
  tg_attempts       INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TEXT,
  lead_status       TEXT NOT NULL DEFAULT 'new'        -- new|in_work|no_answer|prepaid|revision|done|rejected
);
CREATE TABLE counters (day TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE INDEX idx_leads_pending ON leads(sheets_status, tg_status, next_attempt_at);
```

Файл БД — в Docker volume. Резервная копия: ежедневный `sqlite3 .backup` (cron) с хранением 14 дней.

### 6.4. Google Sheets

**Доступ:** сервисный аккаунт Google Cloud с включённым Sheets API; таблица открыта для e-mail сервисного аккаунта с правами «Редактор».

**Лист «Заявки»** (строка 1 — заголовки, создаются скриптом `pnpm sheets:init`):

| Кол. | Заголовок | Источник |
|---|---|---|
| A | lead_id | `JX-…` |
| B | Дата | `dd.MM.yyyy HH:mm` (Ташкент) |
| C | Источник | quiz / form_business / form_footer |
| D | Язык | RU / UZ / EN |
| E | Услуга | русское название |
| F | Ответы | текстом, через `; ` |
| G | Срок | «Стандарт (7 дн.)» / «26.11.2026 (5 дн.)» / «Не спешит» |
| H | Надбавка % | число |
| I | База | число или пусто |
| J | Скидка % | 0 / 10 |
| K | Итого | число, «от N», «N–M» или «Индивидуально» |
| L | Предоплата | число или пусто |
| M | Имя | |
| N | Телефон | `+998901234567` (как текст, с апострофом) |
| O | Telegram | `@username` |
| P | Комментарий | |
| Q | Способ связи | Telegram / Звонок / WhatsApp |
| R | utm_source | |
| S | utm_medium | |
| T | utm_campaign | |
| U | Страница | page_url |
| V | В рабочее время | да / нет |
| W | Статус | Новая / В работе / Не дозвонился / Предоплата получена / Правка / Сдано / Отказ |
| X | Доставка в TG | ок / ошибка |

- Запись: `spreadsheets.values.append`, `valueInputOption=USER_ENTERED`, `insertDataOption=INSERT_ROWS`. Номер строки берётся из `updates.updatedRange` и сохраняется в `sheets_row`.
- **Защита от формул:** значения, начинающиеся с `=`, `+`, `-`, `@`, получают префикс `'` (кроме телефона, который всегда с `'`).
- Колонка W — выпадающий список (проверка данных), создаётся `sheets:init`. Менеджер может менять статус и в таблице, и кнопками в боте; бот пишет в W через `values.update` по `sheets_row`.

**Лист «Портфолио»**

| Кол. | Заголовок | Значения |
|---|---|---|
| A | Категория | photo / animation / video / business |
| B | Заголовок RU | |
| C | Заголовок UZ | |
| D | Заголовок EN | если пусто — берётся RU |
| E | Ссылка «до» | необязательно |
| F | Ссылка «после» / видео | обязательно |
| G | Порядок | число |
| H | Показывать | да / нет |

Строки с пустым F или неизвестной категорией пропускаются (warn в лог).

### 6.5. Доставка и повторные попытки

Воркер (`queue/worker.ts`) запускается каждые **10 секунд** и сразу после создания заявки.

```
для каждой заявки, где (sheets_status='pending' или tg_status='pending') и next_attempt_at <= now:
  1. если sheets_status = pending → append в Sheets
       успех → sheets_status = done, sheets_row = N
       ошибка → sheets_attempts++
  2. если tg_status = pending → sendMessage во все ADMIN_CHAT_IDS
       (отправка в TG не ждёт Sheets: если Sheets недоступен, менеджер всё равно получает заявку)
       успех → tg_status = done, сохранить message_id
       ошибка → tg_attempts++
  3. next_attempt_at = now + backoff(attempts): 30 с, 2 мин, 10 мин, 30 мин, 1 ч, далее каждый час
  4. после 24 ч безуспешных попыток → status = failed
```

- Если Telegram отвечает `429`, ждать `retry_after` из ответа.
- Если Sheets записан позже Telegram — колонка X обновляется после успешной отправки в TG.
- При статусе `failed` по Sheets → бот присылает в админ-чат сообщение «⚠️ Заявка JX-… не записана в таблицу» с полным текстом заявки.
- При статусе `failed` по Telegram → запись в лог уровня `error` + колонка X = «ошибка». Проверка — через `/api/health` и команду `/today`.
- При перезапуске процесса незавершённые задачи подхватываются из SQLite.

### 6.6. Telegram-бот (grammY)

**Режим:** `polling` на VPS (проще, не нужен публичный webhook) или `webhook` при запуске за nginx с HTTPS. Одновременно работает только один режим.

**Доступ:** все команды и callback-кнопки обрабатываются **только** от `chat.id ∈ ADMIN_CHAT_IDS`. Остальным пользователям бот отвечает: «Здравствуйте! Это служебный бот Jonlix AI Studio. Чтобы сделать заказ, оставьте заявку на jonlix.uz или напишите @jonlix_studio» (на языке `from.language_code`: ru / uz / en, по умолчанию ru).

**Команды**

| Команда | Кто | Действие |
|---|---|---|
| `/start` | все | Приветствие (см. выше); для админа — список команд |
| `/id` | все | Возвращает `chat.id` — нужно один раз при настройке `ADMIN_CHAT_IDS` |
| `/today` | админ | Заявки за сегодня: количество, по услугам, по статусам; список последних 10 (`lead_id`, имя, услуга, статус) |
| `/stats` | админ | За 7 и 30 дней: заявки, доля из квиза, по услугам, сумма предварительных оценок, доля «Сдано» |
| `/lead JX-…` | админ | Повторно присылает карточку заявки с кнопками |
| `/help` | админ | Список команд |

Команды регистрируются через `setMyCommands` (отдельно для админ-чата через `scope: { type: 'chat', chat_id }`).

**Шаблон сообщения о заявке** (`format.ts`, `parse_mode: HTML`, весь пользовательский ввод экранируется: `& < >`)

```
🆕 <b>Новая заявка #JX-20261121-0007</b>
📍 Источник: квиз · instagram / video_nov
🌐 Язык клиента: UZ — общаться на узбекском

🎬 <b>Услуга:</b> Видеоролик к событию
• Повод: Юбилей
• Вариант: Б — под ключ
• Длительность: 30 сек
⚡ <b>Срочно:</b> к 26.11.2026 (5 дн., +40%)

💰 <b>Расчёт:</b>
База 500 000 → срочность +200 000 → скидка 10% −70 000
<b>Итого: 630 000 сум</b> · Предоплата 50%: 315 000 сум

👤 Дилноза
📞 <a href="tel:+998901234567">+998 90 123 45 67</a>
✈️ <a href="https://t.me/dilnoza_t">@dilnoza_t</a>
💬 «Юбилей мамы, 60 лет»
Связь: Telegram

🕒 21.11.2026 15:12
```

Правила формирования:
- Строка «Язык клиента» — только если язык не `ru`.
- Блок «Срочно» — только при надбавке > 0; для ветки business при `urgent` — строка «⚡ Нужно срочно: к 26.11.2026 (расчёт индивидуально)».
- Расчёт: `fixed` — как выше; `range` — «Итого: 90 000 – 135 000 сум»; `from` — «от 270 000 сум»; `individual` — «Стоимость: индивидуальный расчёт (скидка 10% закреплена)» (для квиза).
- Пустые поля (Telegram, комментарий) не выводятся.
- Вне рабочего времени: в конце «🌙 Получена вне рабочего времени — ответить утром», `disable_notification: true`.
- Telegram-username клиента — кликабельная ссылка; если указан способ связи WhatsApp — дополнительная ссылка `https://wa.me/998901234567`.

**Inline-кнопки под заявкой**

```
[ ✅ Взял в работу ] [ 📵 Не дозвонился ]
[ 💳 Предоплата    ] [ ❌ Отказ         ]
```
`callback_data`: `st:<lead_id>:<status>` (≤ 64 байт).

При нажатии:
1. Обновить `lead_status` в SQLite и колонку W в Sheets (с повтором при ошибке).
2. Отредактировать сообщение: добавить строку `📌 Статус: В работе · 15:20` (время Ташкента), оставить кнопки для следующих статусов:
   - после «В работе» → `[💳 Предоплата] [📵 Не дозвонился] [❌ Отказ]`
   - после «Предоплата» → `[✏️ Правка] [🏁 Сдано]`
   - после «Правка» → `[🏁 Сдано]`
   - «Сдано» / «Отказ» → кнопки убираются.
3. `answerCallbackQuery` с текстом «Статус обновлён».

**Напоминания (cron внутри процесса, `node-cron`, TZ Asia/Tashkent)**
- **09:00 ежедневно:** если есть заявки со статусом `new`, пришедшие вне рабочего времени → сводка «🌅 Ночные заявки (N): …» со ссылками `/lead`.
- **Каждые 30 мин с 09:30 до 18:00:** заявки в статусе `new` старше 30 мин в рабочее время → «⏰ Заявка JX-… ждёт ответа 35 мин». Не чаще одного напоминания на заявку в час.

### 6.7. Логирование

- `pino` в JSON; в проде — в stdout (сбор через Docker).
- События: `lead_created`, `lead_duplicate`, `spam_blocked`, `estimate_mismatch`, `sheets_append_ok/fail`, `tg_send_ok/fail`, `status_changed`, `portfolio_cache_refresh`.
- **Не логировать** полный телефон и имя: телефон маскируется `+99890***4567`.

---

## 7. Настройка внешних сервисов

### 7.1. Telegram
1. Создать бота у @BotFather → получить `BOT_TOKEN`; задать имя «Jonlix AI Studio», описание и аватар.
2. Запустить сервер, написать боту `/id` → полученный `chat.id` прописать в `ADMIN_CHAT_IDS`, перезапустить.
3. Для webhook: сервер сам вызывает `setWebhook(PUBLIC_BASE_URL + '/bot/' + BOT_WEBHOOK_SECRET, { secret_token })` при старте.

### 7.2. Google
1. Google Cloud → проект → включить Google Sheets API → сервисный аккаунт → ключ JSON → base64 в `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. Создать таблицу, дать доступ «Редактор» e-mail сервисного аккаунта, ID — в `SHEET_ID`.
3. `pnpm --filter server sheets:init` — создаёт листы, заголовки, выпадающие списки, закрепляет первую строку.
4. Портфолио: изображения можно хранить в Google Drive (доступ «Все, у кого есть ссылка»). Видео из Drive открываются медленно и с ограничениями — для видео рекомендуется загружать файлы в `apps/web/public/portfolio/` при деплое или использовать бесплатное хранилище (Cloudflare R2 / Bunny CDN) и вставлять прямые ссылки в таблицу.

---

## 8. Безопасность

| Угроза | Мера |
|---|---|
| Утечка токена бота | Токен только в env сервера; `.env` в `.gitignore`; на фронте нет секретов |
| Спам-заявки | Honeypot, минимальное время заполнения 4 с, rate limit по IP, CORS |
| Подделка цены | Цена всегда пересчитывается на сервере |
| Чужие команды боту | Проверка `ADMIN_CHAT_IDS` для команд и callback |
| Поддельный webhook | `X-Telegram-Bot-Api-Secret-Token` |
| HTML-инъекция в Telegram | Экранирование всего пользовательского текста |
| Формулы в Google Sheets | Префикс `'` для значений, начинающихся с `= + - @` |
| Персональные данные | HTTPS везде; маскирование в логах; страница политики конфиденциальности; согласие обязательно |
| Заголовки | `@fastify/helmet` для API; на статике — CSP, `X-Content-Type-Options`, `Referrer-Policy` через nginx/хостинг |

---

## 9. Развёртывание

**Вариант по умолчанию: один VPS** (1 vCPU, 1 ГБ RAM, Ubuntu 24.04; хостинг в Узбекистане или ближайший регион).

```
nginx (443, Let's Encrypt)
 ├─ jonlix.uz, www.jonlix.uz  → статические файлы apps/web/dist
 └─ api.jonlix.uz             → proxy_pass http://127.0.0.1:3000
docker-compose
 └─ server (apps/server), volume ./data → /app/data
```

- `docker-compose.yml`: сервис `server`, `restart: unless-stopped`, `env_file: .env`, healthcheck на `/api/health`.
- Сборка фронта: `pnpm --filter web build` → копирование `dist/` в каталог nginx (или GitHub Actions + rsync).
- **Альтернатива:** фронт на Netlify/Vercel/Cloudflare Pages, сервер — на VPS или Railway/Render (для Render бесплатного тарифа — только `BOT_MODE=webhook`, так как процесс засыпает).
- CI (GitHub Actions): lint → typecheck → unit-тесты → build; деплой по тегу.

---

## 10. Тестирование

| Уровень | Что проверяется |
|---|---|
| Unit (Vitest) | `pricing.ts` — все кейсы из 4.2; `LeadSchema` — обязательные поля по веткам, телефон, даты; `format.ts` — снапшоты сообщений для веток photo/video/business, вне рабочего времени, без Telegram; `leadId` — счётчик и смена суток по Ташкенту; экранирование HTML и формул |
| Интеграционные | `POST /api/leads` с мок-клиентами Sheets и Telegram: 201, 200 на дубль, 422, 429, honeypot; воркер — повтор при ошибке Sheets/TG, переход в failed; callback-кнопки меняют статус в SQLite и вызывают обновление Sheets |
| E2E (Playwright, мобильный viewport 390×844) | Прохождение трёх веток квиза на RU/UZ/EN; «Назад» сохраняет ответы; восстановление после перезагрузки; переключение языка внутри квиза; расчёт на экране = ответу сервера; экран ошибки и повтор при недоступном API |
| Ручные | Заявка на реальном стенде приходит в Telegram ≤ 5 с и появляется в таблице; кнопки статусов; напоминания в 09:00 и через 30 мин; Lighthouse |

### Соответствие критериям приёмки PRD

| PRD | Где реализовано / как проверяется |
|---|---|
| 1 Автооткрытие квиза | 5.3, e2e |
| 2 Три ветки, «Назад» | 5.3, e2e |
| 3 Расчёт по формулам | 4.2, unit |
| 4 Валидация телефона, согласие | 4.3, unit + e2e |
| 5 TG ≤ 5 с, Sheets со всеми полями | 6.2, 6.4, 6.5, ручной |
| 6 Заявка не теряется при сбое TG | 6.3, 6.5, интеграционный |
| 7 Honeypot | 6.2 шаг 4, интеграционный |
| 8 Кнопки карточек | 5.2, e2e |
| 9 Lighthouse ≥ 85 | 5.5, ручной |
| 10 Срочность и скидка | 4.2, unit |
| 11 Три языка без потери ответов | 5.1, 5.3, e2e |
| 12 Рабочее время | 6.2 шаг 8, 6.6, unit |
| 13 Портфолио без разработчика | 6.2 `/api/portfolio`, 6.4, ручной |

---

## 11. План работ

| # | Задача | Оценка |
|---|---|---|
| 1 | Монорепо, `shared` (каталог, pricing, schema) + unit-тесты | 1 день |
| 2 | Сервер: config, SQLite, `POST /api/leads`, воркер | 1,5 дня |
| 3 | Google Sheets: клиент, `sheets:init`, запись заявок, портфолио | 1 день |
| 4 | Бот: команды, шаблон сообщения, кнопки статусов, напоминания | 1,5 дня |
| 5 | Фронт: вёрстка блоков, i18n RU/UZ/EN | 3 дня |
| 6 | Квиз: машина состояний, шаги, расчёт, отправка | 2 дня |
| 7 | Аналитика, SEO, производительность | 0,5 дня |
| 8 | Тесты (интеграционные, e2e), деплой, nginx, HTTPS | 1,5 дня |
| **Итого** | | **≈ 12 рабочих дней** |

---

## 12. Решения, принятые в SPEC (проверить)

1. Номер заявки — `JX-ГГГГММДД-NNNN`, генерируется на сервере (в PRD номер формировался на сайте).
2. Скидка 10% действует только для заявок из квиза; короткие формы — без скидки.
3. Суммы округляются вверх до 1 000 сум.
4. Минимальное время заполнения квиза — 4 секунды (защита от ботов).
5. Напоминания менеджеру о неотвеченных заявках — через 30 минут в рабочее время и сводка ночных заявок в 09:00.
6. Статусы заявок ведутся и в боте (кнопки), и в Google Sheets (колонка «Статус»); источник правды — SQLite, в таблицу изменения записываются ботом. Если менеджер меняет статус вручную в таблице, бот об этом не узнаёт (синхронизация из таблицы в бот — во второй очереди).
