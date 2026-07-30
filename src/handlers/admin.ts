import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { allUsers, analytics, createFile, createMenu, deleteMenu, fileById, menuById, menus, now, saveFile } from "../library.js";
import { backHome } from "../library-ui.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const adminId = (ctx: Ctx): number | undefined => {
  // Node deployments expose settings through process.env; Workers attach their
  // deployment environment to the context before feature handlers run.
  const workerEnv = (ctx as unknown as { env?: { ADMIN_ID?: unknown } }).env;
  const raw = typeof workerEnv?.ADMIN_ID === "string"
    ? workerEnv.ADMIN_ID
    : typeof process === "undefined" ? undefined : process.env.ADMIN_ID;
  const value = raw ? Number(raw) : NaN; return Number.isSafeInteger(value) ? value : undefined;
};
const isAdmin = (ctx: Ctx) => !!ctx.from && ctx.from.id === adminId(ctx);
async function denied(ctx: Ctx, edit = false) {
  const text = adminId(ctx) ? "You don't have access to the library controls." : "Admin access hasn't been configured yet.";
  if (edit) await ctx.editMessageText(text, { reply_markup: backHome }); else await ctx.reply(text, { reply_markup: backHome });
}
async function broadcastDenied(ctx: Ctx, edit = false) {
  const text = "This feature is for admins only.";
  if (edit) await ctx.editMessageText(text, { reply_markup: backHome }); else await ctx.reply(text, { reply_markup: backHome });
}
const panel = () => inlineKeyboard([[inlineButton("Upload files", "admin:upload")], [inlineButton("Create section", "admin:menu:new"), inlineButton("Delete section", "admin:menu:delete")], [inlineButton("Manage files", "admin:files"), inlineButton("Analytics", "analytics:summary")], [inlineButton("Broadcast", "admin:broadcast")], [inlineButton("Home", "menu:home")]]);
async function showPanel(ctx: Ctx, edit = false) { if (!isAdmin(ctx)) return denied(ctx, edit); if (edit) await ctx.editMessageText("Library controls:", { reply_markup: panel() }); else await ctx.reply("Library controls:", { reply_markup: panel() }); }
const parentKeyboard = async () => inlineKeyboard([[inlineButton("Top level", "admin:parent:root")], ...(await menus()).map((m) => [inlineButton(m.title, `admin:parent:${m.id}`)]), [inlineButton("Cancel", "admin:panel")]]);
const targetKeyboard = async (action: "upload-target" | "delete") => inlineKeyboard([...(await menus()).map((m) => [inlineButton(m.title, `admin:${action}:${m.id}`)]), [inlineButton("Cancel", "admin:panel")]]);

