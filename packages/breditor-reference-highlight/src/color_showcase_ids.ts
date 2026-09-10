import { REFERENCE_SHOWCASE_IDS } from "./showcase_ids.js";

/**
 * Exact semantic identities for the Showcase plus one closed RGB24 text color.
 *
 * Existing Showcase identities are reused verbatim. The additional extension
 * owns one property-aware inline format whose sole value is an opaque sRGB
 * integer; CSS syntax never crosses the semantic boundary.
 */
export const REFERENCE_COLOR_SHOWCASE_IDS = Object.freeze({
  ...REFERENCE_SHOWCASE_IDS,

  schemaName: "example/color-showcase-editor",
  schemaVersion: 1,

  textColorExtensionName: "example/text-color-extension",
  textColorExtensionVersion: 1,
  textColorFormatKind: "example/text-color",
  textColorFormatRevision: 1,
  textColorRgb24Property: "example/rgb24",
  textColorActionId: "example/set-text-color",
  textColorIntentId: "example/set-text-color-intent",
  textColorBindingId: "example/set-text-color-binding",
  textColorStateId: "example/text-color-presence",
} as const);

/** Lowest integer admitted by the closed RGB24 property contract. */
export const MIN_REFERENCE_TEXT_COLOR_RGB24 = 0 as const;

/** Highest integer admitted by the closed RGB24 property contract. */
export const MAX_REFERENCE_TEXT_COLOR_RGB24 = 0xff_ff_ff as const;
