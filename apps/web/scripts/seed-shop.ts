/**
 * Seeds the shop domain (products, batches, orders, payments, draws) with the
 * sample data the admin pages were designed with.
 *
 *   bun run db:seed:shop           # skips when batch "Oktober 2026" exists
 *   bun run db:seed:shop --reset   # wipes all shop tables (not auth) and reseeds
 *
 * Filler orders come from a seeded PRNG, so every run produces the same data.
 */
import "varlock/auto-load";

import { createDb } from "@web-kwu/db";
import { user } from "@web-kwu/db/schema/auth";
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
import { asc, eq } from "drizzle-orm";

import type { FulfillmentMethod, FulfillmentStatus, PaymentStatus } from "../src/lib/orders";
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
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/** mulberry32: small deterministic PRNG. */
function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const shuffle = <T>(items: readonly T[]) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const swap = Math.floor(next() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  };
  return { next, int, pick, shuffle };
}

const rng = createRng(20_261_016);

const INVOICE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const usedInvoiceNumbers = new Set<string>();
const usedReferences = new Set<string>();

function claimUnique(set: Set<string>, value: string) {
  if (set.has(value)) throw new Error(`duplicate seed value ${value}`);
  set.add(value);
  return value;
}

function fillerInvoiceNumber(createdAt: Date) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })
    .format(createdAt)
    .replaceAll("-", "");
  for (;;) {
    const suffix = Array.from({ length: 8 }, () => rng.pick([...INVOICE_ALPHABET])).join("");
    const value = `UBP-${date}-${suffix}`;
    if (!usedInvoiceNumbers.has(value)) return claimUnique(usedInvoiceNumbers, value);
  }
}

function fillerReference(prefix: string) {
  for (;;) {
    const value = `${prefix}-${rng.int(900_000, 999_999)}`;
    if (!usedReferences.has(value)) return claimUnique(usedReferences, value);
  }
}

const phonePrefixes = ["0812", "0813", "0821", "0822", "0852", "0857", "0878", "0881", "0896"];
const fillerPhone = () =>
  `${rng.pick(phonePrefixes)}${Array.from({ length: 8 }, () => rng.int(0, 9)).join("")}`;

const firstNames = [
  "Alya",
  "Bagas",
  "Citra",
  "Dimas",
  "Eka",
  "Farhan",
  "Gita",
  "Hana",
  "Ilham",
  "Intan",
  "Joko",
  "Kirana",
  "Laras",
  "Maya",
  "Nadia",
  "Naufal",
  "Oki",
  "Putri",
  "Raka",
  "Reza",
  "Salsa",
  "Tegar",
  "Tiara",
  "Umar",
  "Vina",
  "Wulan",
  "Yoga",
  "Zahra",
  "Annisa",
  "Bayu",
  "Dinda",
  "Fikri",
  "Galih",
  "Hesti",
  "Indah",
  "Kevin",
  "Lutfi",
  "Mira",
  "Nisa",
  "Rizky",
  "Sekar",
  "Taufik",
  "Yuni",
  "Agus",
  "Bella",
  "Clara",
  "Danu",
  "Fitri",
];
const initials = "ABCDEFGHIJKLMNOPRSTUWY";
const fillerName = () => `${rng.pick(firstNames)} ${rng.pick([...initials])}.`;

const streets = [
  "Jl. Telekomunikasi",
  "Jl. Sukabirus",
  "Jl. Sukapura",
  "Jl. Mangga Dua",
  "Jl. Dipatiukur",
  "Jl. Radio Palasari",
  "Jl. Cikoneng",
  "Jl. Buah Batu",
  "Jl. Bojongsoang",
  "Jl. Ir. H. Juanda",
  "Jl. Riau",
  "Jl. Batununggal",
  "Jl. Margacinta",
  "Jl. Sukasenang",
];
const fillerAddress = () => `${rng.pick(streets)} No. ${rng.int(1, 160)}, Bandung`;

const couriers = ["Kurir: Asep", "Kurir: Ujang", "Kurir: Dede"];

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
    lumpia: { price: 28_000, capacity: 200 },
    sparkling: { price: 16_000, capacity: 150 },
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

