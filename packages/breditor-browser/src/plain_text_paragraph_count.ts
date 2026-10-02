/** Mirrors Rust's InsertPlainTextInput source-paragraph ceiling. */
export const MAX_PLAIN_TEXT_PARAGRAPHS = 10_000;

/**
 * Counts structural paragraphs after Rust's CRLF/CR/LF normalization without
 * allocating a normalized string. Call only after bounding and validating text.
 * Unicode line/paragraph separators are text, not structural boundaries.
 */
export function normalizedParagraphCount(value: string): number {
  let count = 1;
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current === 0x0d) {
      count += 1;
      if (value.charCodeAt(index + 1) === 0x0a) index += 1;
    } else if (current === 0x0a) {
      count += 1;
    }
  }
  return count;
}
