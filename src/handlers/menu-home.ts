import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { fileById, filesInMenu, getUser, menuById, menus, recordActivity, saveFile, saveUser } from "../library.js";
import { backHome, fileKeyboard, fileLabel, homeKeyboard } from "../library-ui.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

// SCAFFOLD — generated from the bot blueprint BEFORE the agent runs.
// Keep a LIVE registration (.command / .callbackQuery / …) so this feature is
// never an empty stub. Replace the reply body with real logic + copy; if you
// change the user-facing text, update tests/specs to match EXACTLY.
// Do NOT rewrite src/bot.ts — buildBot() already auto-loads this module.
// Menu: wire this into /start via registerMainMenuItem({ label: "Home", data: "menu:home" }) if the toolkit exposes it.

const composer = new Composer<Ctx>();

composer.callbackQuery("menu:home", async (ctx) => {
  await ctx.answerCallbackQuery();
  const roots = await menus();
  await ctx.editMessageText(roots.length ? "Choose a library section." : "No library sections are available yet.", { reply_markup: roots.length ? homeKeyboard(roots) : backHome });
});

composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const open = /^menu:open:(\d+)$/.exec(data);
  const preview = /^file:preview:(\d+)$/.exec(data);
  const send = /^file:send:(\d+)$/.exec(data);
  if (!open && !preview && !send) return next();
  await ctx.answerCallbackQuery();
  if (open) {
    const id = Number(open[1]); const menu = await menuById(id);
    if (!menu) { await ctx.editMessageText("That section is no longer available.", { reply_markup: backHome }); return; }
    const [children, files] = await Promise.all([menus(id), filesInMenu(id)]);
    if (ctx.from) { const user = await getUser(ctx.from.id); user.lastOpenedMenu = id; await saveUser(user); }
    const rows = [
      ...children.map((m) => [inlineButton(`${m.emoji} ${m.title}`.trim(), `menu:open:${m.id}`)]),
      ...files.map((f) => [inlineButton(fileLabel(f), `file:preview:${f.id}`)]),
      [inlineButton("Back", menu.parentId ? `menu:open:${menu.parentId}` : "menu:home"), inlineButton("Home", "menu:home")],
    ];
    await ctx.editMessageText(`${menu.title}\n${menu.description || "Choose an item."}`, { reply_markup: inlineKeyboard(rows) }); return;
  }
  const file = await fileById(Number((preview ?? send)![1]));
  if (!file) { await ctx.editMessageText("That file is no longer available.", { reply_markup: backHome }); return; }
  if (preview) {
    file.views += 1; await saveFile(file); if (ctx.from) await recordActivity(ctx.from.id, file.id, "view");
    await ctx.editMessageText(`${file.title}\n${file.description || "No description provided."}`, { reply_markup: fileKeyboard(file, `menu:open:${file.menuId}`) }); return;
  }
  if (ctx.from) await recordActivity(ctx.from.id, file.id, "download");
  const method = file.fileType === "audio" ? "replyWithAudio" : file.fileType === "video" ? "replyWithVideo" : file.fileType === "photo" ? "replyWithPhoto" : "replyWithDocument";
  await (ctx as any)[method](file.telegramFileId, { caption: file.title });
});

export default composer;
