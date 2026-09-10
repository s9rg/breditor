import type {
  InlineFormatRenderManifest,
  ToolbarManifest,
} from "@breditor/browser";

import {
  REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON,
  REFERENCE_FORMATTING_IDS,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_IDS,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
  createReferenceFormattingDocument,
  createReferenceFormattingDocumentJson,
  createReferenceLinkRemoveInput,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInput,
  createReferenceLinkSetInputJson,
  createReferenceHighlightDocument,
  createReferenceHighlightDocumentJson,
  createReferenceShowcaseDocument,
  createReferenceShowcaseDocumentJson,
  type ReferenceFormattingDocumentV2,
  type ReferenceFormattingProfileBootstrap,
  type ReferenceLinkRemoveInput,
  type ReferenceLinkSetInput,
  type ReferenceHighlightDocumentV2,
  type ReferenceHighlightTextStyle,
  type ReferenceShowcaseDocumentOptions,
  type ReferenceShowcaseDocumentV2,
  type ReferenceShowcaseProfileBootstrap,
} from "../src/index.js";

const formatKind: "example/highlight" = REFERENCE_HIGHLIGHT_IDS.formatKind;
const renderManifest: InlineFormatRenderManifest = REFERENCE_HIGHLIGHT_RENDER_MANIFEST;
const toolbarManifest: ToolbarManifest = REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST;
const style: ReferenceHighlightTextStyle = "highlighted";
const document: ReferenceHighlightDocumentV2 = createReferenceHighlightDocument(
  "text",
  style,
);
const documentJson: string = createReferenceHighlightDocumentJson("text", style);

void formatKind;
void renderManifest;
void toolbarManifest;
void document;
void documentJson;

const linkFormatKind: "example/link" =
  REFERENCE_FORMATTING_IDS.linkFormatKind;
const linkIntentId: "example/set-link-intent" =
  REFERENCE_FORMATTING_IDS.linkIntentId;
const formattingBootstrapJson: string =
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON;
const formattingDocumentJson: string =
  REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON;
const formattingRenderManifest: InlineFormatRenderManifest =
  REFERENCE_FORMATTING_RENDER_MANIFEST;
const formattingToolbarManifest: ToolbarManifest =
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST;
const formattingDocument: ReferenceFormattingDocumentV2 =
  createReferenceFormattingDocument("text", {
    highlighted: true,
    link: {
      href: "https://example.test",
      openInNewWindow: false,
    },
  });
const generatedFormattingDocumentJson: string =
  createReferenceFormattingDocumentJson("text", { highlighted: true });
const linkSetInput: ReferenceLinkSetInput = createReferenceLinkSetInput(
  "https://example.test",
  true,
);
const linkSetInputJson: string = createReferenceLinkSetInputJson(
  "https://example.test",
);
const linkRemoveInput: ReferenceLinkRemoveInput =
  createReferenceLinkRemoveInput();
const linkRemoveInputJson: string = createReferenceLinkRemoveInputJson();
declare const bootstrap: ReferenceFormattingProfileBootstrap;

void linkFormatKind;
void linkIntentId;
void formattingBootstrapJson;
void formattingDocumentJson;
void formattingRenderManifest;
void formattingToolbarManifest;
void formattingDocument;
void generatedFormattingDocumentJson;
void linkSetInput;
void linkSetInputJson;
void linkRemoveInput;
void linkRemoveInputJson;
void bootstrap;

const showcaseFormatKind: "example/emphasis" =
  REFERENCE_SHOWCASE_IDS.emphasisFormatKind;
const showcaseBootstrapJson: string =
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON;
const showcaseDocumentJson: string = REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON;
const showcaseRenderManifest: InlineFormatRenderManifest =
  REFERENCE_SHOWCASE_RENDER_MANIFEST;
const showcaseToolbarManifest: ToolbarManifest =
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST;
const showcaseOptions: ReferenceShowcaseDocumentOptions = {
  bold: true,
  italic: true,
  strikethrough: true,
  code: true,
  highlighted: true,
  link: { href: "https://example.test", openInNewWindow: false },
};
const showcaseDocument: ReferenceShowcaseDocumentV2 =
  createReferenceShowcaseDocument("text", showcaseOptions);
const generatedShowcaseDocumentJson: string =
  createReferenceShowcaseDocumentJson("text", showcaseOptions);
declare const showcaseBootstrap: ReferenceShowcaseProfileBootstrap;

void showcaseFormatKind;
void showcaseBootstrapJson;
void showcaseDocumentJson;
void showcaseRenderManifest;
void showcaseToolbarManifest;
void showcaseOptions;
void showcaseDocument;
void generatedShowcaseDocumentJson;
void showcaseBootstrap;

// @ts-expect-error the helper deliberately supports only whole-run plain/highlighted fixtures
createReferenceHighlightDocument("text", "strong");

// @ts-expect-error the Link target flag is a Boolean semantic property
createReferenceLinkSetInputJson("https://example.test", "yes");

// @ts-expect-error combined documents accept only the closed formatting options
createReferenceFormattingDocument("text", { linked: true });

// @ts-expect-error showcase style flags are Boolean
createReferenceShowcaseDocument("text", { italic: "yes" });

// @ts-expect-error showcase options are a closed public type
createReferenceShowcaseDocument("text", { underline: true });
