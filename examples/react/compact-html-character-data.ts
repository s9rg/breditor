import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/**
 * Compress the HTML entity lookup table as data at build time. Parsing logic,
 * admitted HTML, and the fully decoded lookup table are unchanged.
 */
export function compactHtmlCharacterData(): Plugin {
  return {
    name: "compact-html-character-data",
    apply: "build",
    enforce: "pre",
    transform(source, id) {
      const normalizedId = id.replaceAll("\\", "/");
      if (!normalizedId.endsWith("/entities/dist/generated/decode-data-html.js")) return;
      const table = source.match(/export const htmlDecodeTree = \/\* #__PURE__ \*\/ decodeBase64\("([A-Za-z0-9+/=]+)"\);/u)?.[1];
      if (table === undefined) return;

      const bytes = Buffer.from(table, "base64");
      if (bytes.length === 0 || bytes.length % 2 !== 0) return;
      const entries = bytes.length / 2;
      const columns = Buffer.alloc(bytes.length);
      // Group low and high bytes so the compression window sees adjacent
      // values from the same column without changing endianness.
      for (let index = 0; index < entries; index++) {
        columns[index] = bytes[index * 2]!;
        columns[entries + index] = bytes[index * 2 + 1]!;
      }

      const packed = gzipSync(columns, { level: 9 }).toString("base64");
      return `
const compressed = Uint8Array.from(atob(${JSON.stringify(packed)}), (unit) => unit.charCodeAt(0));
const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
const data = new Uint8Array(await new Response(stream).arrayBuffer());
const entries = data.length / 2;
export const htmlDecodeTree = Uint16Array.from(data.subarray(0, entries), (low, index) =>
  low | (data[entries + index] << 8));
`;
    },
  };
}
