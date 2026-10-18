/**
 * Seeds the shop catalog: products, batches, pickup slots and delivery zones.
 * Orders, payments, invoices and draws are never seeded; they only come from
 * real checkout and admin activity.
 *
 *   bun run db:seed:shop           # skips when batch "Oktober 2026" exists
 *   bun run db:seed:shop --reset   # wipes all shop tables (not auth) and reseeds
 */
import "varlock/auto-load";

import { createDb } from "@web-kwu/db";
import {
  batch,
  batchProduct,
  deliveryZone,
  draw,
  drawPrize,
  drawWinner,
  invoice,
  order,
  orderEvent,
  orderItem,
  paymentAttempt,
  pickupSlot,
  product,
  type ProductDisplay,
} from "@web-kwu/db/schema/shop";
import { eq } from "drizzle-orm";

import { ENV } from "../src/env";

const ACTIVE_BATCH_NAME = "Oktober 2026";
const reset = process.argv.includes("--reset");

if (reset && ENV.NODE_ENV === "production") {
  throw new Error("--reset wipes every shop table; refusing to run with NODE_ENV=production");
}

// ---------------------------------------------------------------------------
// Helpers

/** Parses a WIB wall-clock time, e.g. wib("2026-10-16T09:46"). */
const wib = (value: string) => new Date(`${value}:00+07:00`);

// ---------------------------------------------------------------------------
// Catalog

const pickupOrDelivery = {
  icon: "map-pin",
  title: "Ambil atau kirim",
  description:
    "Pilih pickup di Kampus ubeloom atau delivery ke alamatmu. Area dan ongkir tampil saat checkout.",
} as const;

const lumpiaDisplay: ProductDisplay = {
  collection: "MENU FAVORIT  /  PREORDER DIBUKA",
  story:
    "Lumpia ubi hangat dengan kulit keemasan yang garing dan isian ubi manis nan lembut. Cocok untuk jeda sore, berbagi dengan teman, atau dinikmati sendiri—kami tidak menghakimi.",
  variant: "Original · isian ubi manis · 1 kotak",
  highlights: [
    { icon: "sparkles", title: "Baru digoreng", note: "Nikmati selagi hangat" },
    { icon: "package", title: "Per porsi", note: "Siap untuk dibawa" },
  ],
  detailsTitle: "Sedikit detail, banyak alasan untuk suka.",
  facts: [
    {
      icon: "chef-hat",
      title: "Dibuat untuk dinikmati hangat",
      description:
        "Kulit lumpia yang renyah bertemu isian ubi manis lembut. Paling nikmat segera setelah diterima.",
    },
    {
      icon: "heart",
      title: "Info bahan & alergen",
      description:
        "Mengandung bahan olahan ubi. Untuk pertanyaan bahan dan alergen, hubungi kami sebelum preorder.",
    },
    pickupOrDelivery,
  ],
};

const sparklingDisplay: ProductDisplay = {
  collection: "MINUMAN SEGAR  /  PREORDER DIBUKA",
  story:
    "Belimbing, chia seed, air soda, dan es dalam satu gelas yang menyegarkan. Perpaduan rasa buah dan sensasi soda yang pas untuk menemani jeda siangmu.",
  variant: "Dengan chia seed · minuman bersoda",
  highlights: [
    { icon: "snowflake", title: "Sajikan dingin", note: "Paling segar dengan es" },
    { icon: "cup-soda", title: "Per gelas", note: "Siap dibawa pergi" },
  ],
  detailsTitle: "Kesegaran kecil untuk harimu.",
  facts: [
    {
      icon: "snowflake",
      title: "Nikmati selagi dingin",
      description:
        "Belimbing dan chia seed dalam soda yang menyegarkan. Sajikan dingin dan konsumsi pada hari yang sama.",
    },
    {
      icon: "heart",
      title: "Bahan & alergen",
      description:
        "Belimbing, chia seed, air soda, dan es. Konfirmasi informasi alergen sebelum rilis.",
    },
    pickupOrDelivery,
  ],
};

const catalogCreatedAt = wib("2026-09-01T09:00");

const productRows = [
  {
    id: crypto.randomUUID(),
    slug: "lumpia-ubi-goreng",
    code: "PRD-001",
    name: "Lumpia Ubi Goreng",
    category: "camilan",
    unit: "porsi",
    price: 28_000,
    tagline: "Renyah di luar, lembut manis di dalam.",
    description:
      "Lumpia ubi hangat dengan kulit keemasan yang garing dan isian ubi manis nan lembut. Cocok untuk jeda sore, berbagi dengan teman, atau dinikmati sendiri.",
    serving: "Terbaik disantap hangat",
    allergen: "Konfirmasi sebelum rilis",
    imageUrl: "/images/lumpia-ubi-goreng.webp",
    imageWideUrl: null,
    display: lumpiaDisplay,
    published: true,
    sortOrder: 1,
    createdAt: catalogCreatedAt,
    updatedAt: catalogCreatedAt,
  },
  {
    id: crypto.randomUUID(),
    slug: "sparkling-starfruit",
    code: "PRD-002",
    name: "Sparkling Starfruit",
    category: "minuman",
    unit: "cup",
    price: 16_000,
    tagline: "Segar bergelembung, manis asam belimbing.",
    description:
      "Belimbing, chia seed, air soda dan es dalam satu cup. Teman segar untuk lumpia hangat di siang hari.",
    serving: "Sajikan dingin, konsumsi hari yang sama",
    allergen: "Konfirmasi sebelum rilis",
    imageUrl: "/images/sparkling-starfruit.webp",
    imageWideUrl: "/images/sparkling-starfruit-wide.webp",
    display: sparklingDisplay,
    published: true,
    sortOrder: 2,
    createdAt: catalogCreatedAt,
    updatedAt: catalogCreatedAt,
  },
] satisfies (typeof product.$inferInsert)[];

