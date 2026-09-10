import {
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_KIND,
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM,
  MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES,
  createInlineFormatRenderManifest,
  createKeyboardShortcutManifest,
  type InlineFormatRenderAttribute,
  type InlineFormatRenderAttributePolicy,
  type InlineFormatRenderManifest,
  type InlineFormatRenderRecipe,
  type InlineFormatRenderSafeLinkV1Policy,
  type InlineFormatRenderSafeTextColorV1Policy,
  type KeyboardShortcutManifest,
  type PrimaryKeyChord,
  TOOLBAR_INLINE_FORMAT_FORM_RGB24_MAXIMUM,
  TOOLBAR_INLINE_FORMAT_FORM_RGB24_MINIMUM,
  type ToolbarInlineFormatFormIntegerFieldDeclaration,
} from "@breditor/browser";

const safeLink: InlineFormatRenderSafeLinkV1Policy = {
  kind: "safeLinkV1",
  hrefProperty: "example/href",
  openInNewWindowProperty: "example/open-in-new-window",
};
const attributePolicy: InlineFormatRenderAttributePolicy = safeLink;
const safeTextColor: InlineFormatRenderSafeTextColorV1Policy = {
  kind: "safeTextColorV1",
};
const textColorPolicy: InlineFormatRenderAttributePolicy = safeTextColor;
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
const textColorKind: "example/text-color" =
  INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_KIND;
const rgb24Maximum: 0xff_ffff = INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM;
const style: InlineFormatRenderAttribute = {
  name: "style",
  value: "color:#00a1ff",
};

void manifest;
void href;
void hrefLimit;
void textColorPolicy;
void textColorKind;
void rgb24Maximum;
void style;

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

const rgb24Field: ToolbarInlineFormatFormIntegerFieldDeclaration = {
  kind: "integer",
  propertyName: "example/rgb24",
  label: "Text color",
  presentation: "rgb24",
  minimum: TOOLBAR_INLINE_FORMAT_FORM_RGB24_MINIMUM,
  maximum: TOOLBAR_INLINE_FORMAT_FORM_RGB24_MAXIMUM,
  defaultValue: 0x12abef,
};
void rgb24Field;

const genericNumberField: ToolbarInlineFormatFormIntegerFieldDeclaration = {
  ...rgb24Field,
  // @ts-expect-error integer fields do not infer an arbitrary numeric presentation
  presentation: "number",
};
void genericNumberField;

const narrowedRgb24Field: ToolbarInlineFormatFormIntegerFieldDeclaration = {
  ...rgb24Field,
  // @ts-expect-error RGB24 declarations require their exact lower bound
  minimum: 1,
};
void narrowedRgb24Field;

// @ts-expect-error safeLinkV1 accepts only the closed href/new-window property pair
const unsupportedPolicy: InlineFormatRenderAttributePolicy = { kind: "attributesV2" };
void unsupportedPolicy;

const widenedTextColor: InlineFormatRenderSafeTextColorV1Policy = {
  kind: "safeTextColorV1",
  // @ts-expect-error safeTextColorV1 has no configurable property-name field
  property: "example/rgb24",
};
void widenedTextColor;

// @ts-expect-error arbitrary DOM attributes are outside the public policy contract
const eventAttribute: InlineFormatRenderAttribute = { name: "onclick", value: "alert(1)" };
void eventAttribute;
