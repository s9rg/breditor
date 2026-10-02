/**
 * Re-materialize captured primitive numbers before boundary validation.
 *
 * Mitigates observed JavaScriptCore numeric-representation failures without
 * changing the Rust ABI or accepting values that validation would reject.
 * Decimal conversion round-trips the number. Do not compare the incoming
 * number before that conversion: the comparison itself can use the affected
 * mixed-representation engine path. Inspect the sign byte only for zero so
 * both zero signs survive and positive zero is re-materialized as well.
 * Never coerce foreign objects or re-read a getter.
 * This is not a general engine repair: see docs/WEBKIT_WASM_NUMBER_REPRO.md.
 * Kept private to the boundary adapters, not exported by the package entrypoints.
 */
const zeroBits = new DataView(new ArrayBuffer(8));

export function normalizeWasmBoundaryNumber(value: unknown): unknown {
  if (typeof value !== "number") return value;
  const decimal = String(value);
  if (decimal !== "0") return Number(decimal);
  // Synchronous primitive-only access: no getters, foreign coercion or await
  // can re-enter this private scratch buffer. Big-endian byte 0 holds the sign.
  zeroBits.setFloat64(0, value, false);
  return zeroBits.getUint8(0) === 0x80 ? -0 : 0;
}
