import {
  exportDocx, exportDocxWithImages, type DocxAsyncExportOptions, type DocxExportOptions,
  type DocxImageBinding, type DocxResult,
} from "@breditor/interchange/docx";

const images = new Map<string, Uint8Array<ArrayBuffer>>();
const sync = {
  images,
  image(binding: DocxImageBinding) { return this.images.get(binding.asset); },
} satisfies DocxExportOptions & { images: typeof images };
const asynchronous = {
  images,
  async loadImage(binding: DocxImageBinding) {
    const bytes = this.images.get(binding.asset);
    return bytes === undefined ? undefined : new Blob([bytes]);
  },
} satisfies DocxAsyncExportOptions & { images: typeof images };

const result: DocxResult<Uint8Array> = exportDocx("{}", sync);
const pending: Promise<DocxResult<Uint8Array>> = exportDocxWithImages("{}", asynchronous);
// @ts-expect-error The synchronous host callback must return bytes immediately.
void exportDocx("{}", { image: async () => new Uint8Array() });
// @ts-expect-error The asynchronous callback returns bytes or Blob, rather than an image URL.
void exportDocxWithImages("{}", { loadImage: async () => "https://example.test/asset.png" });
void [result, pending];
