/**
 * Closed, DOM-free presentation policies shared by Breditor editor owners.
 * This subpath does not bootstrap an editor or grant schema/action authority.
 */
export {
  createInlineFormatRenderManifest,
  type InlineFormatRenderManifest,
  type InlineFormatRenderRecipe,
  type InlineFormatRenderElement,
} from "./inline_format_render_manifest.js";
export {compileInlineFormatRecipes} from "./compiled_browser_presentation.js";
export {
  resolveInlineFormatRenderAttributes,
  type InlineFormatRenderAttribute,
  type InlineFormatRenderAttributePolicy,
  type InlineFormatRenderSafeRgb24V1Policy,
  type InlineFormatRenderSafeTextSizeV1Policy,
  type InlineFormatRenderSafeLanguageTagV1Policy,
} from "./inline_format_render_attributes.js";
export {
  canonicalLanguageTagV1,
  isCanonicalLanguageTagV1,
  MAX_LANGUAGE_TAG_V1_BYTES,
  MIN_LANGUAGE_TAG_V1_BYTES,
} from "./language_tag.js";
export {
  canonicalImageLinkHrefV1,
  imageLinkRenderAttributesV1,
  isImageLinkHrefV1,
  MAX_IMAGE_LINK_HREF_V1_BYTES,
} from "./image_link_href.js";
export type {
  BrowserProfileFormatDescriptor,
  BrowserProfileFormatPropertyDescriptor,
  BrowserProfileFormatPropertyValueType,
} from "./wasm_profile_descriptor.js";
export type {InlineFormatPropertyProjection} from "./projection.js";
