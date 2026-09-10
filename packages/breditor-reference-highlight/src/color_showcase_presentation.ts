import {
  createInlineFormatRenderManifest,
  createToolbarManifest,
  type InlineFormatRenderManifest,
  type KeyboardShortcutManifest,
  type ToolbarManifest,
} from "@breditor/browser";

import {
  MAX_REFERENCE_TEXT_COLOR_RGB24,
  MIN_REFERENCE_TEXT_COLOR_RGB24,
  REFERENCE_COLOR_SHOWCASE_IDS,
} from "./color_showcase_ids.js";
import {
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
} from "./showcase_presentation.js";

/** Default opaque violet offered when a selection has no uniform text color. */
export const REFERENCE_COLOR_SHOWCASE_DEFAULT_RGB24 = 0x5b_21_b6 as const;

/**
 * Complete callback-free renderer for the RGB24 Color Showcase.
 *
 * Text color is the innermost wrapper so element-level author colors on Code
 * or other ancestors cannot override the selected inline value. Its sole
 * style string is synthesized by the closed browser `safeTextColorV1` policy.
 */
export const REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({
    recipes: [
      {
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.linkFormatKind,
        element: "a",
        classes: ["breditor-link"],
        before: ["breditor/strong"],
        attributes: {
          kind: "safeLinkV1",
          hrefProperty: REFERENCE_COLOR_SHOWCASE_IDS.linkHrefProperty,
          openInNewWindowProperty:
            REFERENCE_COLOR_SHOWCASE_IDS.linkOpenInNewWindowProperty,
        },
      },
      {
        formatKind: "breditor/strong",
        element: "strong",
        before: [REFERENCE_COLOR_SHOWCASE_IDS.emphasisFormatKind],
      },
      {
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.emphasisFormatKind,
        element: "em",
        before: [REFERENCE_COLOR_SHOWCASE_IDS.highlightFormatKind],
      },
      {
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.highlightFormatKind,
        element: "mark",
        classes: ["breditor-reference-highlight"],
        before: [REFERENCE_COLOR_SHOWCASE_IDS.strikethroughFormatKind],
      },
      {
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.strikethroughFormatKind,
        element: "s",
        before: [REFERENCE_COLOR_SHOWCASE_IDS.codeFormatKind],
      },
      {
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.codeFormatKind,
        element: "code",
        before: [REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind],
      },
      {
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
        element: "span",
        classes: ["breditor-text-color"],
        attributes: { kind: "safeTextColorV1" },
      },
    ],
  });

/**
 * Ten-control toolbar adding one native RGB24 picker to the Showcase.
 *
 * The field declaration is inert presentation data. Applying or removing a
 * value dispatches the generated typed Rust intent used by every other client.
 */
export const REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST: ToolbarManifest =
  createToolbarManifest({
    label: "Editor controls",
    controls: [
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[0],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[1],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[2],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[3],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[4],
      {
        kind: "inlineFormatForm",
        stateId: REFERENCE_COLOR_SHOWCASE_IDS.textColorStateId,
        label: "Text color",
        group: "inline",
        formatKind: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
        intentId: REFERENCE_COLOR_SHOWCASE_IDS.textColorIntentId,
        fields: [
          {
            kind: "integer",
            propertyName: REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property,
            label: "Text color",
            presentation: "rgb24",
            minimum: MIN_REFERENCE_TEXT_COLOR_RGB24,
            maximum: MAX_REFERENCE_TEXT_COLOR_RGB24,
            defaultValue: REFERENCE_COLOR_SHOWCASE_DEFAULT_RGB24,
          },
        ],
        applyLabel: "Apply color",
        removeLabel: "Remove color",
        closeLabel: "Close",
      },
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[5],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[6],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[7],
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[8],
    ],
  });

/**
 * Color uses a typed value and intentionally has no keyboard shortcut.
 * Existing no-input Showcase routes are reused without widening their map.
 */
export const REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST: KeyboardShortcutManifest =
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST;
