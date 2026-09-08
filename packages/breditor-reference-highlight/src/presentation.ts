import {
  BASE_INTENT_IDS,
  BASE_TOOLBAR_STATE_IDS,
  createInlineFormatRenderManifest,
  createToolbarManifest,
  type InlineFormatRenderManifest,
  type ToolbarManifest,
} from "@breditor/browser";

import { REFERENCE_HIGHLIGHT_IDS } from "./ids.js";

/**
 * Complete callback-free renderer coverage for the compiled reference profile.
 * Strong is outer to Highlight when both formats occur on the same text run.
 */
export const REFERENCE_HIGHLIGHT_RENDER_MANIFEST: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({
    recipes: [
      {
        formatKind: "breditor/strong",
        element: "strong",
        before: [REFERENCE_HIGHLIGHT_IDS.formatKind],
      },
      {
        formatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
        element: "mark",
        classes: ["breditor-reference-highlight"],
      },
    ],
  });

/**
 * Complete native-button toolbar for the reference profile.
 *
 * Every mutation names a semantic no-input intent. No control holds an action
 * callback or concrete action dispatch declaration.
 */
export const REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST: ToolbarManifest =
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
        stateId: REFERENCE_HIGHLIGHT_IDS.actionStateId,
        label: "Highlight",
        activation: "tracked",
        group: "inline",
        command: {
          kind: "intent",
          intentId: REFERENCE_HIGHLIGHT_IDS.intentId,
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
