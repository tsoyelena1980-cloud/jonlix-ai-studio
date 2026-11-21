# Jonlix AI Studio

Лендинг фотоателье, квиз с предварительным расчётом и сервер заявок: SQLite, Google Sheets и Telegram-бот.

Сайт только на русском.

## Что уже работает без ключей

В режиме development сервер принимает заявки и хранит их в SQLite, даже если нет токена бота и Google-таблицы.

```powershell
copy .env.example .env
pnpm install
pnpm dev
```

Сайт: http://localhost:5173  
API: http://localhost:3000/api/health

## Заявки в Telegram и таблицу

1. Вставьте токен из BotFather в `.env.example`, в строку `BOT_TOKEN=` сразу после знака равенства, и перезапустите сервер.
2. Запустите сервер, напишите боту `/id` и вставьте chat id в `ADMIN_CHAT_IDS`. Заявки с сайта приходят в этот чат.
3. В `WEBAPP_URL` укажите https-адрес сайта. Тогда у бота появляется кнопка «Студия» и «Открыть студию»: сайт открывается внутри Telegram. Адрес `http://localhost` Telegram не принимает.
4. В Google Cloud включите Sheets API, создайте сервисный аккаунт и положите JSON (или его base64) в `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. Создайте таблицу, дайте аккаунту право редактора, укажите `SHEET_ID`.
6. `pnpm sheets:init` создаст листы «Заявки» и «Портфолио».

Портфолио на сайте берётся из листа «Портфолио»: категория, заголовки, ссылки «до» и «после», порядок и «да» в колонке «Показывать». Новая строка появляется без пересборки сайта, кэш — 5 минут.

## Проверки

```powershell
pnpm test
pnpm --filter @jonlix/web build
pnpm --filter @jonlix/server build
```

## Публикация

Статика — каталог `apps/web/dist`. API — контейнер из `docker-compose.yml`. Пример nginx — `deploy/nginx.conf`. В production задайте `NODE_ENV=production`: без токена, чата менеджера и таблицы процесс не стартует.