composer.command("admin", async (ctx) => showPanel(ctx));
composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("admin:") && data !== "analytics:summary") return next();
  await ctx.answerCallbackQuery();
  // This explicit check intentionally precedes the shared admin guard: a
  // forged callback must receive the same clear answer as a hidden button.
  if (data === "admin:broadcast" && !isAdmin(ctx)) return broadcastDenied(ctx, true);
  if (!isAdmin(ctx)) return denied(ctx, true);
  if (data === "admin:panel") return showPanel(ctx, true);
  if (data === "admin:menu:new") { ctx.session.flow = "menu-title"; ctx.session.pending = {}; await ctx.editMessageText("Send the section title.", { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:panel")]]) }); return; }
  if (data === "admin:menu:delete") { await ctx.editMessageText("Choose an empty section to delete.", { reply_markup: await targetKeyboard("delete") }); return; }
  if (data === "admin:upload") { await ctx.editMessageText("Choose where the file belongs.", { reply_markup: await targetKeyboard("upload-target") }); return; }
  if (data === "admin:files") { const report = await analytics(); await ctx.editMessageText(report.files.length ? "Choose a file to pin, unpin, or replace." : "No files yet. Upload one to manage it.", { reply_markup: inlineKeyboard([...(report.files.map((f) => [inlineButton(f.title, `admin:file:${f.id}`)])), [inlineButton("Back", "admin:panel")]]) }); return; }
  if (data === "admin:broadcast") { ctx.session.flow = "broadcast"; ctx.session.pending = {}; await ctx.editMessageText("Send the announcement text. It will go only to people who have started this bot.", { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:panel")]]) }); return; }
  if (data === "analytics:summary") { const report = await analytics(); const top = [...report.files].sort((a, b) => b.views - a.views).slice(0, 3); const recent = report.activity.filter((a) => Date.parse(a.timestamp) >= now().getTime() - 7 * 86400000); await ctx.editMessageText(`Library summary\nFiles: ${report.files.length}\nSections: ${report.menus.length}\nViews and downloads this week: ${recent.length}${top.length ? `\nTop files: ${top.map((f) => `${f.title} (${f.views} views)`).join(", ")}` : "\nNo file activity yet."}`, { reply_markup: inlineKeyboard([[inlineButton("Back", "admin:panel")]]) }); return; }
  const parent = /^admin:parent:(root|\d+)$/.exec(data); if (parent) { const pending = ctx.session.pending ?? {}; pending.parentId = parent[1] === "root" ? undefined : Number(parent[1]); ctx.session.pending = pending; const menu = await createMenu({ title: String(pending.title), description: String(pending.description ?? ""), emoji: "" , parentId: pending.parentId as number | undefined }); ctx.session.flow = undefined; ctx.session.pending = {}; await ctx.editMessageText(`Created “${menu.title}”.`, { reply_markup: panel() }); return; }
  if (data === "admin:upload:confirm") { const pending = ctx.session.pending ?? {}; const file = await createFile({ menuId: Number(pending.menuId), telegramFileId: String(pending.telegramFileId), title: String(pending.title), description: String(pending.description), fileType: pending.fileType as any, size: pending.size as number | undefined, duration: pending.duration as number | undefined }); ctx.session.flow = undefined; ctx.session.pending = {}; await ctx.editMessageText(`Added “${file.title}” to the library.`, { reply_markup: panel() }); return; }
  if (data === "admin:upload:cancel") { ctx.session.flow = undefined; ctx.session.pending = {}; await ctx.editMessageText("Upload cancelled.", { reply_markup: panel() }); return; }
  const del = /^admin:delete:(\d+)$/.exec(data); if (del) { const menu = await menuById(Number(del[1])); if (!menu) { await ctx.editMessageText("That section is no longer available.", { reply_markup: panel() }); return; } const removed = await deleteMenu(menu.id); await ctx.editMessageText(removed ? `Deleted “${menu.title}”.` : "That section still has files or sub-sections. Empty it before deleting.", { reply_markup: panel() }); return; }
  const upload = /^admin:upload-target:(\d+)$/.exec(data); if (upload) { if (!await menuById(Number(upload[1]))) { await ctx.editMessageText("That section is no longer available.", { reply_markup: panel() }); return; } ctx.session.flow = "upload-media"; ctx.session.pending = { menuId: Number(upload[1]) }; await ctx.editMessageText("Send the document, photo, audio, or video to add.", { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:panel")]]) }); return; }
  const selectFile = /^admin:file:(\d+)$/.exec(data); if (selectFile) { const file = await fileById(Number(selectFile[1])); if (!file) { await ctx.editMessageText("That file is no longer available.", { reply_markup: panel() }); return; } await ctx.editMessageText(`${file.title}\nChoose an action.`, { reply_markup: inlineKeyboard([[inlineButton(file.pinned ? "Unpin" : "Pin", `admin:pin:${file.id}`), inlineButton("Replace", `admin:replace:${file.id}`)], [inlineButton("Back", "admin:files")]]) }); return; }
  const pin = /^admin:pin:(\d+)$/.exec(data); if (pin) { const file = await fileById(Number(pin[1])); if (!file) { await ctx.editMessageText("That file is no longer available.", { reply_markup: panel() }); return; } file.pinned = !file.pinned; await saveFile(file); await ctx.editMessageText(file.pinned ? "File pinned to the top of its section." : "File unpinned.", { reply_markup: panel() }); return; }
  const replace = /^admin:replace:(\d+)$/.exec(data); if (replace) { const file = await fileById(Number(replace[1])); if (!file) { await ctx.editMessageText("That file is no longer available.", { reply_markup: panel() }); return; } ctx.session.flow = "upload-media"; ctx.session.pending = { menuId: file.menuId, replaceId: file.id }; await ctx.editMessageText("Send the replacement file. Its title and description will stay the same.", { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:panel")]]) }); return; }
  return next();
});

composer.on("message", async (ctx, next) => {
  // A role can be changed while a conversation is open. Do not let a stale
  // broadcast session turn a later message into an announcement.
  if (ctx.session.flow === "broadcast" && !isAdmin(ctx)) {
    ctx.session.flow = undefined;
    ctx.session.pending = {};
    await broadcastDenied(ctx);
    return;
  }
  if (!isAdmin(ctx) || !ctx.session.flow) return next();
  const flow = ctx.session.flow; const pending = ctx.session.pending ?? {};
  if (flow === "menu-title" && ctx.message.text) { const title = ctx.message.text.trim(); if (!title || title.length > 60) { await ctx.reply("Use a section title between 1 and 60 characters."); return; } ctx.session.flow = "menu-description"; ctx.session.pending = { title }; await ctx.reply("Send a short description, or type Skip."); return; }
  if (flow === "menu-description" && ctx.message.text) { ctx.session.flow = "menu-parent"; ctx.session.pending = { ...pending, description: ctx.message.text.trim().toLowerCase() === "skip" ? "" : ctx.message.text.trim() }; await ctx.reply("Choose where this section belongs.", { reply_markup: await parentKeyboard() }); return; }
  if (flow === "broadcast" && ctx.message.text) { const text = ctx.message.text.trim(); if (!text || text.length > 4096) { await ctx.reply("Keep the announcement between 1 and 4,096 characters."); return; } const users = await allUsers(); let sent = 0; for (const user of users) { try { await ctx.api.sendMessage(user.id, text); sent++; } catch { /* A blocked user must not stop the broadcast. */ } } ctx.session.flow = undefined; ctx.session.pending = {}; await ctx.reply(sent ? `Announcement sent to ${sent} people.` : "No subscribed users could receive that announcement.", { reply_markup: panel() }); return; }
  if (flow === "upload-media") {
    const media = ctx.message.document ?? ctx.message.audio ?? ctx.message.video ?? ctx.message.photo?.at(-1); if (!media) { await ctx.reply("Send a document, photo, audio, or video to continue."); return; }
    const fileType = ctx.message.document ? "document" : ctx.message.audio ? "audio" : ctx.message.video ? "video" : "photo"; const mediaAny = media as any;
    if (pending.replaceId) { const file = await fileById(Number(pending.replaceId)); if (!file) { ctx.session.flow = undefined; await ctx.reply("That file is no longer available."); return; } file.telegramFileId = mediaAny.file_id; file.fileType = fileType; file.size = mediaAny.file_size; file.duration = mediaAny.duration; await saveFile(file); ctx.session.flow = undefined; ctx.session.pending = {}; await ctx.reply("File replaced.", { reply_markup: panel() }); return; }
    ctx.session.flow = "upload-title"; ctx.session.pending = { ...pending, telegramFileId: mediaAny.file_id, fileType, size: mediaAny.file_size, duration: mediaAny.duration }; await ctx.reply("Send the file title."); return;
  }
  if (flow === "upload-title" && ctx.message.text) { const title = ctx.message.text.trim(); if (!title || title.length > 100) { await ctx.reply("Use a file title between 1 and 100 characters."); return; } ctx.session.flow = "upload-description"; ctx.session.pending = { ...pending, title }; await ctx.reply("Send a short description, or type Skip."); return; }
  if (flow === "upload-description" && ctx.message.text) { const description = ctx.message.text.trim().toLowerCase() === "skip" ? "" : ctx.message.text.trim(); if (description.length > 500) { await ctx.reply("Keep the description under 500 characters."); return; } ctx.session.flow = "upload-confirm"; ctx.session.pending = { ...pending, description }; await ctx.reply(`Add “${pending.title}” to the library?`, { reply_markup: inlineKeyboard([[inlineButton("Confirm upload", "admin:upload:confirm"), inlineButton("Cancel", "admin:upload:cancel")]]) }); return; }
  return next();
});

export default composer;
