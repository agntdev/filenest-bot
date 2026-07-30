import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { searchFiles } from "../library.js";
import { backHome, fileLabel } from "../library-ui.js";
import { inlineButton, inlineKeyboard, paginate, registerMainMenuItem } from "../toolkit/index.js";

// SCAFFOLD — generated from the bot blueprint BEFORE the agent runs.
// Keep a LIVE registration (.command / .callbackQuery / …) so this feature is
// never an empty stub. Replace the reply body with real logic + copy; if you
// change the user-facing text, update tests/specs to match EXACTLY.
// Do NOT rewrite src/bot.ts — buildBot() already auto-loads this module.
// Menu: wire this into /start via registerMainMenuItem({ label: "Search", data: "search:init" }) if the toolkit exposes it.

registerMainMenuItem({ label: "Search", data: "search:init", order: 20 });
const composer = new Composer<Ctx>();

async function results(ctx: Ctx, term: string, requestedPage: number) {
  const found = await searchFiles(term); const page = paginate(found, { page: requestedPage, perPage: 5, callbackPrefix: "search:page", prevLabel: "Previous", nextLabel: "Next" });
  if (!found.length) { await ctx.editMessageText(`No files match “${term}”. Try a different title.`, { reply_markup: inlineKeyboard([[inlineButton("Search again", "search:init")], [inlineButton("Home", "menu:home")]]) }); return; }
  await ctx.editMessageText(`Results for “${term}” (${page.page + 1}/${page.totalPages})`, { reply_markup: inlineKeyboard([...page.pageItems.map((f) => [inlineButton(fileLabel(f), `file:preview:${f.id}`)]), ...page.controls.inline_keyboard, [inlineButton("Search again", "search:init"), inlineButton("Home", "menu:home")]]) });
}

composer.callbackQuery("search:init", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.flow = "search"; ctx.session.pending = {};
  await ctx.editMessageText("Send a file title to search for.", { reply_markup: backHome });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.flow !== "search") return next();
  const term = ctx.message.text.trim();
  if (!term) { await ctx.reply("Enter a file title to search for."); return; }
  if (term.length > 100) { await ctx.reply("Keep the search title under 100 characters."); return; }
  ctx.session.flow = undefined; ctx.session.pending = { term };
  const found = await searchFiles(term); const page = paginate(found, { page: 0, perPage: 5, callbackPrefix: "search:page" });
  if (!found.length) { await ctx.reply(`No files match “${term}”. Try a different title.`, { reply_markup: inlineKeyboard([[inlineButton("Search again", "search:init")], [inlineButton("Home", "menu:home")]]) }); return; }
  await ctx.reply(`Results for “${term}” (1/${page.totalPages})`, { reply_markup: inlineKeyboard([...page.pageItems.map((f) => [inlineButton(fileLabel(f), `file:preview:${f.id}`)]), ...page.controls.inline_keyboard, [inlineButton("Search again", "search:init"), inlineButton("Home", "menu:home")]]) });
});
composer.on("callback_query:data", async (ctx, next) => {
  const match = /^search:page:(?:prev|next):(\d+)$/.exec(ctx.callbackQuery.data); if (!match) return next();
  await ctx.answerCallbackQuery(); const term = typeof ctx.session.pending?.term === "string" ? ctx.session.pending.term : "";
  if (!term) { await ctx.editMessageText("Start a new search to see results.", { reply_markup: backHome }); return; }
  await results(ctx, term, Number(match[1]));
});

export default composer;
