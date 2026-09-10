import {
  MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES,
  createInlineFormatRenderManifest,
  createKeyboardShortcutManifest,
  type InlineFormatRenderAttribute,
  type InlineFormatRenderAttributePolicy,
  type InlineFormatRenderManifest,
  type InlineFormatRenderRecipe,
  type InlineFormatRenderSafeLinkV1Policy,
  type KeyboardShortcutManifest,
  type PrimaryKeyChord,
} from "@breditor/browser";

const safeLink: InlineFormatRenderSafeLinkV1Policy = {
  kind: "safeLinkV1",
  hrefProperty: "example/href",
  openInNewWindowProperty: "example/open-in-new-window",
};
const attributePolicy: InlineFormatRenderAttributePolicy = safeLink;
const recipe: InlineFormatRenderRecipe = {
  formatKind: "example/link",
  element: "a",
  classes: ["breditor-link"],
  before: [],
  after: [],
  attributes: attributePolicy,
};
const manifest: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({ recipes: [recipe] });
const href: InlineFormatRenderAttribute = {
  name: "href",
  value: "https://example.test/",
};
const hrefLimit: 2_048 = MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES;

void manifest;
void href;
void hrefLimit;

const keyboardShortcuts: KeyboardShortcutManifest =
  createKeyboardShortcutManifest({
    shortcuts: [
      {
        stateId: "example/emphasis-control",
        chords: [{ code: "KeyI", shift: false }],
      },
    ],
  });
void keyboardShortcuts;

const physicalChord: PrimaryKeyChord = { code: "KeyI", shift: false };
void physicalChord;

// @ts-expect-error shortcut declarations use physical code, not logical key
const logicalChord: PrimaryKeyChord = { key: "i", shift: false };
void logicalChord;

// @ts-expect-error safeLinkV1 accepts only the closed href/new-window property pair
const unsupportedPolicy: InlineFormatRenderAttributePolicy = { kind: "attributesV2" };
void unsupportedPolicy;

// @ts-expect-error arbitrary DOM attributes are outside the public policy contract
const eventAttribute: InlineFormatRenderAttribute = { name: "onclick", value: "alert(1)" };
void eventAttribute;
