import { defineRelationsPart, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull();

/** All money columns are whole rupiah. */
const rupiah = (name: string) => integer(name);

export const productCategory = pgEnum("product_category", ["camilan", "minuman"]);
export const productUnit = pgEnum("product_unit", ["porsi", "kotak", "cup"]);
export const batchStatus = pgEnum("batch_status", ["draft", "open", "closed", "archived"]);
export const fulfillmentMethod = pgEnum("fulfillment_method", ["pickup", "delivery"]);
/** Payment state of an order, driven by payment attempts. */
export const paymentStatus = pgEnum("payment_status", ["unpaid", "review", "paid"]);
/**
 * Fulfillment state of an order.
 * Pickup: pending → preparing → ready_pickup → picked_up.
 * Delivery: pending → preparing → ready_delivery → in_transit → delivered.
 */
export const fulfillmentStatus = pgEnum("fulfillment_status", [
  "pending",
  "preparing",
  "ready_pickup",
  "picked_up",
  "ready_delivery",
  "in_transit",
  "delivered",
  "cancelled",
]);
export const paymentAttemptStatus = pgEnum("payment_attempt_status", [
  "pending",
  "approved",
  "rejected",
]);
export const drawStatus = pgEnum("draw_status", ["draft", "frozen", "drawn"]);
/** Percentage off, or a rupiah cut. */
export const voucherDiscountType = pgEnum("voucher_discount_type", ["percentage", "fixed"]);
/** One discount on the whole subtotal, or an individual discount per product. */
export const voucherScope = pgEnum("voucher_scope", ["order", "products"]);

/**
 * Discount of one product in a `products`-scope voucher. A `fixed` value is cut from
 * every unit (never below Rp 0); a `percentage` applies to the line.
 */
export type VoucherItem = {
  productId: string;
  discountType: "percentage" | "fixed";
  value: number;
};

/** Icon keys the storefront product detail page can render. */
export type ProductIcon =
  | "sparkles"
  | "package"
  | "chef-hat"
  | "heart"
  | "map-pin"
  | "snowflake"
  | "cup-soda";

/** Storefront-only presentation content edited in the "Tampilan detail" tab. */
export type ProductDisplay = {
  collection: string;
  story: string;
  variant: string;
  highlights: { icon: ProductIcon; title: string; note: string }[];
  detailsTitle: string;
  facts: { icon: ProductIcon; title: string; description: string }[];
};

export const product = pgTable("product", {
  id: id(),
  slug: text("slug").notNull().unique(),
  /** Human code shown in admin, e.g. PRD-001. */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: productCategory("category").notNull(),
  unit: productUnit("unit").notNull(),
  /** Default list price; batches may override and orders snapshot it. */
  price: rupiah("price").notNull(),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  serving: text("serving").notNull().default(""),
  allergen: text("allergen").notNull().default(""),
  /**
   * Object storage keys of the product photos (served through /media), in display
   * order; the first is the cover used on catalog cards.
   */
  images: jsonb("images").$type<string[]>().notNull().default([]),
  display: jsonb("display").$type<ProductDisplay>(),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const batch = pgTable(
  "batch",
  {
    id: id(),
    /** Display name, e.g. "Oktober 2026". */
    name: text("name").notNull(),
    status: batchStatus("status").notNull().default("draft"),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    paymentCutoffAt: timestamp("payment_cutoff_at", { withTimezone: true }).notNull(),
    pickupLocation: text("pickup_location").notNull().default(""),
    /** Fulfillment methods customers may choose in this batch. */
    pickupEnabled: boolean("pickup_enabled").notNull().default(true),
    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("batch_status_idx").on(table.status)],
);

export const batchProduct = pgTable(
  "batch_product",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => batch.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
    /** Price for this batch; falls back to product.price when null. */
    price: rupiah("price"),
    /** Max units sellable in this batch; null = unlimited. */
    capacity: integer("capacity"),
    available: boolean("available").notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.batchId, table.productId] })],
);

