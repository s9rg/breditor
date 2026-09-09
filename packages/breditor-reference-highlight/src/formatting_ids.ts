import { REFERENCE_HIGHLIGHT_IDS } from "./ids.js";

/**
 * Exact semantic identities owned by the additive Highlight + Link profile.
 *
 * The Highlight identities deliberately equal the original reference profile
 * identities. This combined family is separate so the existing
 * `REFERENCE_HIGHLIGHT_*` API and its durable fingerprint never change.
 */
export const REFERENCE_FORMATTING_IDS = Object.freeze({
  schemaName: REFERENCE_HIGHLIGHT_IDS.schemaName,
  schemaVersion: REFERENCE_HIGHLIGHT_IDS.schemaVersion,

  highlightExtensionName: REFERENCE_HIGHLIGHT_IDS.extensionName,
  highlightExtensionVersion: REFERENCE_HIGHLIGHT_IDS.extensionVersion,
  highlightFormatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
  highlightFormatRevision: REFERENCE_HIGHLIGHT_IDS.formatRevision,
  highlightActionId: REFERENCE_HIGHLIGHT_IDS.actionId,
  highlightIntentId: REFERENCE_HIGHLIGHT_IDS.intentId,
  highlightBindingId: REFERENCE_HIGHLIGHT_IDS.bindingId,
  highlightActionStateId: REFERENCE_HIGHLIGHT_IDS.actionStateId,

  linkExtensionName: "example/link-extension",
  linkExtensionVersion: 1,
  linkFormatKind: "example/link",
  linkFormatRevision: 1,
  linkHrefProperty: "example/href",
  linkOpenInNewWindowProperty: "example/open-in-new-window",
  linkActionId: "example/set-link",
  linkIntentId: "example/set-link-intent",
  linkBindingId: "example/set-link-binding",
  linkPresenceStateId: "example/link-presence",
} as const);
