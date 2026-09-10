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

/** Additive identities for the combined Highlight + typed Link profile. */
export { REFERENCE_FORMATTING_IDS } from "./formatting_ids.js";

/** Profile Bootstrap V2 and durable schema identity for Highlight + Link. */
export {
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
  type ReferenceFormattingProfileBootstrap,
} from "./formatting_profile.js";

/** Complete safe browser presentation for the combined formatting profile. */
export {
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
} from "./formatting_presentation.js";

/** Fingerprint-bound combined-profile Document V2 fixtures and helpers. */
export {
  MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
  createReferenceFormattingDocument,
  createReferenceFormattingDocumentJson,
  type ReferenceFormattingDocumentOptions,
  type ReferenceFormattingDocumentV2,
  type ReferenceFormattingFormatV2,
  type ReferenceFormattingHighlightFormatV2,
  type ReferenceFormattingLinkFormatV2,
  type ReferenceFormattingLinkPropertiesV2,
  type ReferenceFormattingParagraphV2,
  type ReferenceFormattingTextV2,
} from "./formatting_documents.js";

/** Canonical typed input for the generated Link set/remove surfaces. */
export {
  MAX_REFERENCE_LINK_HREF_UTF8,
  REFERENCE_LINK_REMOVE_INPUT_JSON,
  createReferenceLinkRemoveInput,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInput,
  createReferenceLinkSetInputJson,
  type ReferenceLinkRemoveInput,
  type ReferenceLinkSetInput,
} from "./link_input.js";

/** Additive semantic identities for the complete reference showcase. */
export { REFERENCE_SHOWCASE_IDS } from "./showcase_ids.js";

/** Profile Bootstrap V2 and durable schema identity for the showcase. */
export {
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
  type ReferenceShowcaseProfileBootstrap,
  type ReferenceShowcaseTextStylesExtensionBootstrap,
  type ReferenceShowcaseToggleBootstrap,
} from "./showcase_profile.js";

/** Complete deterministic browser presentation for the showcase. */
export {
  REFERENCE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
} from "./showcase_presentation.js";

/** Fingerprint-bound showcase Document V2 fixtures and helper. */
export {
  MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8,
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT,
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  createReferenceShowcaseDocument,
  createReferenceShowcaseDocumentJson,
  type ReferenceShowcaseCodeFormatV2,
  type ReferenceShowcaseDocumentOptions,
  type ReferenceShowcaseDocumentV2,
  type ReferenceShowcaseEmphasisFormatV2,
  type ReferenceShowcaseFormatV2,
  type ReferenceShowcaseHighlightFormatV2,
  type ReferenceShowcaseLinkFormatV2,
  type ReferenceShowcaseLinkPropertiesV2,
  type ReferenceShowcaseParagraphV2,
  type ReferenceShowcaseStrikethroughFormatV2,
  type ReferenceShowcaseStrongFormatV2,
  type ReferenceShowcaseTextV2,
} from "./showcase_documents.js";
