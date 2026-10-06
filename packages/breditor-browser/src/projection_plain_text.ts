import {
  isOwnedProjection,
  type BaseDocumentProjection,
  type ProjectionSnapshot,
  type BaseParagraphProjection,
} from "./projection.js";
import { isOwnedFlatListProjection, type FlatListDocumentProjection } from "./flat_list_projection.js";
import { isOwnedNestedListProjection, type NestedListDocumentProjection } from "./nested_list_projection.js";
import { wellFormedUtf8Length as utf8Length } from "./well_formed_utf8_length.js";

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
  return projectTextBlocks(projection.snapshot, projection.paragraphs);
}

/**
 * Plain text in document order, one LF between text blocks (including items).
 * Empty items are preserved. List markers/numbering and heading/inline formats
 * are intentionally absent from plain text; use Document JSON for lossless data.
 * Keeps the existing export byte ceiling, independently of AST limits. @internal
 */
export function projectFlatListPlainText(projection: FlatListDocumentProjection): BrowserProjectionPlainTextResult {
  if (!isOwnedFlatListProjection(projection)) return failure();
  function* blocks(): Iterable<BaseParagraphProjection> {
    for (const entry of projection.textBlocks) yield entry.block;
  }
  return projectTextBlocks(projection.snapshot, blocks());
}

/** Recursive reading-order text; empty blocks survive, markers and indentation do not. @internal */
export function projectNestedListPlainText(projection: NestedListDocumentProjection): BrowserProjectionPlainTextResult {
  if (!isOwnedNestedListProjection(projection)) return failure();
  function* blocks(): Iterable<BaseParagraphProjection> {
    for (const entry of projection.textBlocks) yield entry.block;
  }
  return projectTextBlocks(projection.snapshot, blocks());
}

function projectTextBlocks(snapshot: ProjectionSnapshot, paragraphs: Iterable<BaseParagraphProjection>): BrowserProjectionPlainTextResult {
  try {
    const chunks: string[] = [];
    let utf8Bytes = 0;
    let first = true;
    for (const paragraph of paragraphs) {
      if (!first) {
        utf8Bytes += 1;
        if (utf8Bytes > MAX_BROWSER_PLAIN_TEXT_UTF8_BYTES) return failure();
        chunks.push("\n");
      }
      first = false;
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
