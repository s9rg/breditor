import type {
  InlineFormatRenderManifest,
  ToolbarManifest,
} from "@breditor/browser";

import {
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  createReferenceHighlightDocument,
  createReferenceHighlightDocumentJson,
  type ReferenceHighlightDocumentV2,
  type ReferenceHighlightTextStyle,
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

// @ts-expect-error the helper deliberately supports only whole-run plain/highlighted fixtures
createReferenceHighlightDocument("text", "strong");
