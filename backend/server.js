/**
 * TeleCard — backend (бот + API + Telegram Stars + рефералы)
 * Запуск:  npm install && node server.js
 * Нужны переменные окружения (.env):
 *   BOT_TOKEN          — токен от @BotFather
 *   SUPABASE_URL       — URL проекта Supabase
 *   SUPABASE_KEY       — service_role ключ Supabase (секретный!)
 *   WEBAPP_URL         — публичный адрес фронтенда (https://...)
 *   PORT               — порт (по умолчанию 3000)
 */
require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = process.env.PORT || 3000;

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new TelegramBot(BOT_TOKEN, { polling: true }); // для прода лучше webhook (см. инструкцию)
const app = express();
app.use(express.json());

// CORS — чтобы Mini App с другого домена мог обращаться к API
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* ----------------- Прайс (в звёздах) ----------------- */
const PRICES = {
  unlock_interpretation: 25,
};
const DECK_PRICES = {
  celestial: 25, golden: 25, noir: 50, botanica: 50, royal: 100,
};
const REFERRAL_COIN_REWARD = 100;       // монет за приведённого друга
const REFERRAL_DECK_AT = 3;             // на каком кол-ве рефералов дарим колоду
const REFERRAL_FREE_DECK = "celestial"; // какую колоду дарим

/* ============================================================
   1. ВАЛИДАЦИЯ initData из Telegram WebApp
   ============================================================ */
function checkInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calcHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calcHash !== hash) return null;
  try { return JSON.parse(params.get("user")); } catch { return null; }
}

/* ============================================================
   2. РАБОТА С ПОЛЬЗОВАТЕЛЕМ
   ============================================================ */
async function getOrCreateUser(tgUser, refParam) {
  // ищем
  let { data: user } = await db.from("users").select("*").eq("tg_id", tgUser.id).single();
  if (!user) {
    // обработка реферала: start=ref_<id>
    let referrerId = null;
    if (refParam && refParam.startsWith("ref_")) {
      const rid = parseInt(refParam.slice(4), 10);
      if (rid && rid !== tgUser.id) referrerId = rid;
    }
    const { data: created } = await db.from("users").insert({
      tg_id: tgUser.id,
      username: tgUser.username || null,
      first_name: tgUser.first_name || null,
      last_name: tgUser.last_name || null,
      coins: 50, stars_spent: 0, readings: 0,
      interpret_unlocked: false,
      owned_decks: ["classic"], active_deck: "classic",
      referred_by: referrerId,
    }).select().single();
    user = created;

    // начислить награду пригласившему
    if (referrerId) await rewardReferrer(referrerId, tgUser);
  }
  return user;
}

async function rewardReferrer(referrerId, newUser) {
  const { data: ref } = await db.from("users").select("*").eq("tg_id", referrerId).single();
  if (!ref) return;
  // считаем сколько уже привёл
  const { count } = await db.from("users").select("*", { count: "exact", head: true }).eq("referred_by", referrerId);
  const totalRefs = (count || 0); // включая текущего
  let coins = ref.coins + REFERRAL_COIN_REWARD;
  let decks = ref.owned_decks || ["classic"];
  let gotDeck = false;
  if (totalRefs === REFERRAL_DECK_AT && !decks.includes(REFERRAL_FREE_DECK)) {
    decks = [...decks, REFERRAL_FREE_DECK]; gotDeck = true;
  }
  await db.from("users").update({ coins, owned_decks: decks }).eq("tg_id", referrerId);

  // уведомить пригласившего в боте
  const name = newUser.first_name || newUser.username || "друг";
  let msg = `🎉 Новый реферал: ${name}!\n+${REFERRAL_COIN_REWARD} 🪙`;
  if (gotDeck) msg += `\n🃏 А ещё ты получил бесплатную колоду за ${REFERRAL_DECK_AT} друзей!`;
  bot.sendMessage(referrerId, msg).catch(() => {});
}

function userToClient(u) {
  return {
    ok: true,
    coins: u.coins,
    stars: u.stars_balance || 0,
    readings: u.readings,
    interpretUnlocked: u.interpret_unlocked,
    ownedDecks: u.owned_decks || ["classic"],
    activeDeck: u.active_deck || "classic",
  };
}

/* ============================================================
   3. API ENDPOINTS
   ============================================================ */
async function authed(req, res, next) {
  const tgUser = checkInitData(req.body.initData);
  if (!tgUser) return res.status(401).json({ ok: false, error: "bad initData" });
  req.tgUser = tgUser;
  next();
}

