import {
  BASE_INTENT_IDS,
  BASE_TOOLBAR_STATE_IDS,
  createInlineFormatRenderManifest,
  createToolbarManifest,
  type InlineFormatRenderManifest,
  type ToolbarManifest,
} from "@breditor/browser";

import { REFERENCE_FORMATTING_TOOLBAR_MANIFEST } from "./formatting_presentation.js";
import { REFERENCE_SHOWCASE_IDS } from "./showcase_ids.js";

/**
 * Complete callback-free renderer for the reference showcase.
 *
 * The order graph has one unique outer-to-inner result:
 * Link, Strong, Emphasis, Highlight, Strikethrough, then Code.
 */
export const REFERENCE_SHOWCASE_RENDER_MANIFEST: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({
    recipes: [
      {
        formatKind: REFERENCE_SHOWCASE_IDS.linkFormatKind,
        element: "a",
        classes: ["breditor-link"],
        before: ["breditor/strong"],
        attributes: {
          kind: "safeLinkV1",
          hrefProperty: REFERENCE_SHOWCASE_IDS.linkHrefProperty,
          openInNewWindowProperty:
            REFERENCE_SHOWCASE_IDS.linkOpenInNewWindowProperty,
        },
      },
      {
        formatKind: "breditor/strong",
        element: "strong",
        before: [REFERENCE_SHOWCASE_IDS.emphasisFormatKind],
      },
      {
        formatKind: REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
        element: "em",
        before: [REFERENCE_SHOWCASE_IDS.highlightFormatKind],
      },
      {
        formatKind: REFERENCE_SHOWCASE_IDS.highlightFormatKind,
        element: "mark",
        classes: ["breditor-reference-highlight"],
        before: [REFERENCE_SHOWCASE_IDS.strikethroughFormatKind],
      },
      {
        formatKind: REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
        element: "s",
        before: [REFERENCE_SHOWCASE_IDS.codeFormatKind],
      },
      {
        formatKind: REFERENCE_SHOWCASE_IDS.codeFormatKind,
        element: "code",
      },
    ],
  });

/**
 * Complete runtime-owned toolbar for the reference showcase.
 *
 * Each style button routes by a descriptor-correlated semantic intent. Link
 * retains the exact closed typed-property form used by the formatting profile.
 */
export const REFERENCE_SHOWCASE_TOOLBAR_MANIFEST: ToolbarManifest =
  createToolbarManifest({
    label: "Editor controls",
    controls: [
      REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[0],
      {
        kind: "button",
        stateId: REFERENCE_SHOWCASE_IDS.emphasisActionStateId,
        label: "Italic",
        activation: "tracked",
        group: "inline",
        command: {
          kind: "intent",
          intentId: REFERENCE_SHOWCASE_IDS.emphasisIntentId,
        },
      },
      {
        kind: "button",
        stateId: REFERENCE_SHOWCASE_IDS.strikethroughActionStateId,
        label: "Strikethrough",
        activation: "tracked",
        group: "inline",
        command: {
          kind: "intent",
          intentId: REFERENCE_SHOWCASE_IDS.strikethroughIntentId,
        },
      },
      {
        kind: "button",
        stateId: REFERENCE_SHOWCASE_IDS.codeActionStateId,
        label: "Code",
        activation: "tracked",
        group: "inline",
        command: {
          kind: "intent",
          intentId: REFERENCE_SHOWCASE_IDS.codeIntentId,
        },
      },
      REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[1],
      REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[2],
      {
        kind: "button",
        stateId: BASE_TOOLBAR_STATE_IDS.clearInlineFormatting,
        label: "Clear formatting",
        activation: "stateless",
        group: "inline",
        command: {
          kind: "intent",
          intentId: BASE_INTENT_IDS.clearInlineFormatting,
        },
      },
      REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[3],
      REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[4],
    ],
  });
