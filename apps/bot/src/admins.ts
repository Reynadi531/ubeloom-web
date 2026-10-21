/**
 * Telegram users allowed to change data. Each maps to a dashboard account so
 * approvals and status changes are attributed to a real user in the audit trail.
 */
import type { Database } from "@web-kwu/db";

import { usersByEmail } from "./queries";

export type Admin = { userId: string; name: string };

/** Parses `TELEGRAM_ADMINS` ("123456789=admin@example.com,987654321=ops@example.com"). */
export function parseAdmins(value: string | undefined) {
  const entries = new Map<number, string>();
  for (const pair of (value ?? "").split(",")) {
    const [telegramId, email] = pair.split("=").map((part) => part.trim());
    if (!telegramId || !email) continue;
    const id = Number(telegramId);
    if (!Number.isSafeInteger(id))
      throw new Error(`TELEGRAM_ADMINS: invalid user id "${telegramId}"`);
    entries.set(id, email.toLowerCase());
  }
  return entries;
}

export async function resolveAdmins(db: Database, entries: Map<number, string>) {
  const admins = new Map<number, Admin>();
  if (entries.size === 0) return admins;
  const users = await usersByEmail(db, [...entries.values()]);
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  for (const [telegramId, email] of entries) {
    const user = byEmail.get(email);
    if (!user) {
      console.warn(`[bot] TELEGRAM_ADMINS: no dashboard user with email ${email}; skipped`);
      continue;
    }
    admins.set(telegramId, { userId: user.id, name: user.name });
  }
  return admins;
}