type ProductKey = "lumpia" | "sparkling";
const productByKey: Record<ProductKey, (typeof productRows)[number]> = {
  lumpia: productRows[0],
  sparkling: productRows[1],
};

// ---------------------------------------------------------------------------
// Batches

type BatchSetup = {
  row: typeof batch.$inferInsert & { id: string };
  /** Batch price per product (null = product price) and capacity. */
  products: Record<ProductKey, { price: number | null; capacity: number }>;
  slots: (typeof pickupSlot.$inferInsert & { id: string })[];
  zones: (typeof deliveryZone.$inferInsert & { id: string; fee: number })[];
};

function makeBatch(input: {
  name: string;
  status: "open" | "closed";
  month: string;
  products: BatchSetup["products"];
  slotDay: string;
  zoneDays: [string, string];
  slotCapacity: number;
}): BatchSetup {
  const id = crypto.randomUUID();
  const { month } = input;
  return {
    row: {
      id,
      name: input.name,
      status: input.status,
      opensAt: wib(`${month}-16T00:00`),
      closesAt: wib(`${month}-22T20:00`),
      paymentCutoffAt: wib(`${month}-23T20:00`),
      pickupLocation: "Kampus Telkom, Bandung",
      createdAt: wib(`${month}-10T10:00`),
      updatedAt: wib(`${month}-10T10:00`),
    },
    products: input.products,
    slots: [
      ["10:00", "12:00"],
      ["13:00", "15:00"],
    ].map(([start, end]) => ({
      id: crypto.randomUUID(),
      batchId: id,
      startsAt: wib(`${input.slotDay}T${start}`),
      endsAt: wib(`${input.slotDay}T${end}`),
      capacity: input.slotCapacity,
    })),
    zones: [
      {
        id: crypto.randomUUID(),
        batchId: id,
        name: "Bandung kota",
        windowStartsAt: wib(`${input.zoneDays[0]}T13:00`),
        windowEndsAt: wib(`${input.zoneDays[0]}T16:00`),
        fee: 8_000,
      },
      {
        id: crypto.randomUUID(),
        batchId: id,
        name: "Sekitar kampus",
        windowStartsAt: wib(`${input.zoneDays[1]}T09:00`),
        windowEndsAt: wib(`${input.zoneDays[1]}T12:00`),
        fee: 5_000,
      },
    ],
  };
}

const october = makeBatch({
  name: ACTIVE_BATCH_NAME,
  status: "open",
  month: "2026-10",
  products: {
    lumpia: { price: null, capacity: 200 },
    sparkling: { price: null, capacity: 150 },
  },
  slotDay: "2026-10-24",
  zoneDays: ["2026-10-24", "2026-10-25"],
  slotCapacity: 50,
});

const september = makeBatch({
  name: "September 2026",
  status: "closed",
  month: "2026-09",
  products: {
    lumpia: { price: 25_000, capacity: 150 },
    sparkling: { price: null, capacity: 100 },
  },
  slotDay: "2026-09-26",
  zoneDays: ["2026-09-26", "2026-09-27"],
  slotCapacity: 40,
});

// ---------------------------------------------------------------------------
// Run

const db = createDb(ENV);
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function wipeShopTables(tx: Tx) {
  // Children first; auth tables and shop settings are untouched.
  for (const table of [
    drawWinner,
    drawPrize,
    draw,
    invoice,
    paymentAttempt,
    orderEvent,
    orderItem,
    order,
    pickupSlot,
    deliveryZone,
    batchProduct,
    batch,
    product,
  ]) {
    await tx.delete(table);
  }
}

async function seed(tx: Tx) {
  await tx.insert(product).values(productRows);

  for (const setup of [september, october]) {
    await tx.insert(batch).values(setup.row);
    await tx.insert(batchProduct).values(
      (["lumpia", "sparkling"] as const).map((key) => ({
        batchId: setup.row.id,
        productId: productByKey[key].id,
        price: setup.products[key].price,
        capacity: setup.products[key].capacity,
      })),
    );
    await tx.insert(pickupSlot).values(setup.slots);
    await tx.insert(deliveryZone).values(setup.zones);
  }
}

try {
  const [existing] = await db
    .select({ id: batch.id })
    .from(batch)
    .where(eq(batch.name, ACTIVE_BATCH_NAME))
    .limit(1);

  if (existing && !reset) {
    console.log(`skip (batch "${ACTIVE_BATCH_NAME}" already exists; use --reset to reseed)`);
  } else {
    await db.transaction(async (tx) => {
      if (reset) await wipeShopTables(tx);
      await seed(tx);
    });
    console.log(
      `${reset ? "reset and seeded" : "seeded"} shop catalog: ${productRows.length} products, 2 batches`,
    );
  }
} finally {
  await db.$client.end();
}
