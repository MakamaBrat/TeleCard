-- ============================================================
--  TeleCard — схема базы данных (Supabase / PostgreSQL)
--  Открой Supabase → SQL Editor → вставь это → Run
-- ============================================================

-- ---------- Пользователи ----------
create table if not exists users (
  tg_id              bigint primary key,        -- Telegram ID игрока
  username           text,
  first_name         text,
  last_name          text,
  coins              integer default 50,        -- игровая валюта
  stars_balance      integer default 0,         -- (опц.) если копишь звёзды
  stars_spent        integer default 0,         -- сколько звёзд потрачено всего
  readings           integer default 0,         -- сделано раскладов
  interpret_unlocked boolean default false,     -- куплено толкование (25 ⭐)
  owned_decks        jsonb   default '["classic"]'::jsonb,  -- купленные колоды
  active_deck        text    default 'classic', -- активная колода
  referred_by        bigint,                    -- кто пригласил (tg_id)
  created_at         timestamptz default now()
);

-- индекс для быстрого подсчёта рефералов
create index if not exists idx_users_referred_by on users(referred_by);

-- ---------- Каталог колод ----------
-- Добавляешь новую колоду = добавляешь строку сюда + заливаешь PNG в Storage.
create table if not exists decks (
  id          text primary key,         -- например 'noir'
  name_uk     text,
  name_en     text,
  name_ru     text,
  price       integer default 25,        -- цена в звёздах (0 = бесплатно)
  sigil       text default '✦',          -- значок для превью
  is_new      boolean default false,
  sort_order  integer default 100,
  created_at  timestamptz default now()
);

-- стартовый каталог
insert into decks (id, name_uk, name_en, name_ru, price, sigil, is_new, sort_order) values
  ('classic',  'Класична',     'Classic',   'Классическая', 0,   '✦',  false, 1),
  ('celestial','Небесна',      'Celestial', 'Небесная',     25,  '🌌', false, 2),
  ('golden',   'Золота',       'Golden',    'Золотая',      25,  '🌟', false, 3),
  ('noir',     'Нуар',         'Noir',      'Нуар',         50,  '🌑', true,  4),
  ('botanica', 'Ботаніка',     'Botanica',  'Ботаника',     50,  '🌿', false, 5),
  ('royal',    'Королівська',  'Royal',     'Королевская',  100, '👑', true,  6)
on conflict (id) do nothing;

-- ---------- Платежи (лог) ----------
create table if not exists payments (
  id          bigserial primary key,
  tg_id       bigint references users(tg_id),
  payload     text,        -- 'unlock_interpretation' | 'deck:noir'
  amount      integer,     -- сколько звёзд
  charge_id   text,        -- telegram_payment_charge_id (для возвратов)
  created_at  timestamptz default now()
);

-- ---------- Незавершённые платежи (опц., для сверки) ----------
create table if not exists pending_payments (
  id          bigserial primary key,
  tg_id       bigint,
  payload     text,
  amount      integer,
  created_at  timestamptz default now()
);

-- ============================================================
--  Полезные запросы для тебя как владельца:
-- ============================================================

-- Все игроки и их статистика:
--   select tg_id, username, coins, readings, interpret_unlocked, owned_decks from users order by readings desc;

-- Рефералы конкретного игрока (замени 123456 на его tg_id):
--   select tg_id, first_name, username, created_at from users where referred_by = 123456;

-- Топ по числу приглашённых:
--   select referred_by, count(*) as refs from users
--   where referred_by is not null group by referred_by order by refs desc;

-- Сколько всего звёзд заработано:
--   select sum(amount) from payments;

-- ============================================================
--  Функция для атомарного +1 к раскладам (вызывается из API):
-- ============================================================
create or replace function increment_readings(uid bigint)
returns void language sql as $$
  update users set readings = readings + 1 where tg_id = uid;
$$;
