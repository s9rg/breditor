/** Canonical lowercase HTML simple-color prefix and digits. */
const RGB24_DIGITS = "0123456789abcdef";
const RGB24_MINIMUM = 0;
const RGB24_MAXIMUM = 16_777_215;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const stringCharCodeAt = String.prototype.charCodeAt;

/** Returns whether a hostile scalar is exactly representable as RGB24. @internal */
export function isToolbarInlineFormatRgb24Integer(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    numberIsSafeInteger(value) &&
    !objectIs(value, -0) &&
    value >= RGB24_MINIMUM &&
    value <= RGB24_MAXIMUM
  );
}

/** Converts an exact RGB24 integer to canonical lowercase `#rrggbb`. @internal */
export function encodeToolbarInlineFormatRgb24Color(
  value: unknown,
): string | null {
  if (!isToolbarInlineFormatRgb24Integer(value)) return null;
  return `#${RGB24_DIGITS[(value >>> 20) & 0xf]}${
    RGB24_DIGITS[(value >>> 16) & 0xf]
  }${RGB24_DIGITS[(value >>> 12) & 0xf]}${
    RGB24_DIGITS[(value >>> 8) & 0xf]
  }${RGB24_DIGITS[(value >>> 4) & 0xf]}${RGB24_DIGITS[value & 0xf]}`;
}

/** Converts only canonical lowercase `#rrggbb` to an RGB24 integer. @internal */
export function decodeToolbarInlineFormatRgb24Color(
  value: unknown,
): number | null {
  if (typeof value !== "string" || value.length !== 7 || value[0] !== "#") {
    return null;
  }
  let result = 0;
  for (let index = 1; index < value.length; index += 1) {
    const code = reflectApply(stringCharCodeAt, value, [index]) as number;
    const digit = code >= 48 && code <= 57
      ? code - 48
      : code >= 97 && code <= 102
        ? code - 87
        : -1;
    if (digit < 0) return null;
    result = (result * 16) + digit;
  }
  return result;
}
