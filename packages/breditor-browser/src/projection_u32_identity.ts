/** Exact identity for projection coordinates/counts, not a numeric coercion.
 *
 * Retained WebKit failures rejected equal captured integer operands. Compare
 * canonical primitive decimal keys instead of the mixed numeric equality path.
 * Each operand must independently be a u32; foreign objects and numeric strings
 * are never coerced. Existing document-size, preorder and shape checks remain
 * the caller's responsibility. This does not repair WebKit or retry a getter.
 */
const primitiveDecimal = String;

export function projectionU32sEqual(left: unknown, right: unknown): boolean {
  const key = projectionU32Key(left);
  return key !== null && key === projectionU32Key(right);
}

function projectionU32Key(value: unknown): string | null {
  if (typeof value !== "number") return null;
  const key = primitiveDecimal(value);
  // Number-to-string is exact and injective for finite numbers except zero
  // signs. Both zero signs were equal under the previous index comparison.
  // Validate the spelling and upper bound without comparing incoming numbers.
  if (!/^(?:0|[1-9][0-9]{0,9})$/u.test(key) ||
    (key.length === 10 && key > "4294967295")) return null;
  return key;
}
