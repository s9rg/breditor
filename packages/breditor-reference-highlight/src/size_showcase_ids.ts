import { REFERENCE_COLOR_SHOWCASE_IDS } from "./color_showcase_ids.js";

/**
 * Exact semantic identities for the Color Showcase plus one closed text size.
 *
 * Existing Color Showcase identities are reused verbatim. The fifth extension
 * owns one property-aware inline format whose value is a semantic three-step
 * scale; CSS lengths never cross the Rust data boundary.
 */
export const REFERENCE_SIZE_SHOWCASE_IDS = Object.freeze({
  ...REFERENCE_COLOR_SHOWCASE_IDS,

  schemaName: "example/size-showcase-editor",
  schemaVersion: 1,

  textSizeExtensionName: "example/text-size-extension",
  textSizeExtensionVersion: 1,
  textSizeFormatKind: "example/text-size",
  textSizeFormatRevision: 1,
  textSizeStepProperty: "example/text-size-step",
  textSizeActionId: "example/set-text-size",
  textSizeIntentId: "example/set-text-size-intent",
  textSizeBindingId: "example/set-text-size-binding",
  textSizeStateId: "example/text-size-presence",
} as const);

/** Lowest integer admitted by the closed text-size step contract. */
export const MIN_REFERENCE_TEXT_SIZE_STEP = 0 as const;

/** Highest integer admitted by the closed text-size step contract. */
export const MAX_REFERENCE_TEXT_SIZE_STEP = 2 as const;

/** One complete semantic value in the closed Small/Large/Huge scale. */
export type ReferenceTextSizeStep = 0 | 1 | 2;