export const pickupSlot = pgTable(
  "pickup_slot",
  {
    id: id(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batch.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Pickup point for this slot; empty falls back to the batch pickupLocation. */
    location: text("location").notNull().default(""),
    capacity: integer("capacity").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [index("pickup_slot_batch_idx").on(table.batchId)],
);

/**
 * Delivery window of a batch. Areas and their ongkir are shop-wide (shopSetting.deliveryRates);
 * a delivery order picks one area and one window serving that area.
 */
export const deliveryZone = pgTable(
  "delivery_zone",
  {
    id: id(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batch.id, { onDelete: "cascade" }),
    windowStartsAt: timestamp("window_starts_at", { withTimezone: true }).notNull(),
    windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
    /** Area names (from Pengaturan) this window serves; empty serves every area. */
    areas: jsonb("areas").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
  },
  (table) => [index("delivery_zone_batch_idx").on(table.batchId)],
);

/** Coupon code customers enter at checkout for a discount on products (never ongkir). */
export const voucher = pgTable(
  "voucher",
  {
    id: id(),
    /** Stored uppercase; customers type it case-insensitively. */
    code: text("code").notNull().unique(),
    /** Customer-facing summary shown once the code is applied, e.g. "Diskon 10% semua menu". */
    description: text("description").notNull().default(""),
    scope: voucherScope("scope").notNull().default("order"),
    /** Discount on the whole subtotal; set only when scope is `order`. */
    discountType: voucherDiscountType("discount_type"),
    /** Percent (1–100) for `percentage`; whole rupiah for `fixed`. Scope `order` only. */
    value: integer("value"),
    /** Per-product discounts; set only when scope is `products`. */
    items: jsonb("items").$type<VoucherItem[]>().notNull().default([]),
    /** Upper bound of the total discount; null = no cap. */
    maxDiscount: rupiah("max_discount"),
    /** Eligible subtotal (promo products only for scope `products`) needed to apply. */
    minSubtotal: rupiah("min_subtotal").notNull().default(0),
    /** Max orders that may use the voucher (cancelled orders free their use); null = unlimited. */
    quota: integer("quota"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("voucher_active_idx").on(table.active)],
);

export const order = pgTable(
  "order",
  {
    id: id(),
    /** Customer-facing invoice code, e.g. UBP-20261016-A7K9M2Q4. */
    invoiceNumber: text("invoice_number").notNull().unique(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batch.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    /** Unguessable secret behind the customer's private invoice link. */
    accessToken: text("access_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    method: fulfillmentMethod("method").notNull(),
    pickupSlotId: text("pickup_slot_id").references(() => pickupSlot.id, {
      onDelete: "set null",
    }),
    deliveryZoneId: text("delivery_zone_id").references(() => deliveryZone.id, {
      onDelete: "set null",
    }),
    /** Delivery area chosen at checkout, snapshotted from Pengaturan. */
    deliveryArea: text("delivery_area"),
    address: text("address"),
    /** Delivery recipient when someone other than the customer receives the package. */
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    /** Courier option chosen for delivery, snapshotted from Pengaturan. */
    courier: text("courier"),
    /** Free-form label, e.g. "Transfer bank · BCA", "QRIS", "Tunai". */
    paymentMethod: text("payment_method").notNull(),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    fulfillmentStatus: fulfillmentStatus("fulfillment_status").notNull().default("pending"),
    subtotal: rupiah("subtotal").notNull(),
    shippingFee: rupiah("shipping_fee").notNull().default(0),
    /** Voucher discount off the subtotal; total = subtotal − discount + shippingFee. */
    discount: rupiah("discount").notNull().default(0),
    voucherId: text("voucher_id").references(() => voucher.id, { onDelete: "set null" }),
    /** Code snapshot so invoices keep it after the voucher is edited or deleted. */
    voucherCode: text("voucher_code"),
    total: rupiah("total").notNull(),
    notes: text("notes"),
    /** Customer opted into the batch invoice draw. */
    drawOptIn: boolean("draw_opt_in").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("order_batch_idx").on(table.batchId),
    index("order_payment_status_idx").on(table.paymentStatus),
    index("order_fulfillment_status_idx").on(table.fulfillmentStatus),
    index("order_voucher_idx").on(table.voucherId),
  ],
);

export const orderItem = pgTable(
  "order_item",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    /** Snapshots so later product edits never change past invoices. */
    productName: text("product_name").notNull(),
    unitPrice: rupiah("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: rupiah("line_total").notNull(),
  },
  (table) => [index("order_item_order_idx").on(table.orderId)],
);

/** Formal invoice document issued for an order (Buat invoice page). */
export const invoice = pgTable(
  "invoice",
  {
    id: id(),
    /** e.g. INV-2026-0048, sequential per year. */
    number: text("number").notNull().unique(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    issuedOn: timestamp("issued_on", { withTimezone: true }).notNull(),
    dueOn: timestamp("due_on", { withTimezone: true }).notNull(),
    memo: text("memo").notNull().default(""),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("invoice_order_idx").on(table.orderId)],
);

export const paymentAttempt = pgTable(
  "payment_attempt",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    /** 1-based attempt counter per order. */
    attempt: integer("attempt").notNull(),
    claimedAmount: rupiah("claimed_amount").notNull(),
    claimedPaidAt: timestamp("claimed_paid_at", { withTimezone: true }).notNull(),
    /** Reference the customer typed or that appears on their proof. */
    customerReference: text("customer_reference").notNull(),
    proofUrl: text("proof_url"),
    /** Object storage key of a customer-uploaded proof (private bucket, served presigned). */
    proofKey: text("proof_key"),
    status: paymentAttemptStatus("status").notNull().default("pending"),
    /** Merchant-side mutation reference entered by the reviewer on approval. */
    merchantReference: text("merchant_reference"),
    reviewNote: text("review_note"),
    reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("payment_attempt_order_idx").on(table.orderId),
    index("payment_attempt_status_idx").on(table.status),
    uniqueIndex("payment_attempt_order_attempt_idx").on(table.orderId, table.attempt),
  ],
);

/** Audit trail of status changes and handovers on an order. */
export const orderEvent = pgTable(
  "order_event",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    /** e.g. "created", "payment_approved", "payment_rejected", "fulfillment_changed", "handover". */
    type: text("type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    /** Courier / recipient name for handovers. */
    handoverTo: text("handover_to"),
    proofUrl: text("proof_url"),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("order_event_order_idx").on(table.orderId)],
);

export const draw = pgTable("draw", {
  id: id(),
  batchId: text("batch_id")
    .notNull()
    .unique()
    .references(() => batch.id, { onDelete: "cascade" }),
  status: drawStatus("status").notNull().default("draft"),
  entryRule: text("entry_rule").notNull(),
  verificationDeadline: timestamp("verification_deadline", { withTimezone: true }).notNull(),
  claimDeadline: timestamp("claim_deadline", { withTimezone: true }).notNull(),
  maxWinners: integer("max_winners").notNull().default(10),
  /** Bumped every time rules or prizes change while in draft. */
  rulesVersion: integer("rules_version").notNull().default(1),
  /** Invoice numbers frozen as the eligible pool. */
  frozenPool: jsonb("frozen_pool").$type<string[]>(),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  drawnAt: timestamp("drawn_at", { withTimezone: true }),
  drawnById: text("drawn_by_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const drawPrize = pgTable(
  "draw_prize",
  {
    id: id(),
    drawId: text("draw_id")
      .notNull()
      .references(() => draw.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("draw_prize_draw_idx").on(table.drawId)],
);

export const drawWinner = pgTable(
  "draw_winner",
  {
    id: id(),
    drawId: text("draw_id")
      .notNull()
      .references(() => draw.id, { onDelete: "cascade" }),
    prizeId: text("prize_id").references(() => drawPrize.id, { onDelete: "set null" }),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("draw_winner_draw_order_idx").on(table.drawId, table.orderId),
    uniqueIndex("draw_winner_draw_position_idx").on(table.drawId, table.position),
  ],
);

/** Delivery area customers can choose and its ongkir. */
export type DeliveryRate = { area: string; fee: number };

/** Courier customers can pick for delivery; its fee is added on top of the area ongkir. */
export type CourierOption = { name: string; fee: number };

/**
 * Singleton row (id "default") of business details shown on invoices, payment
 * review and checkout. Edited from Pengaturan in the dashboard.
 */
export const shopSetting = pgTable("shop_setting", {
  id: text("id").primaryKey().default("default"),
  /** Brand printed on invoices. */
  brandName: text("brand_name").notNull().default("ubeloom"),
  /** Merchant name customers must match in their QRIS app; empty until configured. */
  qrisMerchantName: text("qris_merchant_name").notNull().default(""),
  /** Object key of the QRIS code image (`qris/<uuid>.<ext>`); null until uploaded. */
  qrisImageKey: text("qris_image_key"),
  /** Non-cash payment methods offered on manual orders, e.g. "Transfer bank · BCA". */
  paymentMethods: jsonb("payment_methods").$type<string[]>().notNull().default(["QRIS"]),
  /** Delivery areas and their ongkir, offered in every batch's delivery windows. */
  deliveryRates: jsonb("delivery_rates").$type<DeliveryRate[]>().notNull().default([]),
  /** Courier options for delivery; empty means no courier choice and no extra fee. */
  couriers: jsonb("couriers").$type<CourierOption[]>().notNull().default([]),
  /** Closing note printed on issued invoices. */
  invoiceMemo: text("invoice_memo").notNull().default(""),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const shopRelations = defineRelationsPart(
  {
    user,
    product,
    batch,
    batchProduct,
    pickupSlot,
    deliveryZone,
    order,
    orderItem,
    invoice,
    paymentAttempt,
    orderEvent,
    draw,
    drawPrize,
    drawWinner,
    voucher,
  },
  (r) => ({
    product: {
      batchProducts: r.many.batchProduct({ from: r.product.id, to: r.batchProduct.productId }),
    },
    batch: {
      batchProducts: r.many.batchProduct({ from: r.batch.id, to: r.batchProduct.batchId }),
      pickupSlots: r.many.pickupSlot({ from: r.batch.id, to: r.pickupSlot.batchId }),
      deliveryZones: r.many.deliveryZone({ from: r.batch.id, to: r.deliveryZone.batchId }),
      orders: r.many.order({ from: r.batch.id, to: r.order.batchId }),
      draw: r.one.draw({ from: r.batch.id, to: r.draw.batchId }),
    },
    batchProduct: {
      batch: r.one.batch({ from: r.batchProduct.batchId, to: r.batch.id, optional: false }),
      product: r.one.product({
        from: r.batchProduct.productId,
        to: r.product.id,
        optional: false,
      }),
    },
    pickupSlot: {
      batch: r.one.batch({ from: r.pickupSlot.batchId, to: r.batch.id, optional: false }),
      orders: r.many.order({ from: r.pickupSlot.id, to: r.order.pickupSlotId }),
    },
    deliveryZone: {
      batch: r.one.batch({ from: r.deliveryZone.batchId, to: r.batch.id, optional: false }),
      orders: r.many.order({ from: r.deliveryZone.id, to: r.order.deliveryZoneId }),
    },
    order: {
      batch: r.one.batch({ from: r.order.batchId, to: r.batch.id, optional: false }),
      pickupSlot: r.one.pickupSlot({ from: r.order.pickupSlotId, to: r.pickupSlot.id }),
      deliveryZone: r.one.deliveryZone({ from: r.order.deliveryZoneId, to: r.deliveryZone.id }),
      items: r.many.orderItem({ from: r.order.id, to: r.orderItem.orderId }),
      invoices: r.many.invoice({ from: r.order.id, to: r.invoice.orderId }),
      paymentAttempts: r.many.paymentAttempt({ from: r.order.id, to: r.paymentAttempt.orderId }),
      events: r.many.orderEvent({ from: r.order.id, to: r.orderEvent.orderId }),
      createdBy: r.one.user({ from: r.order.createdById, to: r.user.id }),
      voucher: r.one.voucher({ from: r.order.voucherId, to: r.voucher.id }),
    },
    voucher: {
      orders: r.many.order({ from: r.voucher.id, to: r.order.voucherId }),
    },
    orderItem: {
      order: r.one.order({ from: r.orderItem.orderId, to: r.order.id, optional: false }),
      product: r.one.product({ from: r.orderItem.productId, to: r.product.id }),
    },
    invoice: {
      order: r.one.order({ from: r.invoice.orderId, to: r.order.id, optional: false }),
    },
    paymentAttempt: {
      order: r.one.order({ from: r.paymentAttempt.orderId, to: r.order.id, optional: false }),
      reviewedBy: r.one.user({ from: r.paymentAttempt.reviewedById, to: r.user.id }),
    },
    orderEvent: {
      order: r.one.order({ from: r.orderEvent.orderId, to: r.order.id, optional: false }),
      actor: r.one.user({ from: r.orderEvent.actorId, to: r.user.id }),
    },
    draw: {
      batch: r.one.batch({ from: r.draw.batchId, to: r.batch.id, optional: false }),
      prizes: r.many.drawPrize({ from: r.draw.id, to: r.drawPrize.drawId }),
      winners: r.many.drawWinner({ from: r.draw.id, to: r.drawWinner.drawId }),
    },
    drawPrize: {
      draw: r.one.draw({ from: r.drawPrize.drawId, to: r.draw.id, optional: false }),
    },
    drawWinner: {
      draw: r.one.draw({ from: r.drawWinner.drawId, to: r.draw.id, optional: false }),
      prize: r.one.drawPrize({ from: r.drawWinner.prizeId, to: r.drawPrize.id }),
      order: r.one.order({ from: r.drawWinner.orderId, to: r.order.id, optional: false }),
    },
  }),
);
