export const SHADOW_COUNTER_FIELDS = [
  "parentNodeShadowReads", "isConnectedShadowReads", "ownerDocumentShadowReads", "focusShadowCalls",
] as const;
type Counters = Record<typeof SHADOW_COUNTER_FIELDS[number], number>;
export interface ShadowCounterSnapshot<T> {
  outcome: T;
  frozen: boolean;
  counters: Record<typeof SHADOW_COUNTER_FIELDS[number], { type: string; decimal: string; json: string; bits: string }>;
}

/**
 * Carry this JSON-only fixture through a string, not Playwright's per-number
 * special-value encoder. Independent bit strings keep -0/NaN/infinities from
 * being hidden by native JSON's normalization. Does not rerun the operation.
 */
export function serializeShadowCounterSnapshot<T extends Counters>(outcome: T): string {
  const counters = Object.fromEntries(SHADOW_COUNTER_FIELDS.map(key => {
    const value = outcome[key];
    if (typeof value !== "number") return [key, { type: typeof value,
      decimal: "<not-number>", json: "<not-number>", bits: "<not-number>" }];
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, value, false);
    return [key, { type: typeof value, decimal: String(value), json: JSON.stringify(value),
      bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0") }];
  }));
  return JSON.stringify({ outcome, frozen: Object.isFrozen(outcome), counters });
}
