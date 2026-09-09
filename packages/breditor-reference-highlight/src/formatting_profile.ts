import { REFERENCE_FORMATTING_IDS } from "./formatting_ids.js";

/** Exact data-only Profile Bootstrap V2 shipped by the combined package API. */
export interface ReferenceFormattingProfileBootstrap {
  readonly format: "breditor/profile-bootstrap";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_FORMATTING_IDS.schemaName;
    version: typeof REFERENCE_FORMATTING_IDS.schemaVersion;
  }>;
  readonly extensions: readonly [
    Readonly<{
      id: Readonly<{
        name: typeof REFERENCE_FORMATTING_IDS.highlightExtensionName;
        version: typeof REFERENCE_FORMATTING_IDS.highlightExtensionVersion;
      }>;
      dependencies: readonly [];
      conflicts: readonly [];
      inlineFormats: readonly [
        Readonly<{
          kind: typeof REFERENCE_FORMATTING_IDS.highlightFormatKind;
          revision: typeof REFERENCE_FORMATTING_IDS.highlightFormatRevision;
        }>,
      ];
      inlineFormatPropertyContracts: readonly [];
      inlineFormatToggles: readonly [
        Readonly<{
          formatKind: typeof REFERENCE_FORMATTING_IDS.highlightFormatKind;
          actionId: typeof REFERENCE_FORMATTING_IDS.highlightActionId;
          intentId: typeof REFERENCE_FORMATTING_IDS.highlightIntentId;
          bindingId: typeof REFERENCE_FORMATTING_IDS.highlightBindingId;
          actionStateId: typeof REFERENCE_FORMATTING_IDS.highlightActionStateId;
        }>,
      ];
      inlineFormatSets: readonly [];
    }>,
    Readonly<{
      id: Readonly<{
        name: typeof REFERENCE_FORMATTING_IDS.linkExtensionName;
        version: typeof REFERENCE_FORMATTING_IDS.linkExtensionVersion;
      }>;
      dependencies: readonly [];
      conflicts: readonly [];
      inlineFormats: readonly [
        Readonly<{
          kind: typeof REFERENCE_FORMATTING_IDS.linkFormatKind;
          revision: typeof REFERENCE_FORMATTING_IDS.linkFormatRevision;
        }>,
      ];
      inlineFormatPropertyContracts: readonly [
        Readonly<{
          formatKind: typeof REFERENCE_FORMATTING_IDS.linkFormatKind;
          properties: readonly [
            Readonly<{
              name: typeof REFERENCE_FORMATTING_IDS.linkHrefProperty;
              presence: "required";
              valueType: Readonly<{
                kind: "string";
                minimumUtf8Bytes: 1;
                maximumUtf8Bytes: 2_048;
              }>;
            }>,
            Readonly<{
              name: typeof REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty;
              presence: "required";
              valueType: Readonly<{ kind: "boolean" }>;
            }>,
          ];
        }>,
      ];
      inlineFormatToggles: readonly [];
      inlineFormatSets: readonly [
        Readonly<{
          formatKind: typeof REFERENCE_FORMATTING_IDS.linkFormatKind;
          actionId: typeof REFERENCE_FORMATTING_IDS.linkActionId;
          intentId: typeof REFERENCE_FORMATTING_IDS.linkIntentId;
          bindingId: typeof REFERENCE_FORMATTING_IDS.linkBindingId;
          actionStateId: typeof REFERENCE_FORMATTING_IDS.linkPresenceStateId;
        }>,
      ];
    }>,
  ];
}

/**
 * Complete immutable semantic profile input for Highlight plus safe Link.
 *
 * This is inert configuration. Rust compiles and owns all mutation, history,
 * validation, and replay behavior described by these identities.
 */
export const REFERENCE_FORMATTING_PROFILE_BOOTSTRAP: ReferenceFormattingProfileBootstrap =
  Object.freeze({
    format: "breditor/profile-bootstrap",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_FORMATTING_IDS.schemaName,
      version: REFERENCE_FORMATTING_IDS.schemaVersion,
    }),
    extensions: Object.freeze([
      Object.freeze({
        id: Object.freeze({
          name: REFERENCE_FORMATTING_IDS.highlightExtensionName,
          version: REFERENCE_FORMATTING_IDS.highlightExtensionVersion,
        }),
        dependencies: Object.freeze([] as const),
        conflicts: Object.freeze([] as const),
        inlineFormats: Object.freeze([
          Object.freeze({
            kind: REFERENCE_FORMATTING_IDS.highlightFormatKind,
            revision: REFERENCE_FORMATTING_IDS.highlightFormatRevision,
          }),
        ] as const),
        inlineFormatPropertyContracts: Object.freeze([] as const),
        inlineFormatToggles: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_FORMATTING_IDS.highlightFormatKind,
            actionId: REFERENCE_FORMATTING_IDS.highlightActionId,
            intentId: REFERENCE_FORMATTING_IDS.highlightIntentId,
            bindingId: REFERENCE_FORMATTING_IDS.highlightBindingId,
            actionStateId: REFERENCE_FORMATTING_IDS.highlightActionStateId,
          }),
        ] as const),
        inlineFormatSets: Object.freeze([] as const),
      }),
      Object.freeze({
        id: Object.freeze({
          name: REFERENCE_FORMATTING_IDS.linkExtensionName,
          version: REFERENCE_FORMATTING_IDS.linkExtensionVersion,
        }),
        dependencies: Object.freeze([] as const),
        conflicts: Object.freeze([] as const),
        inlineFormats: Object.freeze([
          Object.freeze({
            kind: REFERENCE_FORMATTING_IDS.linkFormatKind,
            revision: REFERENCE_FORMATTING_IDS.linkFormatRevision,
          }),
        ] as const),
        inlineFormatPropertyContracts: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_FORMATTING_IDS.linkFormatKind,
            properties: Object.freeze([
              Object.freeze({
                name: REFERENCE_FORMATTING_IDS.linkHrefProperty,
                presence: "required" as const,
                valueType: Object.freeze({
                  kind: "string" as const,
                  minimumUtf8Bytes: 1 as const,
                  maximumUtf8Bytes: 2_048 as const,
                }),
              }),
              Object.freeze({
                name: REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty,
                presence: "required" as const,
                valueType: Object.freeze({ kind: "boolean" as const }),
              }),
            ] as const),
          }),
        ] as const),
        inlineFormatToggles: Object.freeze([] as const),
        inlineFormatSets: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_FORMATTING_IDS.linkFormatKind,
            actionId: REFERENCE_FORMATTING_IDS.linkActionId,
            intentId: REFERENCE_FORMATTING_IDS.linkIntentId,
            bindingId: REFERENCE_FORMATTING_IDS.linkBindingId,
            actionStateId: REFERENCE_FORMATTING_IDS.linkPresenceStateId,
          }),
        ] as const),
      }),
    ] as const),
  });

/** Compact Profile Bootstrap V2 string accepted by the Wasm boundary. */
export const REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON = JSON.stringify(
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
);

/**
 * Durable fingerprint produced by compiler contract V2 for this exact schema,
 * its two extension formats, and Link's closed property contract.
 */
export const REFERENCE_FORMATTING_SCHEMA_FINGERPRINT =
  "sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc" as const;