const unitPrice = (setup: BatchSetup, key: ProductKey) =>
  setup.products[key].price ?? productByKey[key].price;

// ---------------------------------------------------------------------------
// Orders

type AttemptSpec = {
  status: "pending" | "approved" | "rejected";
  claimedPaidAt: Date;
  customerReference: string;
  /** Defaults to the order total. */
  claimedAmount?: number;
  reviewNote?: string;
  reviewedAt?: Date;
};

type OrderSpec = {
  batch: BatchSetup;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  method: FulfillmentMethod;
  /** Index into batch.slots (pickup) or batch.zones (delivery). */
  placeIndex: number;
  address?: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  items: Partial<Record<ProductKey, number>>;
  drawOptIn: boolean;
  createdAt: Date;
  notes?: string;
  attempts: AttemptSpec[];
};

/** Named orders shown in the page mockups (pesanan, produksi-kirim, verifikasi-bayar). */
const namedOctoberOrders: OrderSpec[] = [
  {
    batch: october,
    invoiceNumber: "UBP-20261016-A7K9M2Q4",
    customerName: "Rani A.",
    customerPhone: "081234564521",
    method: "delivery",
    placeIndex: 0,
    address: "Jl. Telekomunikasi No. 1, Bandung",
    paymentMethod: "QRIS",
    paymentStatus: "paid",
    fulfillmentStatus: "ready_delivery",
    items: { lumpia: 4, sparkling: 3 },
    drawOptIn: true,
    createdAt: wib("2026-10-16T09:31"),
    attempts: [
      {
        status: "approved",
        claimedPaidAt: wib("2026-10-16T09:46"),
        customerReference: "TRX-948231",
        reviewedAt: wib("2026-10-16T10:05"),
      },
    ],
  },
  {
    batch: october,
    invoiceNumber: "UBP-20261016-D8P4L1S3",
    customerName: "Bima R.",
    customerPhone: "081355127710",
    method: "pickup",
    placeIndex: 0,
    paymentMethod: "QRIS",
    paymentStatus: "paid",
    fulfillmentStatus: "ready_pickup",
    items: { lumpia: 8 },
    drawOptIn: true,
    createdAt: wib("2026-10-16T09:58"),
    attempts: [
      {
        status: "approved",
        claimedPaidAt: wib("2026-10-16T10:12"),
        customerReference: "TRX-948377",
        reviewedAt: wib("2026-10-16T10:40"),
      },
    ],
  },
  {
    batch: october,
    invoiceNumber: "UBP-20261016-Q2N7H5K8",
    customerName: "Dewi S.",
    customerPhone: "085712343302",
    method: "delivery",
    placeIndex: 0,
    address: "Jl. Sukabirus No. 12, Bandung",
    paymentMethod: "QRIS",
    paymentStatus: "paid",
    fulfillmentStatus: "preparing",
    items: { sparkling: 6 },
    drawOptIn: true,
    createdAt: wib("2026-10-16T11:05"),
    attempts: [
      {
        status: "approved",
        claimedPaidAt: wib("2026-10-16T11:20"),
        customerReference: "TRX-948502",
        reviewedAt: wib("2026-10-16T11:45"),
      },
    ],
  },
  {
    batch: october,
    invoiceNumber: "UBP-20261016-M4V6C9T1",
    customerName: "Aditya P.",
    customerPhone: "082145679054",
    method: "pickup",
    placeIndex: 1,
    paymentMethod: "QRIS",
    paymentStatus: "review",
    fulfillmentStatus: "pending",
    items: { lumpia: 10 },
    drawOptIn: true,
    createdAt: wib("2026-10-16T13:10"),
    attempts: [
      {
        status: "rejected",
        claimedPaidAt: wib("2026-10-16T13:25"),
        customerReference: "TRX-947512",
        claimedAmount: 270_000,
        reviewNote: "Nominal di bukti tidak sesuai invoice",
        reviewedAt: wib("2026-10-16T14:02"),
      },
      {
        status: "pending",
        claimedPaidAt: wib("2026-10-17T08:31"),
        customerReference: "TRX-947905",
      },
    ],
  },
  {
    batch: october,
    invoiceNumber: "UBP-20261016-E8R5S2P7",
    customerName: "Sinta M.",
    customerPhone: "087834561286",
    method: "delivery",
    placeIndex: 0,
    address: "Jl. Mangga Dua No. 5, Bandung",
    paymentMethod: "QRIS",
    paymentStatus: "review",
    fulfillmentStatus: "pending",
    items: { lumpia: 3 },
    drawOptIn: false,
    createdAt: wib("2026-10-16T11:30"),
    attempts: [
      {
        status: "rejected",
        claimedPaidAt: wib("2026-10-16T12:05"),
        customerReference: "TRX-945880",
        reviewNote: "Mutasi merchant tidak ditemukan",
        reviewedAt: wib("2026-10-16T13:00"),
      },
      {
        status: "pending",
        claimedPaidAt: wib("2026-10-16T19:20"),
        customerReference: "TRX-946112",
      },
    ],
  },
  {
    batch: october,
    invoiceNumber: "UBP-20261016-K3B9L4Q6",
    customerName: "Fajar T.",
    customerPhone: "081298766639",
    method: "pickup",
    placeIndex: 0,
    paymentMethod: "QRIS",
    paymentStatus: "paid",
    fulfillmentStatus: "picked_up",
    items: { lumpia: 2 },
    drawOptIn: true,
    createdAt: wib("2026-10-16T08:05"),
    attempts: [
      {
        status: "approved",
        claimedPaidAt: wib("2026-10-16T08:20"),
        customerReference: "TRX-947001",
        reviewedAt: wib("2026-10-16T08:40"),
      },
    ],
  },
];
for (const spec of namedOctoberOrders) {
  claimUnique(usedInvoiceNumbers, spec.invoiceNumber);
  for (const attempt of spec.attempts) claimUnique(usedReferences, attempt.customerReference);
}

