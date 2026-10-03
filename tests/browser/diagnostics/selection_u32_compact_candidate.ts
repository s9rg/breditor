/** Diagnostic-only u32 guard that checks the IEEE-754 high word instead of
 * comparing a double against the u32 upper bound. The safe-integer check
 * rejects fractions, NaN, infinity, and non-numbers without coercion.
 * With that precondition, high word 0x41f0 starts at 2^32; 0x8000 is -0.
 */
export const selectionU32CompactCandidate = `const __breditorSelectionU32Compact = new DataView(new ArrayBuffer(8));
function isU32(value) {
    if (!Number.isSafeInteger(value)) return false;
    __breditorSelectionU32Compact.setFloat64(0, value, false);
    const high = __breditorSelectionU32Compact.getUint16(0, false);
    return high < 0x41f0 || high === 0x8000;
}`;

const original = `function isU32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
}`;

/** Fail closed on source drift and substitute only the selection predicate. */
export function replaceSelectionU32WithCompact(code: string): string {
  if (code.split(original).length !== 2 || code.includes("__breditorSelectionU32Compact")) {
    throw new Error("Selection u32 compact source differs");
  }
  return code.replace(original, selectionU32CompactCandidate);
}
