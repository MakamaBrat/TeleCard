# 🔮 TeleCard — инструкция по запуску

Это полноценное Telegram Mini App: гадание на таро с анимацией, 3 языка (UA / EN / RU),
игровая валюта, магазин колод за ⭐ Stars, рефералка и статистика игроков.

## Что входит в проект
```
TeleCard/
├─ frontend/index.html     ← само приложение (открывается внутри Telegram)
├─ backend/server.js       ← бот + API + платежи Stars + рефералы
├─ backend/package.json
├─ backend/.env.example    ← шаблон секретов
└─ db/schema.sql           ← база данных (Supabase)
```

## Как это работает (архитектура)
- **Frontend** (`index.html`) — статичная страница, грузится внутри Telegram. Берёт твои данные
  (имя, аватар, язык) прямо из профиля Telegram через WebApp API.
- **Backend** (`server.js`) — бот и сервер. Проверяет, что запрос реально из Telegram,
  хранит игроков, начисляет валюту, создаёт счета на ⭐ и обрабатывает оплату.
- **Supabase** — база данных (игроки, колоды, платежи, рефералы) + хранилище PNG-колод.

> 💡 **Можно сразу посмотреть приложение** — просто открой `frontend/index.html` в браузере.
> Без бэкенда оно работает в **демо-режиме**: профиль фейковый, покупки бесплатные. Это нормально
> для теста дизайна и анимаций. Для реальной работы пройди шаги ниже.

---

# Шаг 1. Создать бота

1. В Telegram открой **@BotFather** → `/newbot` → задай имя и username (например `telecard_bot`).
2. Скопируй **токен** (вид `123456:ABC...`) — это `BOT_TOKEN`.
3. Username бота (без `@`) понадобится для ссылок-приглашений — это `BOT_USERNAME`.

Mini App к боту привяжем в **Шаге 5**, когда у фронтенда появится адрес.

---

# Шаг 2. База данных (Supabase) — бесплатно

1. Зайди на **supabase.com** → создай проект (запомни пароль БД).
2. Слева **SQL Editor** → New query → вставь содержимое `db/schema.sql` → **Run**.
   Создадутся таблицы `users`, `decks`, `payments` и стартовый каталог колод.
3. Возьми ключи: **Project Settings → API**:
   - `Project URL` → это `SUPABASE_URL`
   - `service_role` ключ (секретный, не показывай никому!) → это `SUPABASE_KEY`

### Хранилище для PNG-колод
4. Слева **Storage** → **New bucket** → имя `decks` → отметь **Public bucket** → создать.
5. Публичный адрес бакета выглядит так:
   `https://<твой-проект>.supabase.co/storage/v1/object/public/decks`
   — это `DECKS_BASE` (пригодится фронтенду).

---

# Шаг 3. Запустить бэкенд

Локально (для проверки):
```bash
cd backend
cp .env.example .env      # заполни своими значениями
npm install
npm start
```

Для постоянной работы залей бэкенд на бесплатный хостинг — проще всего **Railway** или **Render**:

**Railway** (railway.app):
1. New Project → Deploy from GitHub (или загрузи папку `backend`).
2. Variables → добавь `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`, `WEBAPP_URL` (заполнишь после Шага 4).
3. Деплой. Railway даст адрес вида `https://telecard.up.railway.app` — это `API_BASE`.

> Бот по умолчанию работает в режиме polling — этого достаточно. Перезапуск переменной `WEBAPP_URL`
> сделай после Шага 4, когда узнаешь адрес фронтенда.

---

# Шаг 4. Выложить фронтенд

`index.html` — обычная статика. Подойдёт **Vercel**, **Netlify** или **GitHub Pages** (всё бесплатно).
Например, на Netlify: перетащи папку `frontend` в окно деплоя — получишь адрес
`https://твой-сайт.netlify.app`. Это `WEBAPP_URL`.

Затем открой `frontend/index.html` и впиши вверху, в блоке CONFIG, три значения:
```js
window.API_BASE   = "https://telecard.up.railway.app";   // адрес бэкенда (Шаг 3)
window.BOT_USERNAME = "telecard_bot";                    // username бота без @
window.DECKS_BASE = "https://xxxx.supabase.co/storage/v1/object/public/decks"; // Шаг 2
```
Передеплой фронтенд после правки. И не забудь вписать `WEBAPP_URL` в переменные бэкенда (Шаг 3).

---

# Шаг 5. Привязать Mini App к боту

1. **@BotFather** → `/mybots` → выбери бота → **Bot Settings → Menu Button → Configure menu button**.
2. Вставь `WEBAPP_URL` (адрес фронтенда) и подпиши кнопку, например «🔮 Таро».
3. Теперь кнопка меню в боте открывает приложение. Команда `/start` тоже присылает кнопку запуска.

---

# Шаг 6. Платежи Telegram Stars ⭐