type FillerState = {
  method?: FulfillmentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
};

const repeat = (count: number, state: FillerState) => Array.from({ length: count }, () => state);

/**
 * Filler states for the October batch, most advanced first. Together with the
 * named orders: 54 orders · 42 paid (23 pickup / 19 delivery) · 7 review · 5 unpaid ·
 * 6 ready_delivery · 19 preparing-or-ready.
 */
const octoberFillerStates: FillerState[] = [
  ...repeat(5, { method: "delivery", paymentStatus: "paid", fulfillmentStatus: "ready_delivery" }),
  ...repeat(3, { method: "pickup", paymentStatus: "paid", fulfillmentStatus: "ready_pickup" }),
  ...repeat(4, { method: "delivery", paymentStatus: "paid", fulfillmentStatus: "preparing" }),
  ...repeat(4, { method: "pickup", paymentStatus: "paid", fulfillmentStatus: "preparing" }),
  ...repeat(8, { method: "delivery", paymentStatus: "paid", fulfillmentStatus: "pending" }),
  ...repeat(14, { method: "pickup", paymentStatus: "paid", fulfillmentStatus: "pending" }),
  ...repeat(5, { paymentStatus: "review", fulfillmentStatus: "pending" }),
  ...repeat(5, { paymentStatus: "unpaid", fulfillmentStatus: "pending" }),
];

/** New October orders per day (16–21 Okt), including the 6 named ones on 16 Okt. */
const octoberDailyFillers: [string, number][] = [
  ["2026-10-16", 2],
  ["2026-10-17", 7],
  ["2026-10-18", 8],
  ["2026-10-19", 8],
  ["2026-10-20", 11],
  ["2026-10-21", 12],
];

function fillerCreatedTimes(days: [string, number][]) {
  return days.flatMap(([day, count]) =>
    Array.from({ length: count }, () => {
      const hour = String(rng.int(8, 21)).padStart(2, "0");
      const minute = String(rng.int(0, 59)).padStart(2, "0");
      return wib(`${day}T${hour}:${minute}`);
    }).sort((a, b) => a.getTime() - b.getTime()),
  );
}

