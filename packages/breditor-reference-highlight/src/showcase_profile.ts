import {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  type ReferenceFormattingProfileBootstrap,
} from "./formatting_profile.js";
import { REFERENCE_SHOWCASE_IDS } from "./showcase_ids.js";

type EmptyTuple = readonly [];

export interface ReferenceShowcaseToggleBootstrap<
  FormatKind extends string,
  ActionId extends string,
  IntentId extends string,
  BindingId extends string,
  ActionStateId extends string,
> {
  readonly formatKind: FormatKind;
  readonly actionId: ActionId;
  readonly intentId: IntentId;
  readonly bindingId: BindingId;
  readonly actionStateId: ActionStateId;
}

/** Exact third extension declaration added by the showcase profile. */
export interface ReferenceShowcaseTextStylesExtensionBootstrap {
  readonly id: Readonly<{
    name: typeof REFERENCE_SHOWCASE_IDS.textStylesExtensionName;
    version: typeof REFERENCE_SHOWCASE_IDS.textStylesExtensionVersion;
  }>;
  readonly dependencies: EmptyTuple;
  readonly conflicts: EmptyTuple;
  readonly inlineFormats: readonly [
    Readonly<{
      kind: typeof REFERENCE_SHOWCASE_IDS.emphasisFormatKind;
      revision: typeof REFERENCE_SHOWCASE_IDS.emphasisFormatRevision;
    }>,
    Readonly<{
      kind: typeof REFERENCE_SHOWCASE_IDS.strikethroughFormatKind;
      revision: typeof REFERENCE_SHOWCASE_IDS.strikethroughFormatRevision;
    }>,
    Readonly<{
      kind: typeof REFERENCE_SHOWCASE_IDS.codeFormatKind;
      revision: typeof REFERENCE_SHOWCASE_IDS.codeFormatRevision;
    }>,
  ];
  readonly inlineFormatPropertyContracts: EmptyTuple;
  readonly inlineFormatToggles: readonly [
    Readonly<
      ReferenceShowcaseToggleBootstrap<
        typeof REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
        typeof REFERENCE_SHOWCASE_IDS.emphasisActionId,
        typeof REFERENCE_SHOWCASE_IDS.emphasisIntentId,
        typeof REFERENCE_SHOWCASE_IDS.emphasisBindingId,
        typeof REFERENCE_SHOWCASE_IDS.emphasisActionStateId
      >
    >,
    Readonly<
      ReferenceShowcaseToggleBootstrap<
        typeof REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
        typeof REFERENCE_SHOWCASE_IDS.strikethroughActionId,
        typeof REFERENCE_SHOWCASE_IDS.strikethroughIntentId,
        typeof REFERENCE_SHOWCASE_IDS.strikethroughBindingId,
        typeof REFERENCE_SHOWCASE_IDS.strikethroughActionStateId
      >
    >,
    Readonly<
      ReferenceShowcaseToggleBootstrap<
        typeof REFERENCE_SHOWCASE_IDS.codeFormatKind,
        typeof REFERENCE_SHOWCASE_IDS.codeActionId,
        typeof REFERENCE_SHOWCASE_IDS.codeIntentId,
        typeof REFERENCE_SHOWCASE_IDS.codeBindingId,
        typeof REFERENCE_SHOWCASE_IDS.codeActionStateId
      >
    >,
  ];
  readonly inlineFormatSets: EmptyTuple;
}

/** Exact data-only Profile Bootstrap V2 for the complete showcase. */
export interface ReferenceShowcaseProfileBootstrap {
  readonly format: "breditor/profile-bootstrap";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_SHOWCASE_IDS.schemaName;
    version: typeof REFERENCE_SHOWCASE_IDS.schemaVersion;
  }>;
  readonly extensions: readonly [
    ReferenceFormattingProfileBootstrap["extensions"][0],
    ReferenceFormattingProfileBootstrap["extensions"][1],
    Readonly<ReferenceShowcaseTextStylesExtensionBootstrap>,
  ];
}

/**
 * Complete immutable semantic profile input for the additive showcase.
 *
 * The original Highlight and Link declarations are reused by identity. Rust
 * owns all five generated extension mutations and their observable state.
 */
export const REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP: ReferenceShowcaseProfileBootstrap =
  Object.freeze({
    format: "breditor/profile-bootstrap",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_SHOWCASE_IDS.schemaName,
      version: REFERENCE_SHOWCASE_IDS.schemaVersion,
    }),
    extensions: Object.freeze([
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[0],
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[1],
      Object.freeze({
        id: Object.freeze({
          name: REFERENCE_SHOWCASE_IDS.textStylesExtensionName,
          version: REFERENCE_SHOWCASE_IDS.textStylesExtensionVersion,
        }),
        dependencies: Object.freeze([] as const),
        conflicts: Object.freeze([] as const),
        inlineFormats: Object.freeze([
          Object.freeze({
            kind: REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
            revision: REFERENCE_SHOWCASE_IDS.emphasisFormatRevision,
          }),
          Object.freeze({
            kind: REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
            revision: REFERENCE_SHOWCASE_IDS.strikethroughFormatRevision,
          }),
          Object.freeze({
            kind: REFERENCE_SHOWCASE_IDS.codeFormatKind,
            revision: REFERENCE_SHOWCASE_IDS.codeFormatRevision,
          }),
        ] as const),
        inlineFormatPropertyContracts: Object.freeze([] as const),
        inlineFormatToggles: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
            actionId: REFERENCE_SHOWCASE_IDS.emphasisActionId,
            intentId: REFERENCE_SHOWCASE_IDS.emphasisIntentId,
            bindingId: REFERENCE_SHOWCASE_IDS.emphasisBindingId,
            actionStateId: REFERENCE_SHOWCASE_IDS.emphasisActionStateId,
          }),
          Object.freeze({
            formatKind: REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
            actionId: REFERENCE_SHOWCASE_IDS.strikethroughActionId,
            intentId: REFERENCE_SHOWCASE_IDS.strikethroughIntentId,
            bindingId: REFERENCE_SHOWCASE_IDS.strikethroughBindingId,
            actionStateId: REFERENCE_SHOWCASE_IDS.strikethroughActionStateId,
          }),
          Object.freeze({
            formatKind: REFERENCE_SHOWCASE_IDS.codeFormatKind,
            actionId: REFERENCE_SHOWCASE_IDS.codeActionId,
            intentId: REFERENCE_SHOWCASE_IDS.codeIntentId,
            bindingId: REFERENCE_SHOWCASE_IDS.codeBindingId,
            actionStateId: REFERENCE_SHOWCASE_IDS.codeActionStateId,
          }),
        ] as const),
        inlineFormatSets: Object.freeze([] as const),
      }),
    ] as const),
  });

/** Compact Profile Bootstrap V2 string accepted by the Wasm boundary. */
export const REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON = JSON.stringify(
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
);

/**
 * Durable fingerprint emitted by the Rust compiler for this exact showcase
 * content schema. Generated behavior identities do not enter this digest.
 */
export const REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT =
  "sha256:2a90a5fea97e6f4c3b9c535a78b76e9daf50afd95df3e3119392bfc19fd5ec63" as const;
