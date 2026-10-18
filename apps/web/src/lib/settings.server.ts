import { shopSetting } from "@web-kwu/db/schema/shop";
import { eq } from "drizzle-orm";

import { db } from "@/services";

const SETTINGS_ID = "default";

export type ShopSettings = Pick<
  typeof shopSetting.$inferSelect,
  "brandName" | "qrisMerchantName" | "paymentMethods" | "invoiceMemo"
>;

/** Business details; column defaults apply until an admin saves Pengaturan. */
export async function getShopSettings(): Promise<ShopSettings> {
  const [row] = await db.select().from(shopSetting).where(eq(shopSetting.id, SETTINGS_ID)).limit(1);
  if (row) return row;
  const [defaults] = await db
    .insert(shopSetting)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  return defaults ?? getShopSettings();
}

export async function saveShopSettings(input: ShopSettings, actorId: string) {
  const values = { ...input, updatedById: actorId };
  await db
    .insert(shopSetting)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: shopSetting.id, set: values });
}