/** Splits `totals` units across orders, each order getting ≥1 of every product it carries. */
function distributeItems(
  count: number,
  totals: Record<ProductKey, number>,
): Partial<Record<ProductKey, number>>[] {
  const items = Array.from({ length: count }, (): Partial<Record<ProductKey, number>> => {
    const roll = rng.next();
    if (roll < 0.45) return { lumpia: 1, sparkling: 1 };
    if (roll < 0.75) return { lumpia: 1 };
    return { sparkling: 1 };
  });
  for (const key of ["lumpia", "sparkling"] as const) {
    const carriers = items.filter((entry) => entry[key] !== undefined);
    let remaining = totals[key] - carriers.length;
    if (remaining < 0) throw new Error(`not enough ${key} units to distribute`);
    while (remaining > 0) {
      const target = rng.pick(carriers);
      if ((target[key] ?? 0) >= 8) continue;
      target[key] = (target[key] ?? 0) + 1;
      remaining--;
    }
  }
  return items;
}

function fillerAttempts(
  createdAt: Date,
  paymentStatus: PaymentStatus,
  paymentMethod: string,
): AttemptSpec[] {
  if (paymentStatus === "unpaid") return [];
  const claimedPaidAt = addMinutes(createdAt, rng.int(8, 45));
  const customerReference = fillerReference(paymentMethod === "QRIS" ? "TRX" : "TRF");
  if (paymentStatus === "review") return [{ status: "pending", claimedPaidAt, customerReference }];
  return [
    {
      status: "approved",
      claimedPaidAt,
      customerReference,
      reviewedAt: addMinutes(claimedPaidAt, rng.int(15, 90)),
    },
  ];
}

function buildFillers(input: {
  batch: BatchSetup;
  states: FillerState[];
  createdTimes: Date[];
  itemTotals: Record<ProductKey, number>;
  optInPaid: number;
}): OrderSpec[] {
  const { states, createdTimes } = input;
  if (states.length !== createdTimes.length) throw new Error("filler states/times mismatch");
  // Light shuffle inside windows of 6 so statuses are not perfectly sorted by time.
  const ordered = Array.from({ length: Math.ceil(states.length / 6) }, (_, index) =>
    rng.shuffle(states.slice(index * 6, index * 6 + 6)),
  ).flat();
  const items = distributeItems(states.length, input.itemTotals);
  const paidIndexes = ordered.flatMap((state, index) =>
    state.paymentStatus === "paid" ? [index] : [],
  );
  const optedIn = new Set(rng.shuffle(paidIndexes).slice(0, input.optInPaid));

  return ordered.map((state, index) => {
    const createdAt = createdTimes[index];
    const method = state.method ?? (rng.next() < 0.5 ? "pickup" : "delivery");
    const paymentMethod = rng.next() < 0.8 ? "QRIS" : "Transfer bank · BCA";
    return {
      batch: input.batch,
      invoiceNumber: fillerInvoiceNumber(createdAt),
      customerName: fillerName(),
      customerPhone: fillerPhone(),
      method,
      placeIndex: rng.next() < 0.6 ? 0 : 1,
      address: method === "delivery" ? fillerAddress() : undefined,
      paymentMethod,
      paymentStatus: state.paymentStatus,
      fulfillmentStatus: state.fulfillmentStatus,
      items: items[index],
      drawOptIn: state.paymentStatus === "paid" ? optedIn.has(index) : rng.next() < 0.5,
      createdAt,
      attempts: fillerAttempts(createdAt, state.paymentStatus, paymentMethod),
    };
  });
}

const sumItems = (specs: OrderSpec[], key: ProductKey) =>
  specs.reduce((total, spec) => total + (spec.items[key] ?? 0), 0);

