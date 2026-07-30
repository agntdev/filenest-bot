import { resolveSessionStorage } from "./toolkit/session/redis.js";

export type MediaKind = "document" | "audio" | "video" | "photo";

export interface LibraryUser {
  id: number;
  favorites: number[];
  lastOpenedMenu?: number;
  activityTimestamps: string[];
}
export interface LibraryMenu {
  id: number;
  parentId?: number;
  title: string;
  description: string;
  emoji: string;
  order: number;
}
export interface LibraryFile {
  id: number;
  menuId: number;
  telegramFileId: string;
  title: string;
  description: string;
  fileType: MediaKind;
  size?: number;
  duration?: number;
  pinned: boolean;
  views: number;
  uploadedAt: string;
}
export interface Activity { userId: number; fileId: number; action: "view" | "download"; timestamp: string }
interface Index { nextMenuId: number; nextFileId: number; menuIds: number[]; fileIds: number[]; userIds: number[]; activity: Activity[] }

// The adapter is Redis-backed whenever the toolkit has REDIS_URL configured.
// Its isolated fallback is used only by the tokenless local harness.
const storage = resolveSessionStorage<Record<string, unknown>>(undefined);
const key = (name: string) => `library:${name}`;
const read = async <T>(name: string): Promise<T | undefined> => storage.read(key(name)) as Promise<T | undefined>;
const write = async <T>(name: string, value: T): Promise<void> => storage.write(key(name), value as Record<string, unknown>);
const initialIndex = (): Index => ({ nextMenuId: 1, nextFileId: 1, menuIds: [], fileIds: [], userIds: [], activity: [] });
async function index(): Promise<Index> { return (await read<Index>("index")) ?? initialIndex(); }
async function saveIndex(value: Index): Promise<void> { await write("index", value); }

let clock: () => Date = () => new Date();
export const now = (): Date => clock();
export const setClockForTests = (next?: () => Date): void => { clock = next ?? (() => new Date()); };

export async function getUser(id: number): Promise<LibraryUser> {
  const found = await read<LibraryUser>(`user:${id}`);
  if (found) return found;
  const user: LibraryUser = { id, favorites: [], activityTimestamps: [] };
  const i = await index();
  if (!i.userIds.includes(id)) { i.userIds.push(id); await saveIndex(i); }
  await write(`user:${id}`, user);
  return user;
}
export async function saveUser(user: LibraryUser): Promise<void> { await write(`user:${user.id}`, user); }
export async function menus(parentId?: number): Promise<LibraryMenu[]> {
  const i = await index();
  const values = await Promise.all(i.menuIds.map((id) => read<LibraryMenu>(`menu:${id}`)));
  return values.filter((m): m is LibraryMenu => !!m && m.parentId === parentId).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
export async function menuById(id: number): Promise<LibraryMenu | undefined> { return read<LibraryMenu>(`menu:${id}`); }
export async function createMenu(input: Omit<LibraryMenu, "id" | "order">): Promise<LibraryMenu> {
  const i = await index();
  const siblings = await menus(input.parentId);
  const menu: LibraryMenu = { ...input, id: i.nextMenuId++, order: siblings.length };
  i.menuIds.push(menu.id); await write(`menu:${menu.id}`, menu); await saveIndex(i); return menu;
}
export async function deleteMenu(id: number): Promise<boolean> {
  const menu = await menuById(id); if (!menu) return false;
  if ((await menus(id)).length || (await filesInMenu(id)).length) return false;
  const i = await index(); i.menuIds = i.menuIds.filter((x) => x !== id); await storage.delete(key(`menu:${id}`)); await saveIndex(i); return true;
}
export async function filesInMenu(menuId: number): Promise<LibraryFile[]> {
  const i = await index(); const values = await Promise.all(i.fileIds.map((id) => read<LibraryFile>(`file:${id}`)));
  return values.filter((f): f is LibraryFile => !!f && f.menuId === menuId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title));
}
export async function fileById(id: number): Promise<LibraryFile | undefined> { return read<LibraryFile>(`file:${id}`); }
export async function createFile(input: Omit<LibraryFile, "id" | "views" | "uploadedAt" | "pinned">): Promise<LibraryFile> {
  const i = await index(); const file: LibraryFile = { ...input, id: i.nextFileId++, views: 0, pinned: false, uploadedAt: now().toISOString() };
  i.fileIds.push(file.id); await write(`file:${file.id}`, file); await saveIndex(i); return file;
}
export async function saveFile(file: LibraryFile): Promise<void> { await write(`file:${file.id}`, file); }
export async function searchFiles(term: string): Promise<LibraryFile[]> {
  const q = term.trim().toLocaleLowerCase(); if (!q) return [];
  const i = await index(); const values = await Promise.all(i.fileIds.map((id) => read<LibraryFile>(`file:${id}`)));
  return values.filter((f): f is LibraryFile => !!f && f.title.toLocaleLowerCase().includes(q)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title));
}
export async function recordActivity(userId: number, fileId: number, action: Activity["action"]): Promise<void> {
  const i = await index(); const timestamp = now().toISOString(); i.activity.push({ userId, fileId, action, timestamp }); i.activity = i.activity.slice(-500);
  const user = await getUser(userId); user.activityTimestamps = [...user.activityTimestamps, timestamp].slice(-100); await saveUser(user); await saveIndex(i);
}
export async function analytics(): Promise<{ files: LibraryFile[]; menus: LibraryMenu[]; activity: Activity[] }> {
  const i = await index(); const [allFiles, allMenus] = await Promise.all([Promise.all(i.fileIds.map((id) => fileById(id))), Promise.all(i.menuIds.map((id) => menuById(id)))]);
  return { files: allFiles.filter((f): f is LibraryFile => !!f), menus: allMenus.filter((m): m is LibraryMenu => !!m), activity: i.activity };
}
export async function allUsers(): Promise<LibraryUser[]> { const i = await index(); const users = await Promise.all(i.userIds.map(getUser)); return users; }
