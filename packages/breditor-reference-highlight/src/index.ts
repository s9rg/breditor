/** Exact semantic identities for the complete reference Highlight profile. */
export { REFERENCE_HIGHLIGHT_IDS } from "./ids.js";

/** ABI-local semantic bootstrap and its exact durable schema identity. */
export {
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  type ReferenceHighlightProfileBootstrap,
} from "./profile.js";

/** Complete callback-free browser presentation for the reference profile. */
export {
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
} from "./presentation.js";

/** Fingerprint-bound canonical Document V2 fixtures and helpers. */
export {
  MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8,
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT,
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
  REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT,
  REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT_JSON,
  createReferenceHighlightDocument,
  createReferenceHighlightDocumentJson,
  type ReferenceHighlightDocumentV2,
  type ReferenceHighlightFormatV2,
  type ReferenceHighlightParagraphV2,
  type ReferenceHighlightTextStyle,
  type ReferenceHighlightTextV2,
} from "./documents.js";
