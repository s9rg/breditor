/**
 * Cold-path evidence for one already-captured pair. Rechecks are observations
 * made after a failure, not the original predicate result or a retry policy.
 * Non-numeric values are represented only by type tags; no coercion hooks run.
 */
export function describeNumericComparison(actual: unknown, expected: unknown) {
  const tag = (value: unknown) => value === undefined ? 0 : typeof value === "number" ? 1 : 2;
  const metadata: Record<string, number> = {
    actualType: tag(actual), expectedType: tag(expected),
    objectIsRecheck: Object.is(actual, expected) ? 1 : 0,
    strictEqualRecheck: actual === expected ? 1 : 0,
  };
  for (const [prefix, value] of [["actual", actual], ["expected", expected]] as const) {
    if (typeof value !== "number") continue;
    metadata[prefix] = value;
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, value, false);
    metadata[`${prefix}High`] = bits.getUint32(0, false);
    metadata[`${prefix}Low`] = bits.getUint32(4, false);
  }
  return metadata;
}