// Lumpia: 126 / 200 reserved ("74 kotak tersisa"); sparkling: 92 / 150 ("58 cup tersisa").
const octoberFillers = buildFillers({
  batch: october,
  states: octoberFillerStates,
  createdTimes: fillerCreatedTimes(octoberDailyFillers),
  itemTotals: {
    lumpia: 126 - sumItems(namedOctoberOrders, "lumpia"),
    sparkling: 92 - sumItems(namedOctoberOrders, "sparkling"),
  },
  // 31 of 42 paid orders opted in; 4 named paid orders already did.
  optInPaid:
    31 - namedOctoberOrders.filter((o) => o.paymentStatus === "paid" && o.drawOptIn).length,
});

const septemberStates: FillerState[] = [
  ...repeat(6, { method: "pickup", paymentStatus: "paid", fulfillmentStatus: "picked_up" }),
  ...repeat(5, { method: "delivery", paymentStatus: "paid", fulfillmentStatus: "delivered" }),
  { method: "pickup", paymentStatus: "unpaid", fulfillmentStatus: "cancelled" },
];
const septemberOrders = buildFillers({
  batch: september,
  states: septemberStates,
  createdTimes: fillerCreatedTimes([
    ["2026-09-16", 3],
    ["2026-09-18", 3],
    ["2026-09-20", 4],
    ["2026-09-21", 2],
  ]),
  itemTotals: { lumpia: 30, sparkling: 18 },
  optInPaid: 8,
});

const orderSpecs = [...septemberOrders, ...namedOctoberOrders, ...octoberFillers];

// ---------------------------------------------------------------------------
// Row building

const fulfillmentSteps: Record<FulfillmentMethod, FulfillmentStatus[]> = {
  pickup: ["pending", "preparing", "ready_pickup", "picked_up"],
  delivery: ["pending", "preparing", "ready_delivery", "in_transit", "delivered"],
};

