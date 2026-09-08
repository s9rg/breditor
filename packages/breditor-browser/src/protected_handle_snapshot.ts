/** Maximum outer generated handles one ownership boundary may protect. */
export const MAX_PROTECTED_HANDLES = 64;

/**
 * Copies object identities from one dense caller-owned array without invoking
 * its indexed accessors, `length` getter, or iteration protocol.
 *
 * A failure returns `null` before ownership of any generated handle changes.
 * The optional required identity is added without consulting the input array.
 * @internal
 */
export function snapshotProtectedHandleArray(
  value: unknown,
  required?: unknown,
): ReadonlySet<object> | null {
  const snapshot = snapshotOwnDataArray(value, MAX_PROTECTED_HANDLES);
  if (snapshot === null) return null;
  const result = new Set<object>();
  if (objectLike(required)) result.add(required);
  for (let index = 0; index < snapshot.length; index += 1) {
    const item = snapshot[index];
    if (objectLike(item)) result.add(item);
  }
  return result;
}

/**
 * Copies one dense array through own data descriptors only. Custom iteration,
 * sparse slots, accessors, proxies which cannot prove descriptors, and values
 * beyond the caller's bound fail without executing indexed or length getters.
 * @internal
 */
export function snapshotOwnDataArray(
  value: unknown,
  maximumLength: number,
): readonly unknown[] | null {
  try {
    if (
      !Number.isInteger(maximumLength) ||
      maximumLength < 0 ||
      !Array.isArray(value)
    ) {
      return null;
    }
    if (Reflect.getOwnPropertyDescriptor(value, Symbol.iterator) !== undefined) {
      return null;
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > maximumLength
    ) {
      return null;
    }
    const result: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) return null;
      result[index] = descriptor.value as unknown;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
