import type {
  InlineFormatRenderManifest,
  KeyboardShortcutManifest,
  PrimaryKeyChord,
  ToolbarManifest,
} from "@breditor/browser";

import {
  MAX_REFERENCE_COLOR_SHOWCASE_DOCUMENT_TEXT_UTF8,
  MAX_REFERENCE_TEXT_COLOR_RGB24,
  MIN_REFERENCE_TEXT_COLOR_RGB24,
  REFERENCE_COLOR_SHOWCASE_DEFAULT_RGB24,
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT,
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_COLOR_SHOWCASE_IDS,
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT,
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST,
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
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
  REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON,
  createReferenceColorShowcaseDocument,
  createReferenceColorShowcaseDocumentJson,
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
  createReferenceTextColorRemoveInput,
  createReferenceTextColorRemoveInputJson,
  createReferenceTextColorSetInput,
  createReferenceTextColorSetInputJson,
  type ReferenceColorShowcaseDocumentOptions,
  type ReferenceColorShowcaseDocumentV2,
  type ReferenceColorShowcaseFormatV2,
  type ReferenceColorShowcaseParagraphV2,
  type ReferenceColorShowcaseProfileBootstrap,
  type ReferenceColorShowcaseTextColorExtensionBootstrap,
  type ReferenceColorShowcaseTextColorFormatV2,
  type ReferenceColorShowcaseTextColorPropertiesV2,
  type ReferenceColorShowcaseTextV2,
  type ReferenceFormattingDocumentV2,
  type ReferenceFormattingProfileBootstrap,
  type ReferenceLinkRemoveInput,
  type ReferenceLinkSetInput,
  type ReferenceHighlightDocumentV2,
  type ReferenceHighlightTextStyle,
  type ReferenceShowcaseDocumentOptions,
  type ReferenceShowcaseDocumentV2,
  type ReferenceShowcaseProfileBootstrap,
  type ReferenceTextColorRemoveInput,
  type ReferenceTextColorSetInput,
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
const showcaseKeyboardShortcuts: KeyboardShortcutManifest =
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST;
const showcasePhysicalKeyChord: PrimaryKeyChord = {
  code: "KeyB",
  shift: false,
};
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
void showcaseKeyboardShortcuts;
void showcasePhysicalKeyChord;
void showcaseOptions;
void showcaseDocument;
void generatedShowcaseDocumentJson;
void showcaseBootstrap;

const colorShowcaseMaximumTextBytes: 1_048_576 =
  MAX_REFERENCE_COLOR_SHOWCASE_DOCUMENT_TEXT_UTF8;
const colorShowcaseMinimumRgb24: 0 = MIN_REFERENCE_TEXT_COLOR_RGB24;
const colorShowcaseMaximumRgb24: 16_777_215 = MAX_REFERENCE_TEXT_COLOR_RGB24;
const colorShowcaseDefaultRgb24: 5_972_406 =
  REFERENCE_COLOR_SHOWCASE_DEFAULT_RGB24;
const colorShowcaseSchemaName: "example/color-showcase-editor" =
  REFERENCE_COLOR_SHOWCASE_IDS.schemaName;
const colorShowcaseFormatKind: "example/text-color" =
  REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind;
const colorShowcasePropertyName: "example/rgb24" =
  REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property;
const colorShowcaseIntentId: "example/set-text-color-intent" =
  REFERENCE_COLOR_SHOWCASE_IDS.textColorIntentId;
const colorShowcaseBootstrapJson: string =
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON;
const colorShowcaseBootstrap: ReferenceColorShowcaseProfileBootstrap =
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP;
const colorShowcaseFingerprint:
  "sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d" =
    REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT;
const colorShowcaseRenderManifest: InlineFormatRenderManifest =
  REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST;
const colorShowcaseToolbarManifest: ToolbarManifest =
  REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST;
const colorShowcaseKeyboardShortcuts: KeyboardShortcutManifest =
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST;
const colorShowcaseOptions: ReferenceColorShowcaseDocumentOptions = {
  bold: true,
  italic: true,
  strikethrough: true,
  code: true,
  highlighted: true,
  link: { href: "https://example.test", openInNewWindow: false },
  textColor: 0x12_34_56,
};
const colorShowcaseDocument: ReferenceColorShowcaseDocumentV2 =
  createReferenceColorShowcaseDocument("text", colorShowcaseOptions);
const colorShowcaseEmptyDocument: ReferenceColorShowcaseDocumentV2 =
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT;
const colorShowcaseSampleDocument: ReferenceColorShowcaseDocumentV2 =
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT;
const colorShowcaseEmptyDocumentJson: string =
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT_JSON;
const colorShowcaseSampleDocumentJson: string =
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON;
const generatedColorShowcaseDocumentJson: string =
  createReferenceColorShowcaseDocumentJson("text", colorShowcaseOptions);
const colorShowcaseParagraph: ReferenceColorShowcaseParagraphV2 =
  colorShowcaseDocument.root.children[0];
const colorShowcaseText: ReferenceColorShowcaseTextV2 | undefined =
  colorShowcaseParagraph.children[0];
const colorShowcaseTextColorProperties: ReferenceColorShowcaseTextColorPropertiesV2 =
  { "example/rgb24": 0x12_34_56 };
const colorShowcaseTextColorFormat: ReferenceColorShowcaseTextColorFormatV2 = {
  type: "example/text-color",
  properties: colorShowcaseTextColorProperties,
};
const colorShowcaseFormat: ReferenceColorShowcaseFormatV2 =
  colorShowcaseTextColorFormat;
const textColorSetInput: ReferenceTextColorSetInput =
  createReferenceTextColorSetInput(0x12_34_56);
const textColorSetInputJson: string =
  createReferenceTextColorSetInputJson(0x12_34_56);
const textColorRemoveInput: ReferenceTextColorRemoveInput =
  createReferenceTextColorRemoveInput();
const textColorRemoveInputJson: string =
  createReferenceTextColorRemoveInputJson();
const sharedTextColorRemoveInputJson: string =
  REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON;
const colorShowcaseTextColorExtension: ReferenceColorShowcaseTextColorExtensionBootstrap =
  colorShowcaseBootstrap.extensions[3];

void colorShowcaseMaximumTextBytes;
void colorShowcaseMinimumRgb24;
void colorShowcaseMaximumRgb24;
void colorShowcaseDefaultRgb24;
void colorShowcaseSchemaName;
void colorShowcaseFormatKind;
void colorShowcasePropertyName;
void colorShowcaseIntentId;
void colorShowcaseBootstrapJson;
void colorShowcaseFingerprint;
void colorShowcaseRenderManifest;
void colorShowcaseToolbarManifest;
void colorShowcaseKeyboardShortcuts;
void colorShowcaseOptions;
void colorShowcaseDocument;
void colorShowcaseEmptyDocument;
void colorShowcaseSampleDocument;
void colorShowcaseEmptyDocumentJson;
void colorShowcaseSampleDocumentJson;
void generatedColorShowcaseDocumentJson;
void colorShowcaseParagraph;
void colorShowcaseText;
void colorShowcaseTextColorProperties;
void colorShowcaseTextColorFormat;
void colorShowcaseFormat;
void textColorSetInput;
void textColorSetInputJson;
void textColorRemoveInput;
void textColorRemoveInputJson;
void sharedTextColorRemoveInputJson;
void colorShowcaseBootstrap;
void colorShowcaseTextColorExtension;

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

// @ts-expect-error Color Showcase RGB24 values are numeric semantic data
createReferenceColorShowcaseDocument("text", { textColor: "#123456" });

// @ts-expect-error Color Showcase options remain closed to the declared formats
createReferenceColorShowcaseDocument("text", { backgroundColor: 0x12_34_56 });

// @ts-expect-error typed text-color set input accepts an RGB24 number, not CSS
createReferenceTextColorSetInput("#123456");

const wrongColorProperties: ReferenceColorShowcaseTextColorPropertiesV2 = {
  // @ts-expect-error the stored text-color property has one exact semantic name
  rgb24: 0x12_34_56,
};
void wrongColorProperties;

// @ts-expect-error shortcut declarations use physical KeyboardEvent.code values
const showcaseLogicalKeyChord: PrimaryKeyChord = { key: "b", shift: false };
void showcaseLogicalKeyChord;
