import type { Database } from "@web-kwu/db";
import { order, orderEvent } from "@web-kwu/db/schema/shop";
import { and, eq } from "drizzle-orm";

import { type FulfillmentStatus, canTransition } from "./rules";

/** Steps that hand the order over; they are logged as "handover" events. */
const handoverSteps: FulfillmentStatus[] = ["picked_up", "in_transit", "delivered"];

/**
 * Moves an order one fulfillment step. `from` is the status the admin saw; the
 * update only applies while the order is still in it. Handing a delivery to the
 * courier (→ in_transit) requires the courier's name.
 */
export function transitionOrderFulfillment(
  db: Database,
  data: {
    orderId: string;
    from: FulfillmentStatus;
    to: FulfillmentStatus;
    handoverTo?: string;
    note?: string;
  },
  actorId: string,
) {
  const isHandover = handoverSteps.includes(data.to);
  const handoverTo = data.handoverTo?.trim() || undefined;
  const note = data.note?.trim() || undefined;
  if (data.to === "in_transit" && !handoverTo) {
    throw new Error("Isi nama kurir sebelum serah-terima.");
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ method: order.method, paymentStatus: order.paymentStatus })
      .from(order)
      .where(eq(order.id, data.orderId));
    if (!current) throw new Error("Pesanan tidak ditemukan.");
    if (!canTransition(current.method, current.paymentStatus, data.from, data.to)) {
      throw new Error(
        current.paymentStatus === "paid" || data.to === "cancelled"
          ? "Perubahan status ini tidak diizinkan."
          : "Pesanan belum lunas.",
      );
    }

    const updated = await tx
      .update(order)
      .set({ fulfillmentStatus: data.to })
      .where(
        and(
          eq(order.id, data.orderId),
          eq(order.fulfillmentStatus, data.from),
          // Payment must still be settled at write time (except for cancelling).
          data.to === "cancelled" ? undefined : eq(order.paymentStatus, "paid"),
        ),
      )
      .returning({ id: order.id });
    if (updated.length === 0) {
      throw new Error("Status pesanan sudah berubah. Muat ulang lalu coba lagi.");
    }

    await tx.insert(orderEvent).values({
      orderId: data.orderId,
      type: isHandover ? "handover" : "fulfillment_changed",
      fromStatus: data.from,
      toStatus: data.to,
      handoverTo,
      note,
      actorId,
    });

    return { id: data.orderId, status: data.to };
  });
}
