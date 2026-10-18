import NotFoundPage from "./not-found-page";

/** Storefront 404 for unknown or unpublished product slugs. */
export default function ProductNotFound() {
  return (
    <NotFoundPage
      eyebrow="404 / MENU"
      title="Menu ini tidak ditemukan."
      description="Produknya mungkin sudah tidak dijual atau tautannya salah ketik."
      cta={{ to: "/menu", label: "Lihat menu" }}
    />
  );
}
