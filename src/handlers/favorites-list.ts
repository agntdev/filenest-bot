import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { fileById, getUser, saveUser } from "../library.js";
import { backHome, fileLabel } from "../library-ui.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

// SCAFFOLD — generated from the bot blueprint BEFORE the agent runs.
// Keep a LIVE registration (.command / .callbackQuery / …) so this feature is
// never an empty stub. Replace the reply body with real logic + copy; if you
// change the user-facing text, update tests/specs to match EXACTLY.
// Do NOT rewrite src/bot.ts — buildBot() already auto-loads this module.
// Menu: wire this into /start via registerMainMenuItem({ label: "Favorites", data: "favorites:list" }) if the toolkit exposes it.

registerMainMenuItem({ label: "Favorites", data: "favorites:list", order: 30 });
const composer = new Composer<Ctx>();

async function list(ctx: Ctx) {
  if (!ctx.from) return;
  const user = await getUser(ctx.from.id);
  const files = (await Promise.all(user.favorites.map(fileById))).filter((f): f is NonNullable<typeof f> => !!f);
  if (!files.length) { await ctx.editMessageText("No favorites yet. Open a file and tap Save favorite.", { reply_markup: backHome }); return; }
  await ctx.editMessageText("Your saved files:", { reply_markup: inlineKeyboard([...files.map((f) => [inlineButton(fileLabel(f), `file:preview:${f.id}`), inlineButton("Remove", `favorite:toggle:${f.id}`)]), [inlineButton("Home", "menu:home")]]) });
}

composer.callbackQuery("favorites:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await list(ctx);
});

composer.on("callback_query:data", async (ctx, next) => {
  const match = /^favorite:toggle:(\d+)$/.exec(ctx.callbackQuery.data); if (!match) return next();
  await ctx.answerCallbackQuery(); if (!ctx.from) return;
  const file = await fileById(Number(match[1]));
  if (!file) { await ctx.editMessageText("That file is no longer available.", { reply_markup: backHome }); return; }
  const user = await getUser(ctx.from.id); const saved = user.favorites.includes(file.id);
  user.favorites = saved ? user.favorites.filter((id) => id !== file.id) : [...user.favorites, file.id]; await saveUser(user);
  await ctx.editMessageText(saved ? "Removed from your favorites." : "Saved to your favorites.", { reply_markup: inlineKeyboard([[inlineButton("View favorites", "favorites:list"), inlineButton("Back to file", `file:preview:${file.id}`)], [inlineButton("Home", "menu:home")]]) });
});

export default composer;
