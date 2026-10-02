import { createConstantBoundWasm } from "./constant_bound_wasm";
import { createConstantI32BoundWasm } from "./constant_bound_i32_wasm";
import { describeNumericComparison } from "./numeric_comparison_diagnostic";
import { recordStartupRejection } from "./startup_recorder";

export const numberTransportModes = ["javascript", "f64", "i32", "f64-u32", "f64-text"] as const;
export type NumberTransportMode = typeof numberTransportModes[number];

const expected: readonly (readonly unknown[])[] = [
  ["string", undefined, undefined, 1, 2048],
  ["boolean", undefined, undefined, undefined, undefined],
];

function compare(actual: readonly unknown[], reference: readonly unknown[], iteration: number, propertyIndex: number) {
  let mismatchMask = 0;
  for (let field = 0; field < reference.length; field++) {
    if (!Object.is(actual[field], reference[field])) mismatchMask |= 1 << field;
  }
  if (mismatchMask === 0) return;
  recordStartupRejection("descriptor:numberTransport:1", { iteration, propertyIndex, mismatchMask });
  for (let field = 0; field < reference.length; field++) {
    if ((mismatchMask & (1 << field)) !== 0) {
      recordStartupRejection("descriptor:numberComparison:1", {
        field, ...describeNumericComparison(actual[field], reference[field]),
      });
    }
  }
  throw new Error(`number transport mismatch at ${iteration}/${propertyIndex}, mask ${mismatchMask}`);
}

/**
 * Comparison-only reproduction: no Breditor packages, validator, Rust, glue,
 * memory or imports. Conversion modes apply only to a known fixed 2048 fixture;
 * they are not proposals to truncate or coerce untrusted production metadata.
 */
export async function probeNumberTransport(mode: NumberTransportMode, iterations: number) {
  if (!numberTransportModes.includes(mode) || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000) {
    throw new Error("Invalid bounded number transport request");
  }
  const bound = mode === "javascript" ? undefined
    : mode === "i32" ? createConstantI32BoundWasm() : createConstantBoundWasm();
  let comparisons = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const raw = bound === undefined ? 2048 : bound(iteration, 2, 0);
    const value = mode === "f64-u32" ? raw >>> 0 : mode === "f64-text" ? Number(String(raw)) : raw;
    compare(["string", undefined, undefined, 1, value], expected[0]!, iteration, 0);
    compare(["boolean", undefined, undefined, undefined, undefined], expected[1]!, iteration, 1);
    comparisons += 10;
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { mode, iterations, comparisons };
}
