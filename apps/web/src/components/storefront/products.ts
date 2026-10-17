import type { Product } from "./product-card";

export const products: Product[] = [
  {
    slug: "lumpia-ubi-goreng",
    name: "Lumpia Ubi Goreng",
    price: "Rp 28.000",
    image: {
      mobile: "/images/lumpia-ubi-goreng.webp",
      desktop: "/images/lumpia-ubi-goreng.webp",
    },
    variant: {
      mobile: "Original · isian ubi manis · 1 kotak",
      desktop: "Original · isian ubi manis · 1 kotak",
    },
    description: {
      mobile: "Lumpia goreng renyah dengan isian ubi manis lembut",
      desktop: "Kulit lumpia goreng renyah dengan isian ubi manis yang lembut.",
    },
    care: {
      mobile: "Alergen: konfirmasi · Terbaik disantap hangat",
      desktop: "Alergen: konfirmasi sebelum rilis · Terbaik disantap hangat",
    },
  },
  {
    slug: "sparkling-starfruit",
    name: "Sparkling Starfruit",
    price: "Rp 16.000",
    image: {
      mobile: "/images/sparkling-starfruit.webp",
      desktop: "/images/sparkling-starfruit-wide.webp",
    },
    variant: {
      mobile: "Dengan chia seed · bersoda",
      desktop: "Dengan chia seed · minuman bersoda",
    },
    description: {
      mobile: "Belimbing, chia seed, air soda dan es",
      desktop: "Belimbing, chia seed, air soda dan es. Segar bergelembung.",
    },
    care: {
      mobile: "Alergen: konfirmasi · Sajikan dingin",
      desktop: "Alergen: konfirmasi sebelum rilis · Sajikan dingin, konsumsi hari yang sama",
    },
  },
];
