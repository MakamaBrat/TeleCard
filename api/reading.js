// api/reading.js — засчитать сделанный расклад (статистика)
const { checkInitData } = require("../lib/telegram");
const { db } = require("../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const tgUser = checkInitData(req.body?.initData);
  if (!tgUser) return res.status(401).json({ ok: false });

  const { data: u } = await db.from("users").select("readings").eq("tg_id", tgUser.id).maybeSingle();
  await db.from("users").update({ readings: (u?.readings || 0) + 1 }).eq("tg_id", tgUser.id);
  res.json({ ok: true });
};
