/** Int32-storage diagnostic derived from numeric_transfer_staged_probe.ts.
 * Only safe for this synthetic 1/2048 input set. Bitwise coercion would corrupt
 * other valid editor numbers (fractions, -0, large unsigned values). Never use
 * this as a general editor fix. Timing and code shape also change.
 */
/** Reduced JavaScript-only control for the observed false upper-bound result.
 * Keep both the original expression and a separately captured variant: the
 * capture itself changes code shape and is not equivalent evidence of timing.
 */
function originalPositiveU32(value: number): boolean {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4_294_967_295;
}

function capturedPositiveU32(value: number) {
  const type = typeof value === "number";
  let integer: boolean | undefined;
  let lower: boolean | undefined;
  let upper: boolean | undefined;
  const accepted = type && (integer = Number.isInteger(value)) &&
    (lower = value >= 1) && (upper = value <= 4_294_967_295);
  return { accepted, type, integer, lower, upper };
}

function originalUpperBound(value: number): boolean {
  return value <= 4_294_967_295;
}

function snapshot(value: number) {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, value, false);
  return { decimal: String(value), bits: bits.getBigUint64(0, false).toString(16).padStart(16, "0") };
}

export async function probeNumericRange(iterations: number) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100_000) throw new Error("invalid diagnostic budget");
  const typed = new Float64Array([1, 2048]);
  const literal = [1, 2048];
  const parsed: number[] = JSON.parse("[1,2048]");
  const frozen = Object.freeze({ revision: typed[0]!, maximum: typed[1]! });
  let checks = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const index = iteration % 2;
    // Preserve the source-expression evaluation order, but expose each value
    // before it is placed in the temporary array. Diagnostic code shape only.
    const literalValue = literal[index]!;
    const typedValue = typed[index]!;
    const parsedValue = parsed[index]!;
    const convertedValue = Number(String(typed[index]!));
    const selectedValue = index === 0 ? frozen.revision : frozen.maximum;
    const values = [literalValue | 0, typedValue | 0, parsedValue | 0, convertedValue | 0, selectedValue | 0];
    for (let representation = 0; representation < values.length; representation++) {
      const value = values[representation]!;
      const original = originalPositiveU32(value);
      const captured = capturedPositiveU32(value);
      const upper = originalUpperBound(value);
      if (!original || !captured.accepted || !upper) {
        // These are the original booleans, with numeric snapshots taken later.
        const failure = { iteration, representation, original, captured, upper,
          value: snapshot(value), maximum: snapshot(4_294_967_295),
          recheck: capturedPositiveU32(value),
          // Cold-path rereads of our synthetic, private data only. These are
          // later observations, not replacements for the captured local.
          staged: { literal: snapshot(literalValue), typed: snapshot(typedValue), parsed: snapshot(parsedValue),
            converted: snapshot(convertedValue), selected: snapshot(selectedValue) },
          sourceIndex: snapshot(index), values: values.map(snapshot),
          sources: { literal: literal.map(snapshot), parsed: parsed.map(snapshot),
            typed: [snapshot(typed[0]!), snapshot(typed[1]!)],
            frozen: { revision: snapshot(frozen.revision), maximum: snapshot(frozen.maximum) } } };
        console.debug(`BREDITOR_RANGE_REJECTION=${JSON.stringify(failure)}`);
        throw new Error(`numeric range rejected: ${JSON.stringify(failure)}`);
      }
      checks += 3;
    }
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  // Keep counter strings independent of Playwright's numeric-value classifier.
  return { iterations: String(iterations), checks: String(checks) };
}
