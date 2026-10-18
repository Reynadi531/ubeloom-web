import { storage } from "@/services";

const proofTypes = {
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "application/pdf": { ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
} as const;

type ProofType = keyof typeof proofTypes;

/**
 * Checks a payment proof by its bytes (not the browser-supplied type) and stores it
 * in the private bucket under the order. Returns the object key for `proofKey`.
 */
export async function storeProof(orderId: string, file: File, allowed: readonly ProofType[]) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = allowed.includes(file.type as ProofType)
    ? proofTypes[file.type as ProofType]
    : undefined;
  if (!type || !type.magic.every((byte, index) => bytes[index] === byte)) {
    const names = allowed.map((mime) => proofTypes[mime].ext.toUpperCase()).join(", ");
    throw new Error(`Bukti harus berupa file ${names}.`);
  }
  const key = `payment-proofs/${orderId}/${crypto.randomUUID()}.${type.ext}`;
  await storage.putObject(key, bytes, file.type);
  return key;
}
