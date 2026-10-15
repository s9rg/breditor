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
} from "./inline_format_render_attributes.js";
export type {
  BrowserProfileFormatDescriptor,
  BrowserProfileFormatPropertyDescriptor,
  BrowserProfileFormatPropertyValueType,
} from "./wasm_profile_descriptor.js";
export type {InlineFormatPropertyProjection} from "./projection.js";
