import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { getUser, menus } from "../library.js";
import { homeKeyboard } from "../library-ui.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "Your file library is ready. Choose a section below.";

async function home(ctx: Ctx, edit = false) {
  const roots = await menus();
  const user = ctx.from ? await getUser(ctx.from.id) : undefined;
  const text = roots.length ? WELCOME : "No library sections are available yet. Use Search when files are added.";
  const markup = roots.length ? (user?.lastOpenedMenu ? {
    inline_keyboard: [[{ text: "Continue browsing", callback_data: `menu:open:${user.lastOpenedMenu}` }], ...homeKeyboard(roots).inline_keyboard],
  } : homeKeyboard(roots)) : mainMenuKeyboard();
  if (edit) await ctx.editMessageText(text, { reply_markup: markup });
  else await ctx.reply(text, { reply_markup: markup });
  if (user) await getUser(user.id);
}

composer.command("start", async (ctx) => home(ctx));

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await home(ctx, true);
});

export default composer;