function buildRows(spec: OrderSpec, adminId: string | null) {
  const orderId = crypto.randomUUID();
  const { batch: setup } = spec;
  const lines = (["lumpia", "sparkling"] as const).flatMap((key) => {
    const quantity = spec.items[key];
    if (!quantity) return [];
    const price = unitPrice(setup, key);
    return [
      {
        id: crypto.randomUUID(),
        orderId,
        productId: productByKey[key].id,
        productName: productByKey[key].name,
        unitPrice: price,
        quantity,
        lineTotal: price * quantity,
      },
    ];
  });
  const subtotal = lines.reduce((total, line) => total + line.lineTotal, 0);
  const zone = spec.method === "delivery" ? setup.zones[spec.placeIndex] : undefined;
  const slot = spec.method === "pickup" ? setup.slots[spec.placeIndex] : undefined;
  const shippingFee = zone?.fee ?? 0;
  const total = subtotal + shippingFee;

  const events: (typeof orderEvent.$inferInsert)[] = [
    {
      orderId,
      type: "created",
      toStatus: "unpaid",
      note: "Invoice dibuat dari checkout",
      createdAt: spec.createdAt,
    },
  ];
  const attempts: (typeof paymentAttempt.$inferInsert)[] = [];
  let paidAt: Date | null = null;

  for (const [index, attempt] of spec.attempts.entries()) {
    const createdAt = addMinutes(attempt.claimedPaidAt, 2);
    attempts.push({
      orderId,
      attempt: index + 1,
      claimedAmount: attempt.claimedAmount ?? total,
      claimedPaidAt: attempt.claimedPaidAt,
      customerReference: attempt.customerReference,
      proofUrl: null,
      status: attempt.status,
      merchantReference:
        attempt.status === "approved"
          ? `MUT-${attempt.customerReference.replace(/^\D+-/, "")}`
          : null,
      reviewNote: attempt.reviewNote ?? null,
      reviewedById: attempt.status === "pending" ? null : adminId,
      reviewedAt: attempt.status === "pending" ? null : (attempt.reviewedAt ?? null),
      createdAt,
    });
    events.push({
      orderId,
      type: "payment_submitted",
      fromStatus: "unpaid",
      toStatus: "review",
      note: `Bukti bayar percobaan ${index + 1} · ${attempt.customerReference}`,
      createdAt,
    });
    if (attempt.status === "approved" && attempt.reviewedAt) {
      paidAt = attempt.reviewedAt;
      events.push({
        orderId,
        type: "payment_approved",
        fromStatus: "review",
        toStatus: "paid",
        note: "Mutasi merchant cocok",
        actorId: adminId,
        createdAt: attempt.reviewedAt,
      });
    }
    if (attempt.status === "rejected" && attempt.reviewedAt) {
      events.push({
        orderId,
        type: "payment_rejected",
        fromStatus: "review",
        toStatus: "unpaid",
        note: attempt.reviewNote ?? null,
        actorId: adminId,
        createdAt: attempt.reviewedAt,
      });
    }
  }

  if (spec.fulfillmentStatus === "cancelled") {
    events.push({
      orderId,
      type: "fulfillment_changed",
      fromStatus: "pending",
      toStatus: "cancelled",
      note: "Tidak dibayar sebelum cutoff",
      actorId: adminId,
      createdAt: setup.row.paymentCutoffAt,
    });
  } else {
    const steps = fulfillmentSteps[spec.method];
    const target = steps.indexOf(spec.fulfillmentStatus);
    if (target < 0) throw new Error(`${spec.fulfillmentStatus} invalid for ${spec.method}`);
    if (target > 0 && !paidAt) throw new Error(`${spec.invoiceNumber} progressed without payment`);
    let at: Date = paidAt ?? spec.createdAt;
    const handoverStart = slot?.startsAt ?? zone?.windowStartsAt ?? at;
    for (let step = 1; step <= target; step++) {
      const toStatus = steps[step];
      const isHandover = ["picked_up", "in_transit", "delivered"].includes(toStatus);
      at =
        isHandover && handoverStart > at
          ? addMinutes(handoverStart, toStatus === "delivered" ? 60 + step * 5 : 20)
          : addMinutes(at, 120);
      events.push({
        orderId,
        type: isHandover ? "handover" : "fulfillment_changed",
        fromStatus: steps[step - 1],
        toStatus,
        handoverTo:
          toStatus === "picked_up"
            ? spec.customerName
            : toStatus === "in_transit"
              ? rng.pick(couriers)
              : toStatus === "delivered"
                ? spec.customerName
                : null,
        actorId: adminId,
        createdAt: at,
      });
    }
  }

  const lastEventAt = events.reduce(
    (latest, event) => (event.createdAt && event.createdAt > latest ? event.createdAt : latest),
    spec.createdAt,
  );

  const orderRow: typeof order.$inferInsert = {
    id: orderId,
    invoiceNumber: spec.invoiceNumber,
    batchId: setup.row.id,
    customerName: spec.customerName,
    customerPhone: spec.customerPhone,
    customerEmail: spec.customerEmail ?? null,
    method: spec.method,
    pickupSlotId: slot?.id ?? null,
    deliveryZoneId: zone?.id ?? null,
    address: spec.address ?? null,
    paymentMethod: spec.paymentMethod,
    paymentStatus: spec.paymentStatus,
    fulfillmentStatus: spec.fulfillmentStatus,
    subtotal,
    shippingFee,
    total,
    notes: spec.notes ?? null,
    drawOptIn: spec.drawOptIn,
    paidAt,
    createdById: null,
    createdAt: spec.createdAt,
    updatedAt: lastEventAt,
  };

  if ((spec.paymentStatus === "paid") !== (paidAt !== null)) {
    throw new Error(`${spec.invoiceNumber}: paymentStatus/paidAt mismatch`);
  }

  return { orderRow, lines, attempts, events };
}

// ---------------------------------------------------------------------------
// Run

const db = createDb(ENV);
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function wipeShopTables(tx: Tx) {
  // Children first; auth tables are untouched.
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

async function findAdminId(tx: Tx) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const [admin] = await tx
    .select({ id: user.id })
    .from(user)
    .where(email ? eq(user.email, email.toLowerCase()) : undefined)
    .orderBy(asc(user.createdAt))
    .limit(1);
  return admin?.id ?? null;
}

