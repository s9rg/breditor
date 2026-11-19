/**
 * Candidate rich V4 image-link target subset. This package has no runtime dependency on
 * `@breditor/browser`, so it keeps an identical copy of `isImageLinkHrefV1` from
 * `packages/breditor-browser/src/image_link_href.ts`; a parity test compares both. It mirrors
 * Rust `rich_content/image_link.rs` exactly (the Rust owner remains authoritative): a canonical
 * credential-free absolute HTTP(S) URL that is its own WHATWG serialization, at most 2,048 bytes.
 * Import canonicalizes with the inline-link `safeUrl` policy first, then requires this subset.
 */
export const MAX_IMAGE_LINK_HREF_V1_BYTES = 2_048;
export const imageHrefProperty = "breditor/image-href";
export const imageLinkNewWindowProperty = "breditor/image-link-new-window";

const PCHAR = /^[A-Za-z0-9\-._~!$&'()*+,;=:@]$/u;
const isPchar = (c: string): boolean => PCHAR.test(c);
const isQueryChar = (c: string): boolean => c === "/" || c === "?" || isPchar(c);
const HEX = /^[0-9A-Fa-f]{2}$/u;

function validChars(value: string, allowed: (c: string) => boolean): boolean {
  for (let index = 0; index < value.length;) {
    const c = value[index]!;
    if (c === "%") {
      if (!HEX.test(value.slice(index + 1, index + 3))) return false;
      index += 3;
    } else if (allowed(c)) index += 1;
    else return false;
  }
  return true;
}

function validSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return ![".", "..", "%2e", ".%2e", "%2e.", "%2e%2e"].includes(lower) && validChars(segment, isPchar);
}

function validPort(port: string, defaultPort: number): boolean {
  if (!/^(0|[1-9][0-9]{0,4})$/u.test(port)) return false;
  const value = Number(port);
  return value <= 65_535 && value !== defaultPort;
}

function validHost(host: string): boolean {
  if (host === "") return false;
  const labels = host.split(".");
  if (labels.some(label => !/^[a-z0-9_-]+$/u.test(label))) return false;
  const last = labels[labels.length - 1]!;
  const numeric = /^[0-9]+$/u.test(last) || last.startsWith("0x");
  if (!numeric) return true;
  return labels.length === 4 && labels.every(label => /^(0|[1-9][0-9]{0,2})$/u.test(label) && Number(label) <= 255);
}

/**
 * Whether `value` is an admitted canonical image-link target (the exact Rust
 * subset). Every admitted value is its own WHATWG URL serialization.
 */
export function isImageLinkHrefV1(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_IMAGE_LINK_HREF_V1_BYTES) return false;
  for (let index = 0; index < value.length; index += 1) if (value.charCodeAt(index) > 0x7f) return false;
  let rest: string, defaultPort: number;
  if (value.startsWith("https://")) { rest = value.slice(8); defaultPort = 443; }
  else if (value.startsWith("http://")) { rest = value.slice(7); defaultPort = 80; }
  else return false;
  const end = rest.search(/[/?#]/u), authorityEnd = end < 0 ? rest.length : end;
  const authority = rest.slice(0, authorityEnd);
  rest = rest.slice(authorityEnd);
  const colon = authority.indexOf(":");
  const host = colon < 0 ? authority : authority.slice(0, colon);
  if (!validHost(host) || colon >= 0 && !validPort(authority.slice(colon + 1), defaultPort)) return false;
  if (!rest.startsWith("/")) return false;
  rest = rest.slice(1);
  const hash = rest.indexOf("#");
  const beforeFragment = hash < 0 ? rest : rest.slice(0, hash), fragment = hash < 0 ? null : rest.slice(hash + 1);
  const question = beforeFragment.indexOf("?");
  const path = question < 0 ? beforeFragment : beforeFragment.slice(0, question), query = question < 0 ? null : beforeFragment.slice(question + 1);
  return path.split("/").every(validSegment) &&
    (query === null || validChars(query, c => c !== "'" && isQueryChar(c))) &&
    (fragment === null || validChars(fragment, isQueryChar));
}
