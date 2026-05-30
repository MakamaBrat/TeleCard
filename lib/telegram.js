// lib/telegram.js — вызовы Telegram Bot API через fetch + проверка initData
const crypto = require("crypto");

const BOT_TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Универсальный вызов метода Bot API (sendMessage, createInvoiceLink, и т.д.)
async function tg(method, params = {}) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json();
}

// Проверка подписи initData из Telegram WebApp. Возвращает объект user или null.
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

module.exports = { tg, checkInitData };
