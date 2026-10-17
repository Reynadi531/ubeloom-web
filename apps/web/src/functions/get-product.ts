import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Lucide icon keys the product detail page knows how to render. */
export type ProductIcon =
  | "sparkles"
  | "package"
  | "chef-hat"
  | "heart"
  | "map-pin"
  | "snowflake"
  | "cup-soda";

export interface ProductDetail {
  slug: string;
  name: string;
  collection: string;
  subtitle: string;
  /** Price in rupiah. */
  price: number;
  portionLabel: string;
  story: string;
  image: { src: string; alt: string };
  highlights: { icon: ProductIcon; title: string; note: string }[];
  details: {
    title: string;
    facts: { icon: ProductIcon; title: string; description: string }[];
  };
}

const pickupOrDelivery = {
  icon: "map-pin",
  title: "Ambil atau kirim",
  description:
    "Pilih pickup di Kampus ubeloom atau delivery ke alamatmu. Area dan ongkir tampil saat checkout.",
} as const;

// Dummy catalog until products live in the database.
const productDetails: ProductDetail[] = [
  {
    slug: "lumpia-ubi-goreng",
    name: "Lumpia Ubi Goreng",
    collection: "MENU FAVORIT  /  PREORDER DIBUKA",
    subtitle: "Renyah di luar, lembut manis di dalam.",
    price: 28_000,
    portionLabel: "/ porsi",
    story:
      "Lumpia ubi hangat dengan kulit keemasan yang garing dan isian ubi manis nan lembut. Cocok untuk jeda sore, berbagi dengan teman, atau dinikmati sendiri—kami tidak menghakimi.",
    image: { src: "/images/lumpia-ubi-goreng.webp", alt: "Lumpia Ubi Goreng" },
    highlights: [
      { icon: "sparkles", title: "Baru digoreng", note: "Nikmati selagi hangat" },
      { icon: "package", title: "Per porsi", note: "Siap untuk dibawa" },
    ],
    details: {
      title: "Sedikit detail, banyak alasan untuk suka.",
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
    },
  },
  {
    slug: "sparkling-starfruit",
    name: "Sparkling Starfruit",
    collection: "MINUMAN SEGAR  /  PREORDER DIBUKA",
    subtitle: "Segar bergelembung, penuh rasa ceria.",
    price: 16_000,
    portionLabel: "/ porsi",
    story:
      "Belimbing, chia seed, air soda, dan es dalam satu gelas yang menyegarkan. Perpaduan rasa buah dan sensasi soda yang pas untuk menemani jeda siangmu.",
    image: { src: "/images/sparkling-starfruit.webp", alt: "Sparkling Starfruit" },
    highlights: [
      { icon: "snowflake", title: "Sajikan dingin", note: "Paling segar dengan es" },
      { icon: "cup-soda", title: "Per gelas", note: "Siap dibawa pergi" },
    ],
    details: {
      title: "Kesegaran kecil untuk harimu.",
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
    },
  },
];

export const getProduct = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const product = productDetails.find(({ slug }) => slug === data.slug);
    if (!product) throw notFound();
    return product;
  });
