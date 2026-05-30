// lib/db.js — клиент Supabase + работа с пользователями и рефералами
const { createClient } = require("@supabase/supabase-js");
const { tg } = require("./telegram");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// настройки наград
const REFERRAL_COIN_REWARD = 100;       // монет за приведённого друга
const REFERRAL_DECK_AT = 3;             // на скольких рефералах дарим колоду
const REFERRAL_FREE_DECK = "celestial"; // какую колоду дарим

async function getOrCreateUser(tgUser, refParam) {
  let { data: user } = await db.from("users").select("*").eq("tg_id", tgUser.id).maybeSingle();
  if (!user) {
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
    if (referrerId) await rewardReferrer(referrerId, tgUser);
  }
  return user;
}

async function rewardReferrer(referrerId, newUser) {
  const { data: ref } = await db.from("users").select("*").eq("tg_id", referrerId).maybeSingle();
  if (!ref) return;
  const { count } = await db.from("users")
    .select("*", { count: "exact", head: true }).eq("referred_by", referrerId);
  const totalRefs = count || 0;
  const coins = ref.coins + REFERRAL_COIN_REWARD;
  let decks = ref.owned_decks || ["classic"];
  let gotDeck = false;
  if (totalRefs === REFERRAL_DECK_AT && !decks.includes(REFERRAL_FREE_DECK)) {
    decks = [...decks, REFERRAL_FREE_DECK]; gotDeck = true;
  }
  await db.from("users").update({ coins, owned_decks: decks }).eq("tg_id", referrerId);

  const name = newUser.first_name || newUser.username || "друг";
  let msg = `🎉 Новый реферал: ${name}!\n+${REFERRAL_COIN_REWARD} 🪙`;
  if (gotDeck) msg += `\n🃏 А ещё ты получил бесплатную колоду за ${REFERRAL_DECK_AT} друзей!`;
  await tg("sendMessage", { chat_id: referrerId, text: msg });
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

module.exports = {
  db, getOrCreateUser, rewardReferrer, userToClient,
  REFERRAL_COIN_REWARD, REFERRAL_DECK_AT, REFERRAL_FREE_DECK,
};
