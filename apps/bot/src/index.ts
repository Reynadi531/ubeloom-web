import "varlock/auto-load";

import { createDb } from "@web-kwu/db";
import { createStorage } from "@web-kwu/storage";

import { parseAdmins, resolveAdmins } from "./admins";
import { COMMANDS, createBot } from "./commands";
import { ENV } from "./env";
import { createNotifier } from "./notifier";
import { pendingPayments } from "./queries";
import { createTelegram } from "./telegram";

const chatIds = (ENV.TELEGRAM_CHAT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const dashboardUrl = ENV.DASHBOARD_URL.replace(/\/+$/, "");

const db = createDb(ENV);
const telegram = createTelegram(ENV.TELEGRAM_BOT_TOKEN);
const storage =
  ENV.S3_ENDPOINT && ENV.S3_ACCESS_KEY_ID && ENV.S3_SECRET_ACCESS_KEY
    ? createStorage({
        S3_ENDPOINT: ENV.S3_ENDPOINT,
        S3_REGION: ENV.S3_REGION,
        S3_ACCESS_KEY_ID: ENV.S3_ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: ENV.S3_SECRET_ACCESS_KEY,
        S3_BUCKET: ENV.S3_BUCKET,
      })
    : null;

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[bot] ${signal} received, stopping`);
    controller.abort();
    void db.$client.end().finally(() => process.exit(0));
  });
}

if (chatIds.length === 0) {
  console.warn("[bot] TELEGRAM_CHAT_IDS is empty; send /start to the bot to get a chat id");
}
if (!storage) console.warn("[bot] S3 not configured; payment proofs are not attached");

const admins = await resolveAdmins(db, parseAdmins(ENV.TELEGRAM_ADMINS));
if (admins.size === 0) {
  console.warn("[bot] TELEGRAM_ADMINS is empty; buttons that change data are disabled");
}

await telegram.setMyCommands(COMMANDS).catch((error) => {
  console.error("[bot] setMyCommands failed", error);
});

const notifier = createNotifier({ db, telegram, storage, chatIds, dashboardUrl });
await notifier.prime();

// Proofs submitted while the bot was down are not pushed one by one; point at the queue instead.
const pending = await pendingPayments(db);
if (pending.length > 0) {
  for (const chatId of chatIds) {
    await telegram
      .sendMessage(
        chatId,
        `🤖 Bot aktif. Ada <b>${pending.length}</b> pembayaran menunggu verifikasi — ketik /pending.`,
      )
      .catch((error) => console.error(`[bot] startup message → ${chatId} failed`, error));
  }
}

console.log(
  `[bot] running · ${chatIds.length} chat(s) · ${admins.size} admin(s) · poll every ${ENV.POLL_INTERVAL_SECONDS}s`,
);
const bot = createBot({ db, telegram, storage, chatIds, admins, dashboardUrl });
await Promise.all([
  notifier.run(ENV.POLL_INTERVAL_SECONDS * 1000, controller.signal),
  bot.run(controller.signal),
]);
