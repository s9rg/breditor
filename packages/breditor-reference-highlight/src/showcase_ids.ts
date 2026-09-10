import { REFERENCE_FORMATTING_IDS } from "./formatting_ids.js";

/**
 * Exact semantic identities owned by the additive reference showcase profile.
 *
 * Highlight and Link deliberately retain their established extension,
 * format, action, intent, binding, state, and property identities. The new
 * text-style extension owns three independent property-free format toggles.
 */
export const REFERENCE_SHOWCASE_IDS = Object.freeze({
  schemaName: "example/showcase-editor",
  schemaVersion: 1,

  highlightExtensionName: REFERENCE_FORMATTING_IDS.highlightExtensionName,
  highlightExtensionVersion: REFERENCE_FORMATTING_IDS.highlightExtensionVersion,
  highlightFormatKind: REFERENCE_FORMATTING_IDS.highlightFormatKind,
  highlightFormatRevision: REFERENCE_FORMATTING_IDS.highlightFormatRevision,
  highlightActionId: REFERENCE_FORMATTING_IDS.highlightActionId,
  highlightIntentId: REFERENCE_FORMATTING_IDS.highlightIntentId,
  highlightBindingId: REFERENCE_FORMATTING_IDS.highlightBindingId,
  highlightActionStateId: REFERENCE_FORMATTING_IDS.highlightActionStateId,

  linkExtensionName: REFERENCE_FORMATTING_IDS.linkExtensionName,
  linkExtensionVersion: REFERENCE_FORMATTING_IDS.linkExtensionVersion,
  linkFormatKind: REFERENCE_FORMATTING_IDS.linkFormatKind,
  linkFormatRevision: REFERENCE_FORMATTING_IDS.linkFormatRevision,
  linkHrefProperty: REFERENCE_FORMATTING_IDS.linkHrefProperty,
  linkOpenInNewWindowProperty:
    REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty,
  linkActionId: REFERENCE_FORMATTING_IDS.linkActionId,
  linkIntentId: REFERENCE_FORMATTING_IDS.linkIntentId,
  linkBindingId: REFERENCE_FORMATTING_IDS.linkBindingId,
  linkPresenceStateId: REFERENCE_FORMATTING_IDS.linkPresenceStateId,

  textStylesExtensionName: "example/text-styles-extension",
  textStylesExtensionVersion: 1,

  emphasisFormatKind: "example/emphasis",
  emphasisFormatRevision: 1,
  emphasisActionId: "example/toggle-emphasis",
  emphasisIntentId: "example/toggle-emphasis-intent",
  emphasisBindingId: "example/toggle-emphasis-binding",
  emphasisActionStateId: "example/emphasis-control",

  strikethroughFormatKind: "example/strikethrough",
  strikethroughFormatRevision: 1,
  strikethroughActionId: "example/toggle-strikethrough",
  strikethroughIntentId: "example/toggle-strikethrough-intent",
  strikethroughBindingId: "example/toggle-strikethrough-binding",
  strikethroughActionStateId: "example/strikethrough-control",

  codeFormatKind: "example/code",
  codeFormatRevision: 1,
  codeActionId: "example/toggle-code",
  codeIntentId: "example/toggle-code-intent",
  codeBindingId: "example/toggle-code-binding",
  codeActionStateId: "example/code-control",
} as const);
