function data(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function number(value: unknown) {
  if (typeof value !== "number") return { type: typeof value };
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value, false);
  return { type: "number", decimal: String(value), bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0") };
}

function name(value: unknown) {
  return value === "example/href" || value === "example/open-in-new-window" ? value : "unknown";
}

function properties(value: unknown) {
  const length = data(value, "length");
  const items: { name: string; presence: string; valueType: string }[] = [];
  if (Array.isArray(value) && typeof length === "number" && Number.isSafeInteger(length) && length >= 0 && length <= 32) {
    for (let i = 0; i < length; i++) {
      const item = data(value, String(i));
      const presence = data(item, "presence");
      // Values and contract bounds are intentionally not retained.
      items.push({ name: name(data(item, "name")),
        presence: presence === "required" || presence === "optional" ? presence : "unknown",
        valueType: typeof data(item, "value") });
    }
  }
  return { length: number(length), items };
}

/** Cold-path, later observations of an already-rejected required-property check.
 * Own data descriptors only; no getters, input strings or property values retained.
 */
export function snapshotRequiredProperty(format: unknown, contractIndex: unknown,
  contract: unknown, propertyArray: unknown, accepted: unknown) {
  try {
    return {
      format: format === "example/link" || format === "example/highlight" || format === "breditor/strong" ? format : "unknown",
      contractIndex: number(contractIndex),
      contract: properties(data(contract, "properties")),
      supplied: properties(data(propertyArray, "values")),
      accepted: properties(accepted),
    };
  } catch { return { unreadable: true }; }
}
