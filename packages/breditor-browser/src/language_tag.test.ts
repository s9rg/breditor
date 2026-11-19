import { describe, expect, it } from "vitest";
import { canonicalLanguageTagV1, isCanonicalLanguageTagV1 } from "./language_tag.js";
import {
  createInlineFormatRenderAttributePolicy,
  inlineFormatRenderAttributePolicyMatchesFormatDescriptor,
  inlineFormatRenderAttributesAreCanonicalForPolicy,
  resolveInlineFormatRenderAttributes,
} from "./inline_format_render_attributes.js";
import { createInlineFormatRenderManifest } from "./inline_format_render_manifest.js";
import type { BrowserProfileFormatDescriptor } from "./wasm_profile_descriptor.js";

const format = (min = 2, max = 35, presence = "required"): BrowserProfileFormatDescriptor => ({
  kind: "breditor/text-language",
  revision: 1,
  properties: [{ name: "breditor/language-tag", presence, valueType: { kind: "string", minimumUtf8Bytes: min, maximumUtf8Bytes: max } }],
}) as unknown as BrowserProfileFormatDescriptor;

describe("safeLanguageTagV1", () => {
  it("canonicalizes the bounded grammar", () => {
    expect(canonicalLanguageTagV1("zh-hant-tw")).toBe("zh-Hant-TW");
    expect(canonicalLanguageTagV1("x-private")).toBeNull();
    expect(isCanonicalLanguageTagV1("fr-CA")).toBe(true);
    expect(isCanonicalLanguageTagV1("fr-ca")).toBe(false);
  });
  it("binds the exact property domain and emits only a canonical lang", () => {
    const policy = createInlineFormatRenderAttributePolicy({ kind: "safeLanguageTagV1", propertyName: "breditor/language-tag" });
    expect(inlineFormatRenderAttributePolicyMatchesFormatDescriptor(policy, format())).toBe(true);
    for (const other of [format(1), format(2, 36), format(2, 35, "optional")]) {
      expect(inlineFormatRenderAttributePolicyMatchesFormatDescriptor(policy, other)).toBe(false);
    }
    expect(resolveInlineFormatRenderAttributes(policy, [{ name: "breditor/language-tag", value: "fr-CA" }])).toEqual([{ name: "lang", value: "fr-CA" }]);
    for (const value of ["fr-ca", "x-none", "", 7, true]) {
      expect(resolveInlineFormatRenderAttributes(policy, [{ name: "breditor/language-tag", value: value as string }])).toEqual([]);
    }
    expect(resolveInlineFormatRenderAttributes(policy, [{ name: "other/tag", value: "en" }])).toEqual([]);
    expect(inlineFormatRenderAttributesAreCanonicalForPolicy(policy, [{ name: "lang", value: "en-GB" }])).toBe(true);
    expect(inlineFormatRenderAttributesAreCanonicalForPolicy(policy, [{ name: "lang", value: "en-gb" }])).toBe(false);
    expect(inlineFormatRenderAttributesAreCanonicalForPolicy(policy, [{ name: "style", value: "x" }])).toBe(false);
    expect(() => createInlineFormatRenderAttributePolicy({ kind: "safeLanguageTagV1", propertyName: "bad" })).toThrow(TypeError);
    expect(() => createInlineFormatRenderAttributePolicy({ kind: "safeLanguageTagV1", propertyName: "a/b", extra: 1 })).toThrow(TypeError);
  });
  it("requires the canonical span signature in a render manifest", () => {
    const attributes = { kind: "safeLanguageTagV1", propertyName: "breditor/language-tag" };
    expect(createInlineFormatRenderManifest({ recipes: [{ formatKind: "breditor/text-language", element: "span", classes: ["breditor-text-language"], attributes }] }).recipes).toHaveLength(1);
    expect(() => createInlineFormatRenderManifest({ recipes: [{ formatKind: "breditor/text-language", element: "span", classes: ["other"], attributes }] })).toThrow(TypeError);
    expect(() => createInlineFormatRenderManifest({ recipes: [{ formatKind: "breditor/text-language", element: "em", classes: ["breditor-text-language"], attributes }] })).toThrow(TypeError);
  });
});