// логин/регистрация + реферал
app.post("/api/auth", authed, async (req, res) => {
  const u = await getOrCreateUser(req.tgUser, req.body.ref);
  // список рефералов для профиля
  const { data: refs } = await db.from("users")
    .select("tg_id, first_name, username").eq("referred_by", req.tgUser.id);
  const payload = userToClient(u);
  payload.referrals = (refs || []).map(r => ({ id: r.tg_id, name: r.first_name || r.username }));
  res.json(payload);
});

// засчитать расклад (статистика)
app.post("/api/reading", authed, async (req, res) => {
  await db.rpc("increment_readings", { uid: req.tgUser.id }).catch(async () => {
    const { data: u } = await db.from("users").select("readings").eq("tg_id", req.tgUser.id).single();
    await db.from("users").update({ readings: (u?.readings || 0) + 1 }).eq("tg_id", req.tgUser.id);
  });
  res.json({ ok: true });
});

// создать инвойс на оплату звёздами
app.post("/api/invoice", authed, async (req, res) => {
  const item = req.body.item; // "unlock_interpretation" | "deck:<id>"
  let title, description, amount, payload;

  if (item === "unlock_interpretation") {
    amount = PRICES.unlock_interpretation;
    title = "Толкование карт"; description = "Разблокировать значения карт навсегда";
    payload = "unlock_interpretation";
  } else if (item.startsWith("deck:")) {
    const deckId = item.slice(5);
    amount = DECK_PRICES[deckId];
    if (!amount) return res.json({ ok: false, error: "unknown deck" });
    title = "Колода: " + deckId; description = "Новая колода карт";
    payload = "deck:" + deckId;
  } else {
    return res.json({ ok: false, error: "unknown item" });
  }

  try {
    // createInvoiceLink для Telegram Stars: currency XTR, provider_token пустой
    const link = await bot.createInvoiceLink(
      title, description, payload, "", "XTR",
      [{ label: title, amount }] // в звёздах amount = кол-во звёзд
    );
    // запоминаем намерение оплаты (на случай сверки)
    await db.from("pending_payments").insert({
      tg_id: req.tgUser.id, payload, amount, created_at: new Date().toISOString()
    }).catch(() => {});
    res.json({ ok: true, link });
  } catch (e) {
    console.error("invoice error", e.message);
    res.json({ ok: false, error: e.message });
  }
});

// список колод (можно отдавать из БД, чтобы добавлять новые без правки фронта)
app.get("/api/decks", async (req, res) => {
  const { data } = await db.from("decks").select("*").order("price");
  res.json({ ok: true, decks: data || [] });
});

/* ============================================================
   4. TELEGRAM STARS — обработка платежей
   ============================================================ */
// шаг 1: подтвердить готовность принять платёж
bot.on("pre_checkout_query", (q) => {
  bot.answerPreCheckoutQuery(q.id, true).catch(e => console.error(e.message));
});

// шаг 2: платёж прошёл — выдаём товар
bot.on("successful_payment", async (msg) => {
  const tgId = msg.from.id;
  const sp = msg.successful_payment;
  const payload = sp.invoice_payload;
  const amount = sp.total_amount; // в звёздах

  const { data: u } = await db.from("users").select("*").eq("tg_id", tgId).single();
  if (!u) return;

  if (payload === "unlock_interpretation") {
    await db.from("users").update({
      interpret_unlocked: true,
      stars_spent: (u.stars_spent || 0) + amount
    }).eq("tg_id", tgId);
    bot.sendMessage(tgId, "🔓 Толкование карт разблокировано! Возвращайся в приложение.");
  } else if (payload.startsWith("deck:")) {
    const deckId = payload.slice(5);
    const decks = u.owned_decks || ["classic"];
    if (!decks.includes(deckId)) decks.push(deckId);
    await db.from("users").update({
      owned_decks: decks, active_deck: deckId,
      stars_spent: (u.stars_spent || 0) + amount
    }).eq("tg_id", tgId);
    bot.sendMessage(tgId, `🃏 Колода куплена! Возвращайся в приложение, чтобы делать расклады.`);
  }

  // лог платежа
  await db.from("payments").insert({
    tg_id: tgId, payload, amount,
    charge_id: sp.telegram_payment_charge_id,
    created_at: new Date().toISOString()
  }).catch(() => {});
});

/* ============================================================
   5. КОМАНДЫ БОТА
   ============================================================ */
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const refParam = match && match[1] ? match[1].trim() : "";
  // регистрируем (с рефералом) сразу при /start
  await getOrCreateUser(msg.from, refParam);

  bot.sendMessage(msg.chat.id,
    "🔮 *TeleCard*\nОткрой приложение и сделай свой расклад.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✨ Открыть Таро", web_app: { url: WEBAPP_URL } }
        ]]
      }
    }
  );
});

/* ----- запуск ----- */
app.get("/", (req, res) => res.send("TeleCard backend OK"));
app.listen(PORT, () => console.log("API on :" + PORT));
console.log("Bot started");
