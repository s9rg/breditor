import { REFERENCE_HIGHLIGHT_IDS } from "./ids.js";

/** Exact data-only ABI-local profile bootstrap shipped by this package. */
export interface ReferenceHighlightProfileBootstrap {
  readonly format: "breditor/profile-bootstrap";
  readonly formatVersion: 1;
  readonly schema: Readonly<{
    name: typeof REFERENCE_HIGHLIGHT_IDS.schemaName;
    version: typeof REFERENCE_HIGHLIGHT_IDS.schemaVersion;
  }>;
  readonly extensions: readonly [
    Readonly<{
      id: Readonly<{
        name: typeof REFERENCE_HIGHLIGHT_IDS.extensionName;
        version: typeof REFERENCE_HIGHLIGHT_IDS.extensionVersion;
      }>;
      dependencies: readonly [];
      conflicts: readonly [];
      inlineFormats: readonly [
        Readonly<{
          kind: typeof REFERENCE_HIGHLIGHT_IDS.formatKind;
          revision: typeof REFERENCE_HIGHLIGHT_IDS.formatRevision;
        }>,
      ];
      inlineFormatToggles: readonly [
        Readonly<{
          formatKind: typeof REFERENCE_HIGHLIGHT_IDS.formatKind;
          actionId: typeof REFERENCE_HIGHLIGHT_IDS.actionId;
          intentId: typeof REFERENCE_HIGHLIGHT_IDS.intentId;
          bindingId: typeof REFERENCE_HIGHLIGHT_IDS.bindingId;
          actionStateId: typeof REFERENCE_HIGHLIGHT_IDS.actionStateId;
        }>,
      ];
    }>,
  ];
}

/**
 * Complete immutable semantic profile input for the reference Highlight.
 *
 * This is data, not a runtime plugin: it contains no functions, accessors,
 * DOM objects, code-loading hooks, or mutable extension state.
 */
export const REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP: ReferenceHighlightProfileBootstrap =
  Object.freeze({
    format: "breditor/profile-bootstrap",
    formatVersion: 1,
    schema: Object.freeze({
      name: REFERENCE_HIGHLIGHT_IDS.schemaName,
      version: REFERENCE_HIGHLIGHT_IDS.schemaVersion,
    }),
    extensions: Object.freeze([
      Object.freeze({
        id: Object.freeze({
          name: REFERENCE_HIGHLIGHT_IDS.extensionName,
          version: REFERENCE_HIGHLIGHT_IDS.extensionVersion,
        }),
        dependencies: Object.freeze([] as const),
        conflicts: Object.freeze([] as const),
        inlineFormats: Object.freeze([
          Object.freeze({
            kind: REFERENCE_HIGHLIGHT_IDS.formatKind,
            revision: REFERENCE_HIGHLIGHT_IDS.formatRevision,
          }),
        ] as const),
        inlineFormatToggles: Object.freeze([
          Object.freeze({
            formatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
            actionId: REFERENCE_HIGHLIGHT_IDS.actionId,
            intentId: REFERENCE_HIGHLIGHT_IDS.intentId,
            bindingId: REFERENCE_HIGHLIGHT_IDS.bindingId,
            actionStateId: REFERENCE_HIGHLIGHT_IDS.actionStateId,
          }),
        ] as const),
      }),
    ] as const),
  });

/** Compact profile string accepted by `semanticProfile.bootstrapJson`. */
export const REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON = JSON.stringify(
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP,
);

/**
 * Durable schema fingerprint emitted by the Rust compiler for this exact
 * schema name, version, base structure, format kind, and format revision.
 */
export const REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT =
  "sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741" as const;
