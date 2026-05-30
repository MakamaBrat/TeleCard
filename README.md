# 🔮 TeleCard — запуск полностью на Vercel (бесплатно)

Telegram Mini App: таро с анимацией, 3 языка (UA/EN/RU), игровая валюта, магазин колод
за ⭐ Stars, рефералы и статистика. Бэкенд работает как **serverless-функции** на Vercel
(бот — через **webhook**, без постоянного процесса), поэтому отдельный платный хостинг не нужен.

## Структура
```
TeleCard/
├─ index.html              ← приложение (статика, отдаётся Vercel из корня)
├─ api/                    ← serverless-функции (бэкенд)
│  ├─ auth.js              ←   логин/регистрация + реферал
│  ├─ reading.js           ←   счётчик раскладов
│  ├─ invoice.js           ←   создание счёта на оплату звёздами
│  └─ webhook.js           ←   приём апдейтов Telegram (бот + платежи)
├─ lib/
│  ├─ telegram.js          ←   вызовы Bot API + проверка initData
│  └─ db.js                ←   Supabase + пользователи/рефералы
├─ db/schema.sql           ← база данных (Supabase)
├─ package.json
├─ vercel.json
└─ .env.example            ← список переменных окружения
```

## Как это работает
Vercel отдаёт `index.html` как статичную страницу, а всё в папке `api/` — как отдельные
serverless-функции по адресам `/api/auth`, `/api/invoice` и т.д. Фронт и API на **одном домене**,
поэтому `API_BASE` оставляем пустым (запросы идут на относительный путь `/api/...`).
Бот не «висит» процессом: Telegram сам шлёт события на `/api/webhook`, функция просыпается,
обрабатывает и засыпает. Простой не тарифицируется → в рамках бесплатного Vercel.

> 💡 Открыть `index.html` в обычном браузере = демо-режим (фейковый профиль, бесплатные покупки).
> Реальные данные и оплаты работают только когда приложение открыто внутри Telegram.

---

# Шаг 1. Бот (@BotFather)
1. `/newbot` → имя и username → сохрани **BOT_TOKEN**.
2. Username без `@` пригодится для ссылок-приглашений (это `BOT_USERNAME` во фронте).

# Шаг 2. База данных (Supabase)
1. supabase.com → New project.
2. SQL Editor → вставь `db/schema.sql` → Run.
3. Project Settings → API → скопируй **Project URL** (`SUPABASE_URL`) и **service_role** ключ (`SUPABASE_KEY`, секретный!).
4. Storage → New bucket `decks` → отметь **Public**. Публичный адрес бакета
   `https://<проект>.supabase.co/storage/v1/object/public/decks` — это `DECKS_BASE`.

# Шаг 3. Деплой на Vercel
1. Залей папку `TeleCard` в репозиторий GitHub.
2. vercel.com → Add New → Project → импортируй репозиторий.
3. **Framework Preset: Other**, Root Directory — корень проекта, Build Command — пусто.
4. **Settings → Environment Variables** добавь (значения из шагов 1–2):
   - `BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `WEBAPP_URL` — адрес самого этого деплоя (узнаешь после первого деплоя, см. ниже)
   - `TELEGRAM_WEBHOOK_SECRET` — любая длинная случайная строка (придумай сам)
5. Deploy. Получишь адрес вида `https://telecard.vercel.app`.
6. Впиши этот адрес в переменную `WEBAPP_URL` и сделай **Redeploy** (чтобы кнопка бота открывала приложение).

# Шаг 4. Прописать в index.html
Открой `index.html`, вверху в блоке CONFIG:
```js
window.API_BASE   = "";              // оставить пустым — API на том же домене Vercel
window.BOT_USERNAME = "telecard_bot"; // username бота без @
window.DECKS_BASE = "https://xxxx.supabase.co/storage/v1/object/public/decks"; // из шага 2
```
Сохрани, закоммить → Vercel передеплоит сам.

