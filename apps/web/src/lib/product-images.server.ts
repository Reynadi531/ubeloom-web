import { storage } from "@/services";

const imageTypes = {
  "image/jpeg": {
    ext: "jpg",
    matches: (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  },
  "image/png": {
    ext: "png",
    matches: (bytes: Uint8Array) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]),
  },
  "image/webp": {
    ext: "webp",
    // "RIFF" <size> "WEBP"
    matches: (bytes: Uint8Array) =>
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
} as const;

type ImageType = keyof typeof imageTypes;

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((byte, index) => bytes[index] === byte);

/**
 * Checks an image by its bytes (not the browser-supplied type) and stores it under
 * `<prefix>/` with a random name. Returns the object key.
 */
export async function storeImage(file: File, prefix: "products" | "qris") {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageTypes[file.type as ImageType];
  if (!type?.matches(bytes)) throw new Error("Foto harus berupa file JPG, PNG atau WEBP.");
  const key = `${prefix}/${crypto.randomUUID()}.${type.ext}`;
  await storage.putObject(key, bytes, file.type);
  return key;
}

/** Stores a product photo; the key is kept in `product.images`. */
export const storeProductImage = (file: File) => storeImage(file, "products");

/** Best-effort cleanup of images nothing references anymore. */
export async function deleteImages(keys: readonly string[]) {
  try {
    await storage.deleteObjects(keys);
  } catch (error) {
    // An orphaned object only costs storage; never fail the save over it.
    console.error("Failed to delete images", keys, error);
  }
}
