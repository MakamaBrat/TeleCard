// api/invoice.js — создать счёт (invoice link) на оплату Telegram Stars
const { checkInitData, tg } = require("../lib/telegram");
const { db } = require("../lib/db");

// Цены в звёздах. Должны совпадать с таблицей decks в БД.
const PRICES = { unlock_interpretation: 25 };
const DECK_PRICES = { celestial: 25, golden: 25, noir: 50, botanica: 50, royal: 100 };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const tgUser = checkInitData(req.body?.initData);
  if (!tgUser) return res.status(401).json({ ok: false });

  const item = req.body?.item; // "unlock_interpretation" | "deck:<id>"
  let title, description, amount, payload;

  if (item === "unlock_interpretation") {
    amount = PRICES.unlock_interpretation;
    title = "Толкование карт";
    description = "Разблокировать значения карт навсегда";
    payload = "unlock_interpretation";
  } else if (item && item.startsWith("deck:")) {
    const deckId = item.slice(5);
    amount = DECK_PRICES[deckId];
    if (!amount) return res.json({ ok: false, error: "unknown deck" });
    title = "Колода: " + deckId;
    description = "Новая колода карт";
    payload = "deck:" + deckId;
  } else {
    return res.json({ ok: false, error: "unknown item" });
  }

  // createInvoiceLink для Stars: валюта XTR, provider_token пустой, amount = число звёзд
  const r = await tg("createInvoiceLink", {
    title, description, payload,
    provider_token: "", currency: "XTR",
    prices: [{ label: title, amount }],
  });

  if (r.ok) {
    await db.from("pending_payments").insert({
      tg_id: tgUser.id, payload, amount, created_at: new Date().toISOString(),
    }).catch(() => {});
    res.json({ ok: true, link: r.result });
  } else {
    res.json({ ok: false, error: r.description || "invoice error" });
  }
};
