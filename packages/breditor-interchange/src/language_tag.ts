/**
 * Bounded BCP 47 language-tag grammar of rich V4 text language. This package has no
 * runtime dependency on `@breditor/browser`, so it keeps an identical copy of
 * `packages/breditor-browser/src/language_tag.ts`; a parity test compares both.
 *
 * Mirrors Rust `rich_content/text_language.rs` exactly (the Rust owner remains
 * authoritative):
 * `language ["-" script] ["-" region] *("-" variant)`, at most 35 ASCII bytes,
 * language 2–3 or 5–8 letters, script 4 letters, region 2 letters or 3 digits,
 * variant 5–8 alphanumerics or a digit plus 3 alphanumerics, no duplicate
 * variants. Extended language subtags, extensions, private use (`x-…`) and
 * grandfathered irregular tags are rejected; `_` is not a separator.
 */
export const MAX_LANGUAGE_TAG_V1_BYTES = 35;
export const MIN_LANGUAGE_TAG_V1_BYTES = 2;
const ALPHA = /^[A-Za-z]+$/u;
const DIGITS = /^[0-9]+$/u;
const SHAPE = /^[A-Za-z0-9-]+$/u;

/**
 * Canonical case form of a well-formed tag (language lowercase, Script
 * titlecase, REGION uppercase, variants lowercase), or `null` when the value is
 * not a well-formed bounded tag. Case alone never causes rejection.
 */
export function canonicalLanguageTagV1(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_LANGUAGE_TAG_V1_BYTES ||
    value.length > MAX_LANGUAGE_TAG_V1_BYTES || !SHAPE.test(value)) return null;
  const subtags = value.split("-");
  const output: string[] = [];
  let index = 0;
  const language = subtags[index++]!;
  if (!ALPHA.test(language) || !(language.length <= 3 && language.length >= 2 || language.length >= 5 && language.length <= 8)) return null;
  output.push(language.toLowerCase());
  const script = subtags[index];
  if (script !== undefined && script.length === 4 && ALPHA.test(script)) {
    output.push(script[0]!.toUpperCase() + script.slice(1).toLowerCase());
    index++;
  }
  const region = subtags[index];
  if (region !== undefined && (region.length === 2 && ALPHA.test(region) || region.length === 3 && DIGITS.test(region))) {
    output.push(region.toUpperCase());
    index++;
  }
  const variants = new Set<string>();
  for (; index < subtags.length; index++) {
    const variant = subtags[index]!;
    const shaped = variant.length >= 5 && variant.length <= 8 || variant.length === 4 && DIGITS.test(variant[0]!);
    const lower = variant.toLowerCase();
    if (!shaped || variants.has(lower)) return null;
    variants.add(lower);
    output.push(lower);
  }
  return output.join("-");
}

/** Whether a value is already exactly the canonical stored form. */
export function isCanonicalLanguageTagV1(value: unknown): value is string {
  return typeof value === "string" && canonicalLanguageTagV1(value) === value;
}
