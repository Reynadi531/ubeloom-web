/** Shown when a product has no photo yet. */
export const PLACEHOLDER_IMAGE = "/images/ubeloom-logo.webp";

export const MAX_PRODUCT_IMAGES = 8;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/** Object keys written by `storeProductImage`, e.g. `products/<uuid>.webp`. */
export const productImageKeyPattern = /^products\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Public URL of a stored product photo; /media streams it from object storage. */
export const productImageUrl = (key: string) => `/media/${key}`;

/** Cover photo URL (first image), or the placeholder. */
export const productCoverUrl = (images: readonly string[]) =>
  images[0] ? productImageUrl(images[0]) : PLACEHOLDER_IMAGE;