async function seed(tx: Tx) {
  const adminId = await findAdminId(tx);

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

  const built = orderSpecs.map((spec) => buildRows(spec, adminId));
  await tx.insert(order).values(built.map(({ orderRow }) => orderRow));
  await tx.insert(orderItem).values(built.flatMap(({ lines }) => lines));
  await tx.insert(paymentAttempt).values(built.flatMap(({ attempts }) => attempts));
  await tx.insert(orderEvent).values(built.flatMap(({ events }) => events));

  // Formal invoices issued for a few September orders (next number: INV-2026-0048).
  const septemberPaid = built.filter(
    ({ orderRow }) => orderRow.batchId === september.row.id && orderRow.paymentStatus === "paid",
  );
  await tx.insert(invoice).values(
    septemberPaid.slice(0, 3).map(({ orderRow }, index) => ({
      number: `INV-2026-${String(45 + index).padStart(4, "0")}`,
      orderId: orderRow.id!,
      customerName: orderRow.customerName,
      customerEmail: orderRow.customerEmail ?? null,
      issuedOn: wib("2026-09-24T09:00"),
      dueOn: wib("2026-10-01T09:00"),
      memo: "Terima kasih telah memilih ubeloom!",
      createdById: adminId,
      createdAt: wib("2026-09-24T09:00"),
    })),
  );

  // Draws: September already drawn, October still in draft.
  const prizeNames = ["Paket ubeloom", "Voucher Rp 50.000", "Merchandise"];
  const entryRule = "1 per invoice lunas + opt-in";

  const septemberPool = septemberPaid
    .filter(({ orderRow }) => orderRow.drawOptIn)
    .map(({ orderRow }) => orderRow);
  const septemberDrawId = crypto.randomUUID();
  await tx.insert(draw).values([
    {
      id: septemberDrawId,
      batchId: september.row.id,
      status: "drawn",
      entryRule,
      verificationDeadline: wib("2026-09-23T20:00"),
      claimDeadline: wib("2026-09-30T20:00"),
      maxWinners: 10,
      rulesVersion: 2,
      frozenPool: septemberPool.map(({ invoiceNumber }) => invoiceNumber),
      frozenAt: wib("2026-09-23T20:30"),
      drawnAt: wib("2026-09-24T10:00"),
      drawnById: adminId,
      createdAt: wib("2026-09-15T10:00"),
      updatedAt: wib("2026-09-24T10:00"),
    },
    {
      batchId: october.row.id,
      status: "draft",
      entryRule,
      verificationDeadline: wib("2026-10-23T20:00"),
      claimDeadline: wib("2026-10-30T20:00"),
      maxWinners: 10,
      rulesVersion: 1,
      createdAt: wib("2026-10-15T10:00"),
      updatedAt: wib("2026-10-15T10:00"),
    },
  ]);
  const [octoberDraw] = await tx
    .select({ id: draw.id })
    .from(draw)
    .where(eq(draw.batchId, october.row.id));

  const septemberPrizes = prizeNames.map((name, index) => ({
    id: crypto.randomUUID(),
    drawId: septemberDrawId,
    name,
    position: index + 1,
  }));
  await tx
    .insert(drawPrize)
    .values([
      ...septemberPrizes,
      ...prizeNames.map((name, index) => ({ drawId: octoberDraw.id, name, position: index + 1 })),
    ]);

  const winners = rng.shuffle(septemberPool).slice(0, septemberPrizes.length);
  await tx.insert(drawWinner).values(
    winners.map((winner, index) => ({
      drawId: septemberDrawId,
      prizeId: septemberPrizes[index].id,
      orderId: winner.id!,
      position: index + 1,
      claimedAt: index < 2 ? wib(`2026-09-${25 + index}T14:00`) : null,
      createdAt: wib("2026-09-24T10:00"),
    })),
  );

  return { orders: built.length, adminId };
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
    const result = await db.transaction(async (tx) => {
      if (reset) await wipeShopTables(tx);
      return seed(tx);
    });
    console.log(
      `${reset ? "reset and seeded" : "seeded"} shop: ${productRows.length} products, 2 batches, ${result.orders} orders${result.adminId ? "" : " (no admin user found; reviewer ids left null)"}`,
    );
  }
} finally {
  await db.$client.end();
}
