import {
  MAX_REFERENCE_TEXT_COLOR_RGB24,
  MIN_REFERENCE_TEXT_COLOR_RGB24,
  REFERENCE_COLOR_SHOWCASE_IDS,
} from "./color_showcase_ids.js";
import {
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
  type ReferenceShowcaseProfileBootstrap,
} from "./showcase_profile.js";

type EmptyTuple = readonly [];

/** Exact fourth extension declaration for the RGB24 Color Showcase. */
export interface ReferenceColorShowcaseTextColorExtensionBootstrap {
  readonly id: Readonly<{
    name: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorExtensionName;
    version: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorExtensionVersion;
  }>;
  readonly dependencies: EmptyTuple;
  readonly conflicts: EmptyTuple;
  readonly inlineFormats: readonly [
    Readonly<{
      kind: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind;
      revision: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatRevision;
    }>,
  ];
  readonly inlineFormatPropertyContracts: readonly [
    Readonly<{
      formatKind: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind;
      properties: readonly [
        Readonly<{
          name: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property;
          presence: "required";
          valueType: Readonly<{
            kind: "integer";
            minimum: typeof MIN_REFERENCE_TEXT_COLOR_RGB24;
            maximum: typeof MAX_REFERENCE_TEXT_COLOR_RGB24;
          }>;
        }>,
      ];
    }>,
  ];
  readonly inlineFormatToggles: EmptyTuple;
  readonly inlineFormatSets: readonly [
    Readonly<{
      formatKind: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind;
      actionId: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorActionId;
      intentId: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorIntentId;
      bindingId: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorBindingId;
      actionStateId: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorStateId;
    }>,
  ];
}

/** Exact data-only Profile Bootstrap V2 for the RGB24 Color Showcase. */
export interface ReferenceColorShowcaseProfileBootstrap {
  readonly format: "breditor/profile-bootstrap";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_COLOR_SHOWCASE_IDS.schemaName;
    version: typeof REFERENCE_COLOR_SHOWCASE_IDS.schemaVersion;
  }>;
  readonly extensions: readonly [
    ReferenceShowcaseProfileBootstrap["extensions"][0],
    ReferenceShowcaseProfileBootstrap["extensions"][1],
    ReferenceShowcaseProfileBootstrap["extensions"][2],
    Readonly<ReferenceColorShowcaseTextColorExtensionBootstrap>,
  ];
}

/**
 * Immutable semantic profile for the existing Showcase plus RGB24 text color.
 *
 * Rust compiles the integer property contract and generates the set/remove
 * action, typed intent, binding, and tracked value state. No Rust callback or
 * JavaScript mutation implementation is supplied by this reference package.
 */
export const REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP: ReferenceColorShowcaseProfileBootstrap =
  Object.freeze({
    format: "breditor/profile-bootstrap",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_COLOR_SHOWCASE_IDS.schemaName,
      version: REFERENCE_COLOR_SHOWCASE_IDS.schemaVersion,
    }),
    extensions: Object.freeze([
      REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[0],
      REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[1],
      REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[2],
      Object.freeze({
        id: Object.freeze({
          name: REFERENCE_COLOR_SHOWCASE_IDS.textColorExtensionName,
          version: REFERENCE_COLOR_SHOWCASE_IDS.textColorExtensionVersion,
        }),
        dependencies: Object.freeze([] as const),
        conflicts: Object.freeze([] as const),
        inlineFormats: Object.freeze([
          Object.freeze({
            kind: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
            revision: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatRevision,
          }),
        ] as const),
        inlineFormatPropertyContracts: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
            properties: Object.freeze([
              Object.freeze({
                name: REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property,
                presence: "required" as const,
                valueType: Object.freeze({
                  kind: "integer" as const,
                  minimum: MIN_REFERENCE_TEXT_COLOR_RGB24,
                  maximum: MAX_REFERENCE_TEXT_COLOR_RGB24,
                }),
              }),
            ] as const),
          }),
        ] as const),
        inlineFormatToggles: Object.freeze([] as const),
        inlineFormatSets: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
            actionId: REFERENCE_COLOR_SHOWCASE_IDS.textColorActionId,
            intentId: REFERENCE_COLOR_SHOWCASE_IDS.textColorIntentId,
            bindingId: REFERENCE_COLOR_SHOWCASE_IDS.textColorBindingId,
            actionStateId: REFERENCE_COLOR_SHOWCASE_IDS.textColorStateId,
          }),
        ] as const),
      }),
    ] as const),
  });

/** Compact Profile Bootstrap V2 JSON accepted by the Wasm boundary. */
export const REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON = JSON.stringify(
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP,
);

/**
 * Durable fingerprint emitted by the Rust compiler for this exact content
 * schema. This literal is verified against the Wasm compiler in tests.
 */
export const REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT =
  "sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d" as const;
