import type {AssetLimits, RasterMime} from "./types.js";

interface Raster {mime: RasterMime; width: number; height: number}
const u16 = (bytes: Uint8Array, at: number): number => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const be32 = (bytes: Uint8Array, at: number): number => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);
const le24 = (bytes: Uint8Array, at: number): number => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
const ascii = (bytes: Uint8Array, at: number, length: number): string => String.fromCharCode(...bytes.subarray(at, at + length));

/** Read declared dimensions before asking the browser to decode the raster. */
function header(bytes: Uint8Array): Raster {
  if (bytes.length >= 33 && bytes[0] === 137 && ascii(bytes, 1, 7) === "PNG\r\n\x1a\n"
    && be32(bytes, 8) === 13 && ascii(bytes, 12, 4) === "IHDR") {
    return {mime: "image/png", width: be32(bytes, 16), height: be32(bytes, 20)};
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) + 8 !== bytes.length) throw Error("Invalid WebP container length");
    for (let at = 12; at + 8 <= bytes.length;) {
      const type = ascii(bytes, at, 4), size = view.getUint32(at + 4, true), payload = at + 8;
      if (payload + size > bytes.length) break;
      if (type === "VP8X" && size >= 10) return {mime: "image/webp", width: le24(bytes, payload + 4) + 1, height: le24(bytes, payload + 7) + 1};
      if (type === "VP8 " && size >= 10 && ascii(bytes, payload + 3, 3) === "\x9d\x01\x2a") {
        return {mime: "image/webp", width: view.getUint16(payload + 6, true) & 0x3fff, height: view.getUint16(payload + 8, true) & 0x3fff};
      }
      if (type === "VP8L" && size >= 5 && bytes[payload] === 0x2f) {
        const bits = view.getUint32(payload + 1, true);
        return {mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1};
      }
      at = payload + size + (size & 1);
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)) continue;
      const size = u16(bytes, at);
      if (size < 2 || at + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker ?? 0) && size >= 8) {
        return {mime: "image/jpeg", width: u16(bytes, at + 5), height: u16(bytes, at + 3)};
      }
      at += size;
    }
  }
  throw Error("Only valid PNG, JPEG and WebP raster files are supported");
}

export async function admitRaster(file: Blob, limits: Readonly<AssetLimits>): Promise<Raster & {payload: ArrayBuffer; asset: string}> {
  if (file.size === 0 || file.size > limits.maxFileBytes) throw Error("Image exceeds the encoded file budget");
  const bytes = new Uint8Array(await file.arrayBuffer()), raster = header(bytes);
  if (file.type && file.type !== raster.mime) throw Error("Image MIME does not match its bytes");
  if (!raster.width || !raster.height || raster.width > limits.maxDimension || raster.height > limits.maxDimension
    || raster.width * raster.height > limits.maxPixels) throw Error("Image exceeds the decoded dimension budget");
  const blob = new Blob([bytes], {type: raster.mime}), url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > limits.maxPixels
      || image.naturalWidth > limits.maxDimension || image.naturalHeight > limits.maxDimension) throw Error("Image decode exceeds its budget");
  } catch { throw Error("Image decode failed or exceeded its budget"); }
  finally { URL.revokeObjectURL(url); }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  return {...raster, payload: bytes.buffer, asset: `sha256:${hash}`};
}
