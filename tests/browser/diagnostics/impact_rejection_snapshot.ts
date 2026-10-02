function field(value: unknown, key: string) {
  if (value === null || typeof value !== "object") return { kind: "missing" };
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return { kind: "missing" };
  if (!("value" in descriptor)) return { kind: "accessor" };
  return { kind: "data", value: descriptor.value as unknown };
}

function scalar(value: unknown) {
  if (typeof value !== "number") return { type: typeof value };
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value, false);
  return { type: "number", decimal: String(value), bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0") };
}

/** Later observations of already-captured update metadata after rejection.
 * Never invokes generated getters, reads document data, or repeats predicates.
 */
export function snapshotImpactRejection(snapshot: unknown, affectedParagraphCount: unknown) {
  try {
    const impact = field(snapshot, "impact");
    const value = impact.value;
    const ranges = Object.fromEntries(["oldChildStart", "oldChildEnd", "newChildStart", "newChildEnd"].map(key => {
      const entry = field(snapshot, key);
      return [key, { field: entry.kind, ...scalar(entry.value) }];
    }));
    const count = field(snapshot, "affectedParagraphCount");
    return {
      impact: value === "none" || value === "textContainers" || value === "rootSplice" || value === "root" ? value : "unknown",
      affectedParagraphCount: scalar(affectedParagraphCount),
      snapshotCount: { field: count.kind, ...scalar(count.value) },
      ranges,
    };
  } catch { return { unreadable: true }; }
}
