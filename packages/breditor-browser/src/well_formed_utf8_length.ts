/**
 * Counts UTF-8 bytes without allocating an encoded copy. Rejects unpaired UTF-16
 * surrogates (rather than replacing them) and stops at the caller's byte limit.
 * Internal durable-boundary helper; callers supply a nonnegative byte limit.
 */
export function wellFormedUtf8Length(value: string, maximum: number): number | null {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first <= 0x7f) {
      bytes += 1;
    } else if (first <= 0x7ff) {
      bytes += 2;
    } else if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
    if (bytes > maximum) return null;
  }
  return bytes;
}
