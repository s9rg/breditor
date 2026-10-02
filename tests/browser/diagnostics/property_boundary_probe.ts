import { validateProperty } from "virtual:breditor-property-validator";
import { REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON } from "@breditor/reference-highlight";
import { recordStartupRejection } from "./startup_recorder";
import { describeNumericComparison } from "./numeric_comparison_diagnostic";
import { createConstantBoundWasm } from "./constant_bound_wasm";

type Fields = readonly [unknown, unknown, unknown, unknown, unknown];

// Independent reference declarations: Link href and open-in-new-tab. Do not
// derive expected values from a previous Wasm read or from the validator itself.
const fields: readonly Fields[] = [
  ["string", undefined, undefined, 1, 2_048],
  ["boolean", undefined, undefined, undefined, undefined],
];
const expected = [
  '{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}',
  '{"kind":"boolean"}',
] as const;

function rejectInput(values: Fields, reference: Fields, iteration: number, propertyIndex: number, mismatchMask: number): never {
  const [kind, integerMinimum, integerMaximum, stringMinimum, stringMaximum] = values;
  const type = (value: unknown) => value === undefined ? 0 : typeof value === "number" ? 1 : 2;
  recordStartupRejection("descriptor:isolateProperty:1", {
    iteration, propertyIndex, mismatchMask,
    kindTag: kind === "boolean" ? 1 : kind === "integer" ? 2 : kind === "string" ? 3 : 0,
    integerMinimum, integerMaximum, stringMinimum, stringMaximum,
    integerMinimumType: type(integerMinimum), integerMaximumType: type(integerMaximum),
    stringMinimumType: type(stringMinimum), stringMaximumType: type(stringMaximum),
  });
  for (let field = 0; field < values.length; field++) {
    if ((mismatchMask & (1 << field)) !== 0) {
      recordStartupRejection("descriptor:isolateComparison:1", {
        field, ...describeNumericComparison(values[field], reference[field]),
      });
    }
  }
  throw new Error(`property isolation rejected at ${iteration}/${propertyIndex}; input mismatch mask ${mismatchMask}`);
}

function validate(values: Fields, iteration: number, propertyIndex: number): void {
  const reference = fields[propertyIndex]!;
  let mismatchMask = 0;
  for (let field = 0; field < reference.length; field++) {
    if (!Object.is(values[field], reference[field])) mismatchMask |= 1 << field;
  }
  if (mismatchMask !== 0) rejectInput(values, reference, iteration, propertyIndex, mismatchMask);
  const result = validateProperty(...values);
  if (JSON.stringify(result) !== expected[propertyIndex]) rejectInput(values, reference, iteration, propertyIndex, 0);
}

/**
 * Isolates the exact emitted private validator. JS mode never imports or
 * initializes Wasm. Wasm mode validates independently expected raw fields before
 * calling it, and reads each generated field only once per descriptor property.
 * No DOM/editor/selection/checkpoint logic is involved in either path.
 */
export async function probePropertyBoundary(mode: "javascript" | "wasm" | "tiny-wasm", iterations: number) {
  if ((mode !== "javascript" && mode !== "wasm" && mode !== "tiny-wasm") ||
      !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000) {
    throw new Error("Invalid bounded property probe request");
  }
  const wasm = mode === "wasm" ? await import("@breditor/wasm") : undefined;
  if (wasm !== undefined) await wasm.default();
  const constantBound = mode === "tiny-wasm" ? createConstantBoundWasm() : undefined;
  let reads = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (wasm === undefined) {
      for (let propertyIndex = 0; propertyIndex < fields.length; propertyIndex++) {
        // Use fresh actual tuples in both controls: never compare the expected
        // array to itself in JS mode. Only the bound's source differs.
        const captured: Fields = propertyIndex === 0
          ? ["string", undefined, undefined, 1, constantBound === undefined ? 2048 : constantBound(iteration, 2, 0)]
          : ["boolean", undefined, undefined, undefined, undefined];
        validate(captured, iteration, propertyIndex);
        reads++;
      }
    } else {
      const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV2(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON);
      let profile: ReturnType<typeof compiled.takeProfile>;
      try { profile = compiled.takeProfile(); } finally { compiled.free(); }
      if (profile === undefined) throw new Error(`property profile missing at ${iteration}`);
      try {
        const view = profile.descriptor();
        try {
          const count = view.formatPropertyCount(2);
          if (count !== 2) {
            recordStartupRejection("descriptor:isolateCount:1", { iteration, count });
            throw new Error(`property count differs at ${iteration}`);
          }
          for (let propertyIndex = 0; propertyIndex < fields.length; propertyIndex++) {
            const captured: Fields = [
              view.formatPropertyValueType(2, propertyIndex),
              view.formatPropertyIntegerMinimum(2, propertyIndex),
              view.formatPropertyIntegerMaximum(2, propertyIndex),
              view.formatPropertyStringMinimumUtf8Bytes(2, propertyIndex),
              view.formatPropertyStringMaximumUtf8Bytes(2, propertyIndex),
            ];
            validate(captured, iteration, propertyIndex);
            reads++;
          }
        } finally { view.free(); }
      } finally { profile.free(); }
    }
    if (iteration % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { mode, iterations, reads };
}
