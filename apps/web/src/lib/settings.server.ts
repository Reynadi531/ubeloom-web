import { shopSetting } from "@web-kwu/db/schema/shop";
import { eq } from "drizzle-orm";

import { db } from "@/services";

const SETTINGS_ID = "default";

export type ShopSettings = Pick<
  typeof shopSetting.$inferSelect,
  | "brandName"
  | "qrisMerchantName"
  | "qrisImageKey"
  | "paymentMethods"
  | "deliveryRates"
  | "couriers"
  | "invoiceMemo"
>;

/** Fields saved by the Pengaturan form; the QRIS image has its own upload flow. */
export type ShopSettingsForm = Omit<ShopSettings, "qrisImageKey">;

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

export async function saveShopSettings(input: ShopSettingsForm, actorId: string) {
  const values = { ...input, updatedById: actorId };
  await db
    .insert(shopSetting)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: shopSetting.id, set: values });
}

/**
 * Points the shop at a new QRIS image (or none) and returns the key it replaced,
 * so the caller can delete that object once this has committed.
 */
export async function replaceQrisImage(key: string | null, actorId: string) {
  return db.transaction(async (tx) => {
    await tx.insert(shopSetting).values({ id: SETTINGS_ID }).onConflictDoNothing();
    const [current] = await tx
      .select({ qrisImageKey: shopSetting.qrisImageKey })
      .from(shopSetting)
      .where(eq(shopSetting.id, SETTINGS_ID))
      .for("update");
    await tx
      .update(shopSetting)
      .set({ qrisImageKey: key, updatedById: actorId })
      .where(eq(shopSetting.id, SETTINGS_ID));
    return current?.qrisImageKey ?? null;
  });
}
