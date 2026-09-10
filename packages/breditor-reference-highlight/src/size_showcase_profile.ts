import {
  MAX_REFERENCE_TEXT_SIZE_STEP,
  MIN_REFERENCE_TEXT_SIZE_STEP,
  REFERENCE_SIZE_SHOWCASE_IDS,
} from "./size_showcase_ids.js";
import {
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP,
  type ReferenceColorShowcaseProfileBootstrap,
} from "./color_showcase_profile.js";

type EmptyTuple = readonly [];

/** Exact fifth extension declaration for the Text Size Showcase. */
export interface ReferenceSizeShowcaseTextSizeExtensionBootstrap {
  readonly id: Readonly<{
    name: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeExtensionName;
    version: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeExtensionVersion;
  }>;
  readonly dependencies: EmptyTuple;
  readonly conflicts: EmptyTuple;
  readonly inlineFormats: readonly [
    Readonly<{
      kind: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind;
      revision: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatRevision;
    }>,
  ];
  readonly inlineFormatPropertyContracts: readonly [
    Readonly<{
      formatKind: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind;
      properties: readonly [
        Readonly<{
          name: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty;
          presence: "required";
          valueType: Readonly<{
            kind: "integer";
            minimum: typeof MIN_REFERENCE_TEXT_SIZE_STEP;
            maximum: typeof MAX_REFERENCE_TEXT_SIZE_STEP;
          }>;
        }>,
      ];
    }>,
  ];
  readonly inlineFormatToggles: EmptyTuple;
  readonly inlineFormatSets: readonly [
    Readonly<{
      formatKind: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind;
      actionId: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeActionId;
      intentId: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeIntentId;
      bindingId: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeBindingId;
      actionStateId: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeStateId;
    }>,
  ];
}

/** Exact data-only Profile Bootstrap V2 for the Text Size Showcase. */
export interface ReferenceSizeShowcaseProfileBootstrap {
  readonly format: "breditor/profile-bootstrap";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_SIZE_SHOWCASE_IDS.schemaName;
    version: typeof REFERENCE_SIZE_SHOWCASE_IDS.schemaVersion;
  }>;
  readonly extensions: readonly [
    ReferenceColorShowcaseProfileBootstrap["extensions"][0],
    ReferenceColorShowcaseProfileBootstrap["extensions"][1],
    ReferenceColorShowcaseProfileBootstrap["extensions"][2],
    ReferenceColorShowcaseProfileBootstrap["extensions"][3],
    Readonly<ReferenceSizeShowcaseTextSizeExtensionBootstrap>,
  ];
}

/**
 * Immutable semantic profile for the Color Showcase plus text size.
 *
 * Rust compiles the bounded integer contract and generates the set/remove
 * action, typed intent, binding, and tracked state. Token-to-CSS presentation
 * remains a separately closed browser policy.
 */
export const REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP: ReferenceSizeShowcaseProfileBootstrap =
  Object.freeze({
    format: "breditor/profile-bootstrap",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_SIZE_SHOWCASE_IDS.schemaName,
      version: REFERENCE_SIZE_SHOWCASE_IDS.schemaVersion,
    }),
    extensions: Object.freeze([
      REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP.extensions[0],
      REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP.extensions[1],
      REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP.extensions[2],
      REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP.extensions[3],
      Object.freeze({
        id: Object.freeze({
          name: REFERENCE_SIZE_SHOWCASE_IDS.textSizeExtensionName,
          version: REFERENCE_SIZE_SHOWCASE_IDS.textSizeExtensionVersion,
        }),
        dependencies: Object.freeze([] as const),
        conflicts: Object.freeze([] as const),
        inlineFormats: Object.freeze([
          Object.freeze({
            kind: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
            revision: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatRevision,
          }),
        ] as const),
        inlineFormatPropertyContracts: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
            properties: Object.freeze([
              Object.freeze({
                name: REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty,
                presence: "required" as const,
                valueType: Object.freeze({
                  kind: "integer" as const,
                  minimum: MIN_REFERENCE_TEXT_SIZE_STEP,
                  maximum: MAX_REFERENCE_TEXT_SIZE_STEP,
                }),
              }),
            ] as const),
          }),
        ] as const),
        inlineFormatToggles: Object.freeze([] as const),
        inlineFormatSets: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
            actionId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeActionId,
            intentId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeIntentId,
            bindingId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeBindingId,
            actionStateId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeStateId,
          }),
        ] as const),
      }),
    ] as const),
  });

/** Compact Profile Bootstrap V2 JSON accepted by the Wasm boundary. */
export const REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON = JSON.stringify(
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
);

/** Durable fingerprint emitted by Rust for this exact content schema. */
export const REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT =
  "sha256:ec554b29919bd84ec013ea2af4d0248e1a3fabdcb1514bb642035871a49189d5" as const;