# Шаг 5. Привязать webhook и кнопку бота
**Webhook** — открой в браузере один раз (подставь свои значения):
```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://telecard.vercel.app/api/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```
В ответе должно быть `{"ok":true,...}`. Проверить можно так:
```
https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```
**Кнопка Mini App:** @BotFather → /mybots → бот → Bot Settings → Menu Button → вставь `WEBAPP_URL`.

---

# 🎴 Добавление новых колод (PNG)
Колода = 22 картинки Старших арканов с именами по номеру карты:
```
0.png I.png II.png III.png IV.png V.png VI.png VII.png VIII.png IX.png X.png
XI.png XII.png XIII.png XIV.png XV.png XVI.png XVII.png XVIII.png XIX.png XX.png XXI.png
```
Чтобы добавить колоду «Aurora»:
1. Supabase → Storage → bucket `decks` → папка `aurora` → загрузи 22 PNG.
2. Table editor → `decks` → Insert row: `id=aurora`, названия на 3 языках, `price=50`, `sigil=🌅`, `is_new=true`.
3. В `api/invoice.js` добавь цену в `DECK_PRICES` (`aurora: 50`) и закоммить (Vercel передеплоит).
4. Добавь колоду в массив `DECKS` в `index.html` (либо переделай фронт на загрузку списка из БД).
Картинки подхватятся по `DECKS_BASE/aurora/<номер>.png`.

# 📊 Статистика и рефералы
Всё в Supabase → Table editor → `users`, либо SQL (примеры в конце `schema.sql`):
- все игроки: `select tg_id, username, coins, readings, owned_decks from users order by readings desc;`
- рефералы игрока: `select first_name, username from users where referred_by = 123456;`
- топ по приглашениям: `select referred_by, count(*) from users where referred_by is not null group by referred_by order by 2 desc;`

Реферальная ссылка из приложения: `https://t.me/<BOT_USERNAME>?start=ref_<id>`. По /start бэкенд
видит `ref_<id>`, записывает `referred_by` и начисляет пригласившему +100 🪙, за 3 друзей — колоду.
Числа меняются в `lib/db.js` (`REFERRAL_COIN_REWARD`, `REFERRAL_DECK_AT`, `REFERRAL_FREE_DECK`).

---

# ⭐ Платежи Stars
Встроены, отдельный провайдер не нужен. Цены — в `api/invoice.js` (и в `schema.sql`, чтобы совпадали
в магазине). Вывод заработанных звёзд — через @BotFather → Bot Settings → Payments.

# Переменные окружения (итог)
| Переменная | Где задаётся | Что это |
|---|---|---|
| `BOT_TOKEN` | Vercel env | токен бота |
| `SUPABASE_URL` | Vercel env | адрес базы |
| `SUPABASE_KEY` | Vercel env | service_role ключ (секрет) |
| `WEBAPP_URL` | Vercel env | адрес самого деплоя |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel env | защита webhook |
| `BOT_USERNAME` | в `index.html` | username бота для ссылок |
| `DECKS_BASE` | в `index.html` | адрес бакета с PNG колод |
| `API_BASE` | в `index.html` | пусто (тот же домен) |

# ✅ Чеклист
- [ ] Бот создан, есть `BOT_TOKEN` и `BOT_USERNAME`
- [ ] Supabase: выполнен `schema.sql`, есть public-бакет `decks`
- [ ] Проект на Vercel задеплоен, заданы 5 env-переменных
- [ ] В `index.html` прописаны `BOT_USERNAME` и `DECKS_BASE`, `WEBAPP_URL` вписан в env и сделан Redeploy
- [ ] Вызван `setWebhook`, `getWebhookInfo` показывает `ok:true`
- [ ] Кнопка Mini App привязана в BotFather
- [ ] Проверены оплата ⭐ и переход по реферальной ссылке
