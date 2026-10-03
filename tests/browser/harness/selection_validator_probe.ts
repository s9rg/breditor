import { diagnosticIsU32, diagnosticReadPoint } from "virtual:breditor-selection-validator";

/** Reduction of the exact production predicates, with neither Wasm nor editor ownership. */
export function probeSelectionValidator(iterations: number, transport: "literal" | "decimal"): string {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100_000) throw new Error("invalid probe length");
  if (transport !== "literal" && transport !== "decimal") throw new Error("invalid transport");
  const valid = [0, -0, 2, 6, 2048, 2_147_483_648, 4_294_967_295];
  let coercions = 0;
  const invalid: unknown[] = [undefined, null, false, true, "6", 6n, Symbol("coordinate"),
    NaN, Infinity, -Infinity, -1, -4_294_967_296, -0.5, Number.MIN_VALUE, 0.5,
    4_294_967_295.5, 4_294_967_296, Number.MAX_SAFE_INTEGER, new Number(6), {}, [],
    { [Symbol.toPrimitive]() { coercions++; throw new Error("must not coerce"); } }];
  const fixtures = [...valid.map(value => ({ value, expected: true })),
    ...invalid.map(value => ({ value, expected: false }))];
  let checks = 0;
  for (let cycle = 0; cycle < iterations; cycle++) {
    for (const [index, fixture] of fixtures.entries()) {
      const original = fixture.value;
      // Match the ordinary decimal normalization path for nonzero primitive numbers.
      const value = transport === "decimal" && typeof original === "number" && !Object.is(original, -0)
        ? Number(String(original)) : original;
      if (diagnosticIsU32(value) !== fixture.expected) {
        throw new Error(`selection predicate cycle=${cycle} fixture=${index} transport=${transport}`);
      }
      for (const field of ["nodeIndex", "offset"] as const) {
        const nodeIndex = field === "nodeIndex" ? value : 6;
        const offset = field === "offset" ? value : 0;
        const point = diagnosticReadPoint("text", nodeIndex, offset, "after");
        if ((point !== null) !== fixture.expected || (point !== null &&
            (!Object.is(point.nodeIndex, nodeIndex) || !Object.is(point.offset, offset) ||
             point.kind !== "text" || point.affinity !== "after"))) {
          throw new Error(`selection point cycle=${cycle} fixture=${index} field=${field} transport=${transport}`);
        }
      }
      checks += 3;
    }
  }
  if (coercions !== 0) throw new Error("numeric validation coerced an object");
  return JSON.stringify({ format: "breditor/js-selection-validator", transport,
    cycles: String(iterations), fixtures: String(fixtures.length), checks: String(checks), coercions: "0" });
}
