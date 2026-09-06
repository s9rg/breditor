import {
  isOwnedProjection,
  type BaseDocumentProjection,
  type ProjectionSnapshot,
} from "./projection.js";

/** Maximum UTF-8 bytes in a plain-text projection, including paragraph LFs. */
export const MAX_BROWSER_PLAIN_TEXT_UTF8_BYTES = 8_398_607;

/** Bounded plain text derived only from the authoritative semantic projection. */
export interface BrowserProjectionPlainText {
  readonly text: string;
  readonly utf8Bytes: number;
  readonly snapshot: ProjectionSnapshot;
}

/** Payload-redacted failure from semantic plain-text projection. */
export type BrowserProjectionPlainTextError =
  | Readonly<{
      kind: "boundary";
      code: "plain_text.invalid_projection";
      message: "The semantic projection cannot be exported as plain text.";
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "plain_text.adapter_unavailable";
      message: "The semantic plain-text reader is permanently unavailable.";
    }>;

/** Result of a bounded, DOM-independent plain-text traversal. */
export type BrowserProjectionPlainTextResult =
  | Readonly<{ ok: true; content: BrowserProjectionPlainText }>
  | Readonly<{ ok: false; error: BrowserProjectionPlainTextError }>;

/** Handle-free reader issued by the projection-owning command adapter. */
export interface ProjectionPlainTextReadPort {
  read(): BrowserProjectionPlainTextResult | undefined;
}

const INVALID_PROJECTION: BrowserProjectionPlainTextError = Object.freeze({
  kind: "boundary",
  code: "plain_text.invalid_projection",
  message: "The semantic projection cannot be exported as plain text.",
});
const ADAPTER_UNAVAILABLE: BrowserProjectionPlainTextError = Object.freeze({
  kind: "lifecycle",
  code: "plain_text.adapter_unavailable",
  message: "The semantic plain-text reader is permanently unavailable.",
});
const ARRAY_JOIN = Array.prototype.join;

/**
 * Joins semantic paragraphs with one LF, preserving empty paragraphs and
 * stripping all formatting. DOM textContent is intentionally never consulted.
 *
 * The final paragraph has no synthetic trailing LF. For example, three empty
 * paragraphs export as two LFs, while one empty paragraph exports as `""`.
 */
export function projectPlainText(
  projection: BaseDocumentProjection,
): BrowserProjectionPlainTextResult {
  if (!isOwnedProjection(projection)) return failure();
  try {
    const chunks: string[] = [];
    let utf8Bytes = 0;
    const paragraphs = projection.paragraphs;
    for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
      if (paragraphIndex !== 0) {
        utf8Bytes += 1;
        if (utf8Bytes > MAX_BROWSER_PLAIN_TEXT_UTF8_BYTES) return failure();
        chunks.push("\n");
      }
      const paragraph = paragraphs[paragraphIndex];
      if (paragraph === undefined) return failure();
      for (let runIndex = 0; runIndex < paragraph.runs.length; runIndex += 1) {
        const run = paragraph.runs[runIndex];
        if (run === undefined) return failure();
        const bytes = utf8Length(run.text, MAX_BROWSER_PLAIN_TEXT_UTF8_BYTES - utf8Bytes);
        if (bytes === null) return failure();
        utf8Bytes += bytes;
        chunks.push(run.text);
      }
    }
    const text = Reflect.apply(ARRAY_JOIN, chunks, [""]) as string;
    const snapshot = projection.snapshot;
    const content: BrowserProjectionPlainText = Object.freeze({
      text,
      utf8Bytes,
      snapshot,
    });
    return Object.freeze({ ok: true, content });
  } catch {
    return failure();
  }
}

/** @internal */
export function invalidProjectionPlainTextResult(): BrowserProjectionPlainTextResult {
  return failure();
}

/** @internal */
export function unavailableProjectionPlainTextResult(): BrowserProjectionPlainTextResult {
  return Object.freeze({ ok: false, error: ADAPTER_UNAVAILABLE });
}

function failure(): BrowserProjectionPlainTextResult {
  return Object.freeze({ ok: false, error: INVALID_PROJECTION });
}

function utf8Length(value: string, maximum: number): number | null {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first <= 0x7f) bytes += 1;
    else if (first <= 0x7ff) bytes += 2;
    else if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) return null;
    else bytes += 3;
    if (bytes > maximum) return null;
  }
  return bytes;
}
