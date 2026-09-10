import {
  MAX_REFERENCE_TEXT_COLOR_RGB24,
  MIN_REFERENCE_TEXT_COLOR_RGB24,
  REFERENCE_COLOR_SHOWCASE_IDS,
} from "./color_showcase_ids.js";

/** Exact typed input for the generated RGB24 text-color set surface. */
export interface ReferenceTextColorSetInput {
  readonly operation: "set";
  readonly properties: readonly [
    Readonly<{
      name: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property;
      value: number;
    }>,
  ];
}

/** Exact property-free input that removes text color from the selection. */
export interface ReferenceTextColorRemoveInput {
  readonly operation: "remove";
}

/**
 * Creates a canonical frozen RGB24 set input.
 *
 * The helper admits only exact non-negative safe integers in the closed
 * `0x000000..=0xffffff` range. Rust repeats the authoritative validation when
 * the typed intent is executed.
 */
export function createReferenceTextColorSetInput(
  rgb24: number,
): ReferenceTextColorSetInput {
  assertRgb24(rgb24);
  return Object.freeze({
    operation: "set",
    properties: Object.freeze([
      Object.freeze({
        name: REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property,
        value: rgb24,
      }),
    ] as const),
  });
}

/** Creates compact canonical JSON for the generated set intent/action. */
export function createReferenceTextColorSetInputJson(rgb24: number): string {
  return JSON.stringify(createReferenceTextColorSetInput(rgb24));
}

/** Creates the frozen text-color removal input. */
export function createReferenceTextColorRemoveInput(): ReferenceTextColorRemoveInput {
  return Object.freeze({ operation: "remove" });
}

/** Shared canonical removal JSON. */
export const REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON = JSON.stringify(
  createReferenceTextColorRemoveInput(),
);

/** Returns compact canonical removal JSON for the generated surface. */
export function createReferenceTextColorRemoveInputJson(): string {
  return REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON;
}

function assertRgb24(value: number): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  ) {
    throw new TypeError("reference text color RGB24 value is invalid");
  }
  if (
    value < MIN_REFERENCE_TEXT_COLOR_RGB24 ||
    value > MAX_REFERENCE_TEXT_COLOR_RGB24
  ) {
    throw new RangeError("reference text color RGB24 value is outside its fixed bounds");
  }
}
