import { afterEach, describe, expect, it } from "vitest";
import { buildBot } from "../src/bot.js";
import { formatSuiteResult, parseBotSpec, runSpecs } from "../src/toolkit/index.js";

const originalAdminId = process.env.ADMIN_ID;

afterEach(() => {
  if (originalAdminId === undefined) delete process.env.ADMIN_ID;
  else process.env.ADMIN_ID = originalAdminId;
});

describe("broadcast authorization", () => {
  it("shows Broadcast only in an admin panel and lets the configured admin send", async () => {
    process.env.ADMIN_ID = "1";
    const suite = await runSpecs(() => buildBot("test-token"), [
      parseBotSpec({
        name: "configured admin completes a broadcast",
        steps: [
          {
            send: { text: "/start", userId: 99 },
            expect: [{
              method: "sendMessage",
              payload: {
                text: "No library sections are available yet. Use Search when files are added.",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "Search", callback_data: "search:init" },
                      { text: "Favorites", callback_data: "favorites:list" },
                    ],
                    [{ text: "❓ Help", callback_data: "menu:help" }],
                  ],
                },
              },
            }],
          },
          {
            send: { text: "/admin", userId: 1 },
            expect: [{
              method: "sendMessage",
              payload: {
                text: "Library controls:",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "Upload files", callback_data: "admin:upload" }],
                    [
                      { text: "Create section", callback_data: "admin:menu:new" },
                      { text: "Delete section", callback_data: "admin:menu:delete" },
                    ],
                    [
                      { text: "Manage files", callback_data: "admin:files" },
                      { text: "Analytics", callback_data: "analytics:summary" },
                    ],
                    [{ text: "Broadcast", callback_data: "admin:broadcast" }],
                    [{ text: "Home", callback_data: "menu:home" }],
                  ],
                },
              },
            }],
          },
          {
            send: { callback: "admin:broadcast", userId: 1 },
            expect: [{
              method: "editMessageText",
              payload: { text: "Send the announcement text. It will go only to people who have started this bot." },
            }],
          },
          {
            send: { text: "Library maintenance tonight.", userId: 1 },
            expect: [{
              method: "sendMessage",
              payload: { text: "Announcement sent to 1 people." },
            }],
          },
        ],
      }),
    ]);
    expect(suite.failed, "\n" + formatSuiteResult(suite)).toBe(0);
  });
});
