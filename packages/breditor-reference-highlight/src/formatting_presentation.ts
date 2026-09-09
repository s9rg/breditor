import {
  BASE_INTENT_IDS,
  BASE_TOOLBAR_STATE_IDS,
  createInlineFormatRenderManifest,
  createToolbarManifest,
  type InlineFormatRenderManifest,
  type ToolbarManifest,
} from "@breditor/browser";

import { REFERENCE_FORMATTING_IDS } from "./formatting_ids.js";

/**
 * Complete callback-free renderer for the combined Highlight + Link profile.
 *
 * Link is always outermost, Strong is outside Highlight, and Link attributes
 * are derived only by the browser-owned `safeLinkV1` policy.
 */
export const REFERENCE_FORMATTING_RENDER_MANIFEST: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({
    recipes: [
      {
        formatKind: "breditor/strong",
        element: "strong",
        before: [REFERENCE_FORMATTING_IDS.highlightFormatKind],
      },
      {
        formatKind: REFERENCE_FORMATTING_IDS.highlightFormatKind,
        element: "mark",
        classes: ["breditor-reference-highlight"],
      },
      {
        formatKind: REFERENCE_FORMATTING_IDS.linkFormatKind,
        element: "a",
        classes: ["breditor-link"],
        before: [
          "breditor/strong",
          REFERENCE_FORMATTING_IDS.highlightFormatKind,
        ],
        attributes: {
          kind: "safeLinkV1",
          hrefProperty: REFERENCE_FORMATTING_IDS.linkHrefProperty,
          openInNewWindowProperty:
            REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty,
        },
      },
    ],
  });

/**
 * Native-button toolbar for commands that need no caller-supplied values.
 *
 * Link set/remove is intentionally driven by application UI through
 * `executeIntentJson` and the helpers from `link_input`; a static toolbar
 * declaration cannot safely capture a user-entered URL.
 */
export const REFERENCE_FORMATTING_TOOLBAR_MANIFEST: ToolbarManifest =
  createToolbarManifest({
    label: "Editor controls",
    controls: [
      {
        kind: "button",
        stateId: BASE_TOOLBAR_STATE_IDS.bold,
        label: "Bold",
        activation: "tracked",
        group: "inline",
        command: {
          kind: "intent",
          intentId: BASE_INTENT_IDS.formatStrong,
        },
      },
      {
        kind: "button",
        stateId: REFERENCE_FORMATTING_IDS.highlightActionStateId,
        label: "Highlight",
        activation: "tracked",
        group: "inline",
        command: {
          kind: "intent",
          intentId: REFERENCE_FORMATTING_IDS.highlightIntentId,
        },
      },
      {
        kind: "button",
        stateId: BASE_TOOLBAR_STATE_IDS.undo,
        label: "Undo",
        activation: "stateless",
        group: "history",
        command: { kind: "history", operation: "undo" },
      },
      {
        kind: "button",
        stateId: BASE_TOOLBAR_STATE_IDS.redo,
        label: "Redo",
        activation: "stateless",
        group: "history",
        command: { kind: "history", operation: "redo" },
      },
    ],
  });
