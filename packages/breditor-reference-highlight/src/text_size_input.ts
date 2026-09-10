import {
  MAX_REFERENCE_TEXT_SIZE_STEP,
  MIN_REFERENCE_TEXT_SIZE_STEP,
  REFERENCE_SIZE_SHOWCASE_IDS,
  type ReferenceTextSizeStep,
} from "./size_showcase_ids.js";

/** Exact typed input for the generated text-size set surface. */
export interface ReferenceTextSizeSetInput {
  readonly operation: "set";
  readonly properties: readonly [
    Readonly<{
      name: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty;
      value: ReferenceTextSizeStep;
    }>,
  ];
}

/** Exact property-free input that removes text size from the selection. */
export interface ReferenceTextSizeRemoveInput {
  readonly operation: "remove";
}

/**
 * Creates a canonical frozen text-size set input.
 *
 * The helper admits only the exact integer steps `0`, `1`, and `2`. Rust
 * repeats the authoritative property-contract validation during execution.
 */
export function createReferenceTextSizeSetInput(
  step: number,
): ReferenceTextSizeSetInput {
  assertTextSizeStep(step);
  return Object.freeze({
    operation: "set",
    properties: Object.freeze([
      Object.freeze({
        name: REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty,
        value: step,
      }),
    ] as const),
  });
}

/** Creates compact canonical JSON for the generated set intent/action. */
export function createReferenceTextSizeSetInputJson(step: number): string {
  return JSON.stringify(createReferenceTextSizeSetInput(step));
}

/** Creates the frozen text-size removal input. */
export function createReferenceTextSizeRemoveInput(): ReferenceTextSizeRemoveInput {
  return Object.freeze({ operation: "remove" });
}

/** Shared canonical removal JSON. */
export const REFERENCE_TEXT_SIZE_REMOVE_INPUT_JSON = JSON.stringify(
  createReferenceTextSizeRemoveInput(),
);

/** Returns compact canonical removal JSON for the generated surface. */
export function createReferenceTextSizeRemoveInputJson(): string {
  return REFERENCE_TEXT_SIZE_REMOVE_INPUT_JSON;
}

function assertTextSizeStep(value: number): asserts value is ReferenceTextSizeStep {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  ) {
    throw new TypeError("reference text size step is invalid");
  }
  if (
    value < MIN_REFERENCE_TEXT_SIZE_STEP ||
    value > MAX_REFERENCE_TEXT_SIZE_STEP
  ) {
    throw new RangeError("reference text size step is outside its fixed bounds");
  }
}
