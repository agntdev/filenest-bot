import { inlineButton, inlineKeyboard } from "./toolkit/index.js";
import type { LibraryFile, LibraryMenu } from "./library.js";

export const homeKeyboard = (items: LibraryMenu[]) => inlineKeyboard([
  ...items.map((m) => [inlineButton(`${m.emoji} ${m.title}`.trim(), `menu:open:${m.id}`)]),
  [inlineButton("Search", "search:init"), inlineButton("Favorites", "favorites:list")],
]);
export const backHome = inlineKeyboard([[inlineButton("Home", "menu:home")]]);
export const fileLabel = (file: LibraryFile) => `${file.pinned ? "📌 " : ""}${file.title}`;
export const fileKeyboard = (file: LibraryFile, back: string) => inlineKeyboard([
  [inlineButton("Open file", `file:send:${file.id}`), inlineButton("Save favorite", `favorite:toggle:${file.id}`)],
  [inlineButton("Back", back), inlineButton("Home", "menu:home")],
]);