Stars уже встроены в код — отдельный платёжный провайдер **не нужен**.
- В приложении кнопка «Купить» / «Открыть толкование» вызывает `createInvoiceLink` (валюта `XTR`).
- Telegram показывает окно оплаты, пользователь платит звёздами.
- Бэкенд ловит `successful_payment` и выдаёт товар (колоду или разблокировку толкования).

**Цены** меняются в `backend/server.js`:
```js
const PRICES = { unlock_interpretation: 25 };               // толкование — 25 ⭐ один раз
const DECK_PRICES = { celestial:25, golden:25, noir:50, botanica:50, royal:100 };
```
(и в `db/schema.sql`, чтобы цена совпадала в магазине).

**Вывод заработанных звёзд** в реальные деньги/крипту — через **@BotFather → Bot Settings → Payments**
(раздел Telegram Stars / Stars balance). Условия и доступность зависят от Telegram.

---

# 🎴 Как добавлять новые колоды (загрузка PNG)

Колода = 22 картинки (Старшие арканы) с именами по номеру карты:

```
0.png  I.png  II.png  III.png  IV.png  V.png  VI.png  VII.png  VIII.png
IX.png  X.png  XI.png  XII.png  XIII.png  XIV.png  XV.png  XVI.png
XVII.png  XVIII.png  XIX.png  XX.png  XXI.png
```

> Имена файлов = поле `n` из массива `CARDS` во фронтенде. Если решишь использовать
> другую нумерацию (например `00.png`, `01.png`) — поменяй её и там, и в названиях файлов.

**Чтобы добавить колоду «Aurora»:**

1. **Supabase → Storage → bucket `decks`** → New folder `aurora` → загрузи туда все 22 PNG
   с правильными именами.
2. **Supabase → Table editor → таблица `decks`** → Insert row:
   - `id` = `aurora`
   - `name_uk` / `name_en` / `name_ru` = названия на 3 языках
   - `price` = цена в звёздах (например `50`)
   - `sigil` = эмодзи для превью (например `🔮`)
   - `is_new` = `true`
3. Добавь цену в `DECK_PRICES` в `server.js` (`aurora: 50`) и передеплой бэкенд.
4. Добавь колоду в массив `DECKS` во фронтенде (`index.html`), либо переделай фронт на загрузку
   списка из `/api/decks` (эндпоинт уже готов в бэкенде) — тогда новые колоды появятся **без правки фронта**.

Картинки подхватятся автоматически по адресу
`DECKS_BASE/aurora/<номер>.png` — отдельно ничего прописывать не нужно.

---

# 📊 Статистика и рефералы

Всё видно в **Supabase → Table editor → users**. Или через **SQL Editor** (примеры есть в конце `schema.sql`):

- **Все игроки и их статы:**
  ```sql
  select tg_id, username, coins, readings, interpret_unlocked, owned_decks from users order by readings desc;
  ```
- **Рефералы конкретного игрока** (подставь его `tg_id`):
  ```sql
  select first_name, username, created_at from users where referred_by = 123456;
  ```
- **Топ по приглашениям:**
  ```sql
  select referred_by, count(*) refs from users where referred_by is not null group by referred_by order by refs desc;
  ```

**Как работает рефералка:**
- Кнопка «Поделиться» в приложении даёт ссылку `https://t.me/<BOT_USERNAME>?start=ref_<твой_id>`.
- Когда новый человек заходит по ней и жмёт Start, бэкенд видит `ref_<id>`, записывает,
  кто кого привёл (`referred_by`), и начисляет пригласившему **+100 🪙**.
- За **3 приглашённых** пригласивший автоматически получает бесплатную колоду.
- Эти числа меняются в `server.js`: `REFERRAL_COIN_REWARD`, `REFERRAL_DECK_AT`, `REFERRAL_FREE_DECK`.

---

# ✅ Чеклист запуска
- [ ] Бот создан в BotFather, есть `BOT_TOKEN` и `BOT_USERNAME`
- [ ] Supabase: выполнен `schema.sql`, создан public-бакет `decks`
- [ ] Бэкенд задеплоен, переменные окружения заданы → есть `API_BASE`
- [ ] Фронтенд задеплоен → есть `WEBAPP_URL`; в `index.html` вписаны `API_BASE`, `BOT_USERNAME`, `DECKS_BASE`
- [ ] `WEBAPP_URL` прописан в переменных бэкенда
- [ ] Mini App привязан к кнопке меню бота
- [ ] Проверена покупка за ⭐ и переход по реферальной ссылке

---

## Заметки
- Карты сейчас — 22 Старших аркана со значениями на 3 языках (массив `CARDS` в `index.html`).
  Минорные арканы добавляются по тому же шаблону.
- Для прода у бота лучше включить webhook вместо polling (быстрее и стабильнее), но polling
  полностью рабочий вариант для старта.
- `service_role` ключ Supabase — секретный. Он только в бэкенде, никогда не во фронтенде.
