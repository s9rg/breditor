/** Bounded test-only import history. No arbitrary strings, document text, or object contents. */
type Scalar = { type: string; label?: string };
const labels = new Set(["text", "children", "before", "after"]);
const events: { left: Scalar; right: Scalar; result: boolean }[] = [];
function scalar(value: unknown): Scalar {
  return typeof value === "string" && labels.has(value) ? { type: "string", label: value } : { type: typeof value };
}
export function recordWasmEquality(result: boolean, left: unknown, right: unknown): boolean {
  if (events.length === 16) events.shift();
  events.push({ left: scalar(left), right: scalar(right), result });
  return result;
}
export function readWasmEqualities() { return structuredClone(events); }
/** Sanitize the inline ring only when the runner requests its final snapshot. */
export function sanitizeWasmEqualities(values: readonly (readonly [unknown, unknown, boolean])[]) {
  return values.map(([left, right, result]) => ({ left: scalar(left), right: scalar(right), result }));
}
