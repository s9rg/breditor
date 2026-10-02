/**
 * Diagnostic candidate only. Re-create primitive numbers through an exact
 * decimal round trip; preserve signed zero and leave every non-number alone.
 * This does not validate, truncate, clamp, retry getters or coerce objects.
 */
export function normalizeBoundaryNumber(value: unknown): unknown {
  if (typeof value !== "number" || value === 0) return value;
  return Number(String(value));
}
