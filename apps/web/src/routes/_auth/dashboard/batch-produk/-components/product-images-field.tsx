import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { type ChangeEvent, type Dispatch, type SetStateAction, useId } from "react";
import { toast } from "sonner";

import { serverErrorMessage } from "@/components/admin/orders/form-errors";
import { uploadProductImage } from "@/functions/products";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_ACCEPT,
  productImageUrl,
} from "@/lib/product-images";

const iconButtonClassName =
  "flex size-7 items-center justify-center rounded-md bg-white/90 text-deep-ube transition-colors hover:bg-vanilla disabled:opacity-40";

/**
 * Product photo list: uploads go straight to object storage, while the order and
 * removals only take effect when the surrounding form is saved.
 */
export function ProductImagesField({
  name,
  images,
  onChange,
  uploading,
  setUploading,
}: {
  name: string;
  images: string[];
  /** Functional so uploads finishing after other edits never drop them. */
  onChange: (update: (images: string[]) => string[]) => void;
  /** Uploads in flight; owned by the form so it can hold saving until they land. */
  uploading: number;
  setUploading: Dispatch<SetStateAction<number>>;
}) {
  const inputId = useId();
  const slotsLeft = MAX_PRODUCT_IMAGES - images.length - uploading;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length > slotsLeft) {
      toast.error(`Maksimal ${MAX_PRODUCT_IMAGES} foto per produk.`);
      files.splice(Math.max(0, slotsLeft));
    }
    const tooBig = files.filter((file) => file.size > MAX_PRODUCT_IMAGE_BYTES);
    if (tooBig.length > 0) {
      toast.error(`Foto maksimal ${MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB: ${tooBig[0]!.name}`);
    }
    const accepted = files.filter((file) => file.size <= MAX_PRODUCT_IMAGE_BYTES);

    setUploading((count) => count + accepted.length);
    // One at a time keeps the chosen order and avoids a burst of large requests.
    for (const file of accepted) {
      try {
        const data = new FormData();
        data.set("file", file);
        const { key } = await uploadProductImage({ data });
        onChange((current) => [...current, key]);
      } catch (error) {
        toast.error(`${file.name} gagal diunggah: ${serverErrorMessage(error)}`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
  };

  const move = (from: number, to: number) =>
    onChange((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ube-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-bold text-ink">Foto produk</p>
          <p className="text-[11px] text-plum">
            Foto pertama tampil di katalog; semua foto tampil sebagai carousel di halaman detail.
            JPG, PNG atau WEBP, maks. {MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.
          </p>
        </div>
        <p className="font-data text-[11px] font-bold text-plum">
          {images.length} / {MAX_PRODUCT_IMAGES}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {images.map((key, index) => (
          <li
            key={key}
            className="group relative aspect-square overflow-hidden rounded-lg border border-ube-line"
          >
            <img
              src={productImageUrl(key)}
              alt={`${name} · foto ${index + 1}`}
              className="size-full object-cover"
            />
            {index === 0 && (
              <span className="absolute top-1.5 left-1.5 rounded-md bg-deep-ube px-1.5 py-1 text-[9px]/[11px] font-bold tracking-[0.5px] text-white">
                UTAMA
              </span>
            )}
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Geser foto ${index + 1} ke kiri`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className={iconButtonClassName}
                >
                  <ArrowLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Geser foto ${index + 1} ke kanan`}
                  disabled={index === images.length - 1}
                  onClick={() => move(index, index + 1)}
                  className={iconButtonClassName}
                >
                  <ArrowRight className="size-3.5" />
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    aria-label={`Jadikan foto ${index + 1} foto utama`}
                    onClick={() => move(index, 0)}
                    className={iconButtonClassName}
                  >
                    <Star className="size-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label={`Hapus foto ${index + 1}`}
                onClick={() => onChange((current) => current.filter((item) => item !== key))}
                className={`${iconButtonClassName} text-blush-pink`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, index) => (
          <li
            key={`uploading-${index}`}
            className="flex aspect-square animate-pulse items-center justify-center rounded-lg bg-vanilla text-[10px] font-bold text-plum"
          >
            Mengunggah…
          </li>
        ))}
        {slotsLeft > 0 && (
          <li className="aspect-square">
            <label
              htmlFor={inputId}
              className="flex size-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-ube-line text-[11px] font-bold text-deep-ube transition-colors hover:bg-vanilla focus-within:border-ube-pop"
            >
              <ImagePlus aria-hidden className="size-5" />
              Tambah foto
              <input
                id={inputId}
                type="file"
                accept={PRODUCT_IMAGE_ACCEPT}
                multiple
                onChange={upload}
                className="sr-only"
              />
            </label>
          </li>
        )}
      </ul>
    </div>
  );
}
