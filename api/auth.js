// api/auth.js — логин/регистрация игрока + обработка реферала
const { checkInitData } = require("../lib/telegram");
const { db, getOrCreateUser, userToClient } = require("../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const tgUser = checkInitData(req.body?.initData);
  if (!tgUser) return res.status(401).json({ ok: false, error: "bad initData" });

  const u = await getOrCreateUser(tgUser, req.body?.ref);
  const { data: refs } = await db.from("users")
    .select("tg_id, first_name, username").eq("referred_by", tgUser.id);

  const payload = userToClient(u);
  payload.referrals = (refs || []).map((r) => ({ id: r.tg_id, name: r.first_name || r.username }));
  res.json(payload);
};
