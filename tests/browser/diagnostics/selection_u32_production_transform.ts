import { selectionU32BitsCandidate } from "./selection_u32_bits_candidate";

/** Exact emitted selection guard from the shipping TypeScript build. */
export const selectionU32Production = `const __breditorSelectionU32Compact = new DataView(new ArrayBuffer(8));
function isU32(value) {
    if (!Number.isSafeInteger(value))
        return false;
    __breditorSelectionU32Compact.setFloat64(0, value, false);
    const high = __breditorSelectionU32Compact.getUint16(0, false);
    return high < 0x41f0 || high === 0x8000;
}`;

/** The previously shipped bound comparison, retained only as a test control. */
export const selectionU32Original = `function isU32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
}`;

export type SelectionU32Mode = "compact" | "original" | "bits";

/** Fail closed if the production source drifts; never modify another guard. */
export function transformSelectionU32Production(code: string, mode: SelectionU32Mode): string {
  if (code.split(selectionU32Production).length !== 2 ||
      code.includes("__breditorSelectionU32Bits")) {
    throw new Error("Selection u32 production source differs");
  }
  if (mode === "compact") return code;
  return code.replace(selectionU32Production,
    mode === "original" ? selectionU32Original : selectionU32BitsCandidate);
}
