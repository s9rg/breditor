/** Diagnostic-only alternative. It never compares the input double with a
 * numeric bound: sign, exponent and fractional bits determine membership in
 * u32. Negative zero is accepted, matching the existing selection contract.
 * The scratch buffer is local to the served module; primitive-only admission
 * prevents user conversion hooks. This is not a shipping workaround.
 */
export const selectionU32BitsCandidate = `const __breditorSelectionU32Bits = new DataView(new ArrayBuffer(8));
function isU32(value) {
    if (typeof value !== "number") return false;
    __breditorSelectionU32Bits.setFloat64(0, value, false);
    const high = __breditorSelectionU32Bits.getUint32(0, false);
    const low = __breditorSelectionU32Bits.getUint32(4, false);
    if (((high & 0x7fffffff) | low) === 0) return true;
    if ((high >>> 31) !== 0) return false;
    const exponent = ((high >>> 20) & 0x7ff) - 1023;
    if (exponent < 0 || exponent > 31) return false;
    if (exponent < 20) return low === 0 && (high & ((1 << (20 - exponent)) - 1)) === 0;
    return (low & (0xffffffff >>> (exponent - 20))) === 0;
}`;

const original = `function isU32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
}`;

/** Fail closed on source drift; never substitute a similar predicate elsewhere. */
export function replaceSelectionU32WithBits(code: string): string {
  if (code.split(original).length !== 2 || code.includes("__breditorSelectionU32Bits")) {
    throw new Error("Selection u32 candidate source differs");
  }
  return code.replace(original, selectionU32BitsCandidate);
}
