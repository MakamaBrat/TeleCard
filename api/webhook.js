// api/webhook.js — единая точка приёма апдейтов Telegram (webhook).
// Сюда Telegram присылает: команду /start, pre_checkout_query и successful_payment.
const { tg } = require("../lib/telegram");
const { db, getOrCreateUser } = require("../lib/db");

const WEBAPP_URL = process.env.WEBAPP_URL;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("ok");

  // Проверяем секретный заголовок (его шлёт Telegram, если задан при setWebhook)
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    return res.status(401).send("bad secret");
  }

  const update = req.body || {};
  try {
    // 1) Подтверждение оплаты — нужно ответить в течение 10 сек
    if (update.pre_checkout_query) {
      await tg("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
      return res.status(200).send("ok");
    }

    const msg = update.message;

    // 2) Платёж прошёл — выдаём товар
    if (msg && msg.successful_payment) {
      await grant(msg.from.id, msg.successful_payment);
      return res.status(200).send("ok");
    }

    // 3) Команда /start (в т.ч. с реферальным параметром: /start ref_12345)
    if (msg && typeof msg.text === "string" && msg.text.startsWith("/start")) {
      const refParam = msg.text.split(/\s+/)[1] || "";
      await getOrCreateUser(msg.from, refParam);
      await tg("sendMessage", {
        chat_id: msg.chat.id,
        parse_mode: "Markdown",
        text: "🔮 *TeleCard*\nОткрой приложение и сделай свой расклад.",
        reply_markup: { inline_keyboard: [[{ text: "✨ Открыть Таро", web_app: { url: WEBAPP_URL } }]] },
      });
      return res.status(200).send("ok");
    }
  } catch (e) {
    console.error("webhook error", e);
  }
  res.status(200).send("ok");
};

// Выдача купленного товара после successful_payment
async function grant(tgId, sp) {
  const payload = sp.invoice_payload;
  const amount = sp.total_amount; // в звёздах
  const { data: u } = await db.from("users").select("*").eq("tg_id", tgId).maybeSingle();
  if (!u) return;

  if (payload === "unlock_interpretation") {
    await db.from("users").update({
      interpret_unlocked: true,
      stars_spent: (u.stars_spent || 0) + amount,
    }).eq("tg_id", tgId);
    await tg("sendMessage", { chat_id: tgId, text: "🔓 Толкование карт разблокировано! Возвращайся в приложение." });
  } else if (payload.startsWith("deck:")) {
    const deckId = payload.slice(5);
    const decks = u.owned_decks || ["classic"];
    if (!decks.includes(deckId)) decks.push(deckId);
    await db.from("users").update({
      owned_decks: decks, active_deck: deckId,
      stars_spent: (u.stars_spent || 0) + amount,
    }).eq("tg_id", tgId);
    await tg("sendMessage", { chat_id: tgId, text: "🃏 Колода куплена! Возвращайся в приложение." });
  }

  await db.from("payments").insert({
    tg_id: tgId, payload, amount,
    charge_id: sp.telegram_payment_charge_id,
    created_at: new Date().toISOString(),
  }).catch(() => {});
}
