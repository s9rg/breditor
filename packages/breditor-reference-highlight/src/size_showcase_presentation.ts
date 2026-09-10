import {
  createInlineFormatRenderManifest,
  createToolbarManifest,
  type InlineFormatRenderManifest,
  type KeyboardShortcutManifest,
  type ToolbarManifest,
} from "@breditor/browser";

import { REFERENCE_COLOR_SHOWCASE_IDS } from "./color_showcase_ids.js";
import {
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST,
} from "./color_showcase_presentation.js";
import {
  MAX_REFERENCE_TEXT_SIZE_STEP,
  MIN_REFERENCE_TEXT_SIZE_STEP,
  REFERENCE_SIZE_SHOWCASE_IDS,
} from "./size_showcase_ids.js";

/** Default semantic size offered when the selection has no uniform size. */
export const REFERENCE_SIZE_SHOWCASE_DEFAULT_TEXT_SIZE_STEP = 1 as const;

/**
 * Complete callback-free renderer for the Text Size Showcase.
 *
 * Text size wraps text color so both property-aware formats compose without
 * exposing arbitrary class or CSS input. The browser-owned integer-token
 * policy derives one of the closed `small`, `large`, or `huge` tokens.
 */
export const REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({
    recipes: [
      {
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.linkFormatKind,
        element: "a",
        classes: ["breditor-link"],
        before: ["breditor/strong"],
        attributes: {
          kind: "safeLinkV1",
          hrefProperty: REFERENCE_SIZE_SHOWCASE_IDS.linkHrefProperty,
          openInNewWindowProperty:
            REFERENCE_SIZE_SHOWCASE_IDS.linkOpenInNewWindowProperty,
        },
      },
      {
        formatKind: "breditor/strong",
        element: "strong",
        before: [REFERENCE_SIZE_SHOWCASE_IDS.emphasisFormatKind],
      },
      {
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.emphasisFormatKind,
        element: "em",
        before: [REFERENCE_SIZE_SHOWCASE_IDS.highlightFormatKind],
      },
      {
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.highlightFormatKind,
        element: "mark",
        classes: ["breditor-reference-highlight"],
        before: [REFERENCE_SIZE_SHOWCASE_IDS.strikethroughFormatKind],
      },
      {
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.strikethroughFormatKind,
        element: "s",
        before: [REFERENCE_SIZE_SHOWCASE_IDS.codeFormatKind],
      },
      {
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.codeFormatKind,
        element: "code",
        before: [REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind],
      },
      {
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
        element: "span",
        classes: ["breditor-text-size"],
        before: [REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind],
        attributes: {
          kind: "safeIntegerTokenV1",
          propertyName: REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty,
          tokens: [
            { value: 0, token: "small" },
            { value: 1, token: "large" },
            { value: 2, token: "huge" },
          ],
        },
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
 * Eleven-control toolbar adding Text Size immediately before Text Color.
 *
 * The bounded select is exhaustive for the Rust integer property contract;
 * every semantic value therefore has exactly one browser presentation.
 */
export const REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST: ToolbarManifest =
  createToolbarManifest({
    label: "Editor controls",
    controls: [
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[0],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[1],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[2],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[3],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[4],
      {
        kind: "inlineFormatForm",
        stateId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeStateId,
        label: "Text size",
        group: "inline",
        formatKind: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
        intentId: REFERENCE_SIZE_SHOWCASE_IDS.textSizeIntentId,
        fields: [
          {
            kind: "integer",
            propertyName: REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty,
            label: "Text size",
            presentation: "select",
            minimum: MIN_REFERENCE_TEXT_SIZE_STEP,
            maximum: MAX_REFERENCE_TEXT_SIZE_STEP,
            defaultValue: REFERENCE_SIZE_SHOWCASE_DEFAULT_TEXT_SIZE_STEP,
            options: [
              { value: 0, label: "Small" },
              { value: 1, label: "Large" },
              { value: 2, label: "Huge" },
            ],
          },
        ],
        applyLabel: "Apply size",
        removeLabel: "Reset size",
        closeLabel: "Close",
      },
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[5],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[6],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[7],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[8],
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[9],
    ],
  });

/** Text Size deliberately adds no shortcut to the existing Showcase routes. */
export const REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST: KeyboardShortcutManifest =
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST;
