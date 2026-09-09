import type {
  BaseDocumentProjection,
  BaseTextRunProjection,
} from "./projection.js";
import {
  projectionMatchesBrowserPresentation,
  projectionPresentation,
  projectionProfileDescriptor,
} from "./projection.js";
import {
  browserPresentationRecipesForFormatDetails,
  type BrowserCompiledPresentation,
  type BrowserResolvedInlineFormatRenderRecipe,
} from "./compiled_browser_presentation.js";
import type { InlineFormatRenderRecipe } from "./inline_format_render_manifest.js";
import {
  isOwnedBaseRangeSelection,
  spatialPositionForPoint,
  type BaseRangeSelection,
  type BaseSelectionPoint,
} from "./selection.js";

/** Largest plain clipboard serialization admitted from one base projection. */
export const MAX_CLIPBOARD_FRAGMENT_TEXT_UTF16 = 8 * 1024 * 1024 + 9_999;

/** UTF-8 companion to {@link MAX_CLIPBOARD_FRAGMENT_TEXT_UTF16}. */
export const MAX_CLIPBOARD_FRAGMENT_TEXT_UTF8 = 8 * 1024 * 1024 + 9_999;

/**
 * Fixed ceiling for escaped HTML copied from one bounded base projection.
 *
 * The source projection admits at most 8 MiB of text and 100,000 nodes. This
 * independent ceiling bounds worst-case five-character text escaping and
 * checked recipe markup. A format-heavy selection may hit it before the text
 * ceiling; no recipe vocabulary is allowed to make allocation unbounded.
 */
export const MAX_CLIPBOARD_FRAGMENT_HTML_UTF16 = 64 * 1024 * 1024;

/** UTF-8 companion to {@link MAX_CLIPBOARD_FRAGMENT_HTML_UTF16}. */
export const MAX_CLIPBOARD_FRAGMENT_HTML_UTF8 = 64 * 1024 * 1024;

/** Maximum total semantic wrappers emitted by one clipboard serialization. */
export const MAX_CLIPBOARD_FRAGMENT_FORMAT_WRAPPERS = 200_000;

/** Stable, payload-redacted selection serialization failures. */
export type ClipboardFragmentErrorCode =
  | "clipboard.fragment.invalid_selection"
  | "clipboard.fragment.empty_selection"
  | "clipboard.fragment.html_unrepresentable"
  | "clipboard.fragment.resource_limit";

/** A safe diagnostic which never contains selected document text. */
export interface ClipboardFragmentError {
  readonly code: ClipboardFragmentErrorCode;
  readonly message: string;
}

/** Both interoperable clipboard representations of one semantic selection. */
export interface ClipboardFragmentSerialization {
  /** Selected paragraph text joined with LF separators. */
  readonly plainText: string;
  /** Escaped `<p>`/`<br>` HTML with only checked inline recipe wrappers. */
  readonly html: string;
}

/** Total result of semantic selection slicing and clipboard serialization. */
export type ClipboardFragmentSerializationResult =
  | Readonly<{ ok: true; value: ClipboardFragmentSerialization }>
  | Readonly<{ ok: false; error: ClipboardFragmentError }>;

interface SpatialPoint {
  readonly paragraphIndex: number;
  readonly utf16Offset: number;
}

interface SerializationBudget {
  plainUtf16: number;
  plainUtf8: number;
  htmlUtf16: number;
  htmlUtf8: number;
}

const ERROR_MESSAGES: Readonly<Record<ClipboardFragmentErrorCode, string>> =
  Object.freeze({
    "clipboard.fragment.invalid_selection":
      "The clipboard selection is foreign or invalid.",
    "clipboard.fragment.empty_selection":
      "The clipboard selection contains no semantic content.",
    "clipboard.fragment.html_unrepresentable":
      "The selection cannot be represented exactly in clipboard HTML.",
    "clipboard.fragment.resource_limit":
      "The clipboard serialization exceeds a fixed resource limit.",
  });

const HTML_ESCAPE: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "\r": "&#13;",
});
const EMPTY_STRINGS: readonly string[] = Object.freeze([]);
const LEGACY_STRONG_RECIPE: InlineFormatRenderRecipe = Object.freeze({
  formatKind: "breditor/strong",
  element: "strong",
  classes: EMPTY_STRINGS,
  before: EMPTY_STRINGS,
  after: EMPTY_STRINGS,
});
const EMPTY_RENDER_ATTRIBUTES = Object.freeze([]);
const LEGACY_STRONG_RECIPES: readonly BrowserResolvedInlineFormatRenderRecipe[] =
  Object.freeze([Object.freeze({
    recipe: LEGACY_STRONG_RECIPE,
    attributes: EMPTY_RENDER_ATTRIBUTES,
  })]);
const EMPTY_RECIPES: readonly BrowserResolvedInlineFormatRenderRecipe[] =
  Object.freeze([]);

// A bounded base projection contains at most 100,000 AST nodes and about 8 MiB
// of text. Profiled runs can add two chunks per format wrapper; block encoding
// adds at most one partial block per run plus 129 full blocks. Keep that
// combined allocation property executable instead of relying only on final
// string size.
const MAX_SERIALIZATION_CHUNKS = 500_000;

// Bounding the temporary piece array is as important as bounding the final
// output. In particular, V8's callback replacement path retains substantial
// transient state for an 8 MiB all-escape run.
const HTML_ESCAPE_SOURCE_BLOCK_UTF16 = 64 * 1024;

/**
 * Slices one exact semantic range and serializes it without consulting the DOM.
 *
 * Spatial direction is normalized only for slicing; the supplied branded
 * selection remains directional and unchanged. Text offsets stay in UTF-16,
 * so partial runs are cut only at the Unicode-scalar boundaries already proved
 * by `BaseRangeSelection`. A cross-paragraph selection retains its leading,
 * trailing, and interior empty paragraph slices. Consequently a selection
 * containing only one paragraph boundary serializes as LF and two empty `<p>`
 * elements rather than being mistaken for a collapsed selection.
 *
 * The HTML vocabulary is intentionally closed. Caller text is emitted only
 * through escaping, never as markup, and no DOM or HTML parser is involved.
 * Omitting `presentation` retains the exact legacy strong-only encoding for an
 * unprofiled base projection. A profile-bound projection requires its exact
 * renderer-bound presentation; a missing, foreign, or forged presentation
 * fails without emitting selected content.
 */
export function serializeClipboardSelection(
  selection: unknown,
  presentation?: BrowserCompiledPresentation,
): ClipboardFragmentSerializationResult {
  if (!isOwnedBaseRangeSelection(selection)) {
    return failure("clipboard.fragment.invalid_selection");
  }
  if (selection.order === "collapsed") {
    return failure("clipboard.fragment.empty_selection");
  }

  try {
    return serializeOwnedSelection(selection, presentation);
  } catch {
    return failure("clipboard.fragment.invalid_selection");
  }
}

function serializeOwnedSelection(
  selection: BaseRangeSelection,
  candidatePresentation: BrowserCompiledPresentation | undefined,
): ClipboardFragmentSerializationResult {
  const startPoint = selection.order === "backward" ? selection.focus : selection.anchor;
  const endPoint = selection.order === "backward" ? selection.anchor : selection.focus;
  const start = spatialPoint(selection.projection, startPoint);
  const end = spatialPoint(selection.projection, endPoint);
  if (
    start === null ||
    end === null ||
    start.paragraphIndex > end.paragraphIndex ||
    (start.paragraphIndex === end.paragraphIndex &&
      start.utf16Offset >= end.utf16Offset)
  ) {
    return failure("clipboard.fragment.invalid_selection");
  }
  const presentation = resolveProjectionPresentation(
    selection.projection,
    candidatePresentation,
  );
  if (presentation === null) {
    return failure("clipboard.fragment.invalid_selection");
  }

  const plainChunks: string[] = [];
  const htmlChunks: string[] = [];
  const budget: SerializationBudget = {
    plainUtf16: 0,
    plainUtf8: 0,
    htmlUtf16: 0,
    htmlUtf8: 0,
  };
  let formatWrapperCount = 0;

  for (
    let paragraphIndex = start.paragraphIndex;
    paragraphIndex <= end.paragraphIndex;
    paragraphIndex += 1
  ) {
    const paragraph = selection.projection.paragraphs[paragraphIndex];
    if (paragraph === undefined) {
      return failure("clipboard.fragment.invalid_selection");
    }
    if (
      paragraphIndex !== start.paragraphIndex &&
      !appendPlain(plainChunks, budget, "\n")
    ) {
      return failure("clipboard.fragment.resource_limit");
    }
    if (!appendHtml(htmlChunks, budget, "<p>")) {
      return failure("clipboard.fragment.resource_limit");
    }

    const paragraphLength = paragraph.runs.reduce(
      (length, run) => length + run.text.length,
      0,
    );
    const rangeStart =
      paragraphIndex === start.paragraphIndex ? start.utf16Offset : 0;
    const rangeEnd =
      paragraphIndex === end.paragraphIndex ? end.utf16Offset : paragraphLength;
    if (rangeStart < 0 || rangeEnd < rangeStart || rangeEnd > paragraphLength) {
      return failure("clipboard.fragment.invalid_selection");
    }

    const runs = sliceParagraphRuns(paragraph.runs, rangeStart, rangeEnd);
    if (runs === null) {
      return failure("clipboard.fragment.invalid_selection");
    }
    if (runs.length === 0) {
      if (!appendHtml(htmlChunks, budget, "<br>")) {
        return failure("clipboard.fragment.resource_limit");
      }
    } else {
      let runIndex = 0;
      while (runIndex < runs.length) {
        const run = runs[runIndex];
        if (run === undefined) {
          return failure("clipboard.fragment.invalid_selection");
        }
        const recipes = recipesForRun(run, presentation);
        if (recipes === null) {
          return failure("clipboard.fragment.invalid_selection");
        }
        let groupEnd = runIndex + 1;
        while (groupEnd < runs.length) {
          const next = runs[groupEnd];
          if (next === undefined) {
            return failure("clipboard.fragment.invalid_selection");
          }
          const nextRecipes = recipesForRun(next, presentation);
          if (nextRecipes === null) {
            return failure("clipboard.fragment.invalid_selection");
          }
          if (!resolvedRecipesEqual(recipes, nextRecipes)) break;
          groupEnd += 1;
        }
        formatWrapperCount += recipes.length;
        if (
          formatWrapperCount > MAX_CLIPBOARD_FRAGMENT_FORMAT_WRAPPERS
        ) {
          return failure("clipboard.fragment.resource_limit");
        }
        for (const recipe of recipes) {
          if (!appendHtml(htmlChunks, budget, openingWrapper(recipe))) {
            return failure("clipboard.fragment.resource_limit");
          }
        }
        for (let groupedIndex = runIndex; groupedIndex < groupEnd; groupedIndex += 1) {
          const groupedRun = runs[groupedIndex];
          if (groupedRun === undefined) {
            return failure("clipboard.fragment.invalid_selection");
          }
          // The paired parser rejects tokenizer controls and noncharacters.
          // Keep copy -> paste closed over the exact HTML representation by
          // refusing those scalars before a cut can delete content.
          if (!htmlTextIsRepresentable(groupedRun.text)) {
            return failure("clipboard.fragment.html_unrepresentable");
          }
          if (!appendPlain(plainChunks, budget, groupedRun.text)) {
            return failure("clipboard.fragment.resource_limit");
          }
          if (!appendEscapedHtml(htmlChunks, budget, groupedRun.text)) {
            return failure("clipboard.fragment.resource_limit");
          }
        }
        for (let index = recipes.length - 1; index >= 0; index -= 1) {
          const resolved = recipes[index];
          if (
            resolved === undefined ||
            !appendHtml(htmlChunks, budget, `</${resolved.recipe.element}>`)
          ) {
            return failure("clipboard.fragment.resource_limit");
          }
        }
        runIndex = groupEnd;
      }
    }
    if (!appendHtml(htmlChunks, budget, "</p>")) {
      return failure("clipboard.fragment.resource_limit");
    }
  }

  const plainText = plainChunks.join("");
  const html = htmlChunks.join("");
  if (
    plainText.length !== budget.plainUtf16 ||
    html.length !== budget.htmlUtf16
  ) {
    return failure("clipboard.fragment.invalid_selection");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ plainText, html }),
  });
}

function spatialPoint(
  projection: BaseDocumentProjection,
  point: BaseSelectionPoint,
): SpatialPoint | null {
  const position = spatialPositionForPoint(projection, point);
  return position === null
    ? null
    : { paragraphIndex: position.paragraphIndex, utf16Offset: position.utf16Offset };
}

function resolveProjectionPresentation(
  projection: BaseDocumentProjection,
  candidate: BrowserCompiledPresentation | undefined,
): BrowserCompiledPresentation | undefined | null {
  const bound = projectionPresentation(projection);
  if (bound === undefined) {
    return projectionProfileDescriptor(projection) === undefined &&
      candidate === undefined
      ? undefined
      : null;
  }
  return candidate !== undefined &&
    projectionMatchesBrowserPresentation(projection, candidate)
    ? candidate
    : null;
}

function recipesForRun(
  run: BaseTextRunProjection,
  presentation: BrowserCompiledPresentation | undefined,
): readonly BrowserResolvedInlineFormatRenderRecipe[] | null {
  if (presentation === undefined) {
    if (
      run.strong !== (run.formats.length === 1) ||
      (run.strong && run.formats[0] !== "breditor/strong") ||
      (!run.strong && run.formats.length !== 0)
    ) {
      return null;
    }
    return run.strong ? LEGACY_STRONG_RECIPES : EMPTY_RECIPES;
  }

  if (run.strong !== run.formats.includes("breditor/strong")) return null;
  return browserPresentationRecipesForFormatDetails(
    presentation,
    run.formatDetails,
  ) ?? null;
}

function openingWrapper(
  resolved: BrowserResolvedInlineFormatRenderRecipe,
): string {
  const { recipe } = resolved;
  const classAttribute = recipe.classes.length === 0
    ? ""
    : ` class="${recipe.classes.join(" ")}"`;
  const dynamicAttributes = resolved.attributes.map(
    ({ name, value }) => ` ${name}="${escapeSmallHtmlAttribute(value)}"`,
  ).join("");
  return `<${recipe.element}${classAttribute}${dynamicAttributes}>`;
}

function escapeSmallHtmlAttribute(value: string): string {
  return escapeHtmlBlock(value, 0, value.length);
}

function resolvedRecipesEqual(
  left: readonly BrowserResolvedInlineFormatRenderRecipe[],
  right: readonly BrowserResolvedInlineFormatRenderRecipe[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((resolved, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      resolved.recipe === candidate.recipe &&
      resolved.attributes.length === candidate.attributes.length &&
      resolved.attributes.every((attribute, attributeIndex) => {
        const other = candidate.attributes[attributeIndex];
        return other !== undefined &&
          attribute.name === other.name &&
          attribute.value === other.value;
      });
  });
}

function sliceParagraphRuns(
  runs: readonly BaseTextRunProjection[],
  rangeStart: number,
  rangeEnd: number,
): readonly BaseTextRunProjection[] | null {
  const selected: BaseTextRunProjection[] = [];
  let runStart = 0;
  for (const run of runs) {
    const runEnd = runStart + run.text.length;
    const selectedStart = Math.max(runStart, rangeStart);
    const selectedEnd = Math.min(runEnd, rangeEnd);
    if (selectedStart < selectedEnd) {
      const text = run.text.slice(selectedStart - runStart, selectedEnd - runStart);
      if (text.length === 0 || unicodeScalarUtf8Length(text) === null) {
        return null;
      }
      selected.push(Object.freeze({
        text,
        strong: run.strong,
        formats: run.formats,
        formatDetails: run.formatDetails,
      }));
    }
    runStart = runEnd;
  }
  return Object.freeze(selected);
}

function appendPlain(
  chunks: string[],
  budget: SerializationBudget,
  text: string,
): boolean {
  const bytes = unicodeScalarUtf8Length(text);
  if (bytes === null) return false;
  const utf16 = budget.plainUtf16 + text.length;
  const utf8 = budget.plainUtf8 + bytes;
  if (
    utf16 > MAX_CLIPBOARD_FRAGMENT_TEXT_UTF16 ||
    utf8 > MAX_CLIPBOARD_FRAGMENT_TEXT_UTF8 ||
    chunks.length >= MAX_SERIALIZATION_CHUNKS
  ) {
    return false;
  }
  budget.plainUtf16 = utf16;
  budget.plainUtf8 = utf8;
  chunks.push(text);
  return true;
}

function appendHtml(
  chunks: string[],
  budget: SerializationBudget,
  text: string,
): boolean {
  const bytes = unicodeScalarUtf8Length(text);
  if (bytes === null) return false;
  const utf16 = budget.htmlUtf16 + text.length;
  const utf8 = budget.htmlUtf8 + bytes;
  if (
    utf16 > MAX_CLIPBOARD_FRAGMENT_HTML_UTF16 ||
    utf8 > MAX_CLIPBOARD_FRAGMENT_HTML_UTF8 ||
    chunks.length >= MAX_SERIALIZATION_CHUNKS
  ) {
    return false;
  }
  budget.htmlUtf16 = utf16;
  budget.htmlUtf8 = utf8;
  chunks.push(text);
  return true;
}

function appendEscapedHtml(
  chunks: string[],
  budget: SerializationBudget,
  text: string,
): boolean {
  let escapedUtf16 = 0;
  let escapedUtf8 = 0;
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    const replacement = HTML_ESCAPE[text[index] as string];
    if (replacement !== undefined) {
      escapedUtf16 += replacement.length;
      escapedUtf8 += replacement.length;
    } else if (first <= 0x7f) {
      escapedUtf16 += 1;
      escapedUtf8 += 1;
    } else if (first <= 0x7ff) {
      escapedUtf16 += 1;
      escapedUtf8 += 2;
    } else if (first >= 0xd800 && first <= 0xdbff) {
      const second = text.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return false;
      escapedUtf16 += 2;
      escapedUtf8 += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return false;
    } else {
      escapedUtf16 += 1;
      escapedUtf8 += 3;
    }
    if (
      budget.htmlUtf16 + escapedUtf16 > MAX_CLIPBOARD_FRAGMENT_HTML_UTF16 ||
      budget.htmlUtf8 + escapedUtf8 > MAX_CLIPBOARD_FRAGMENT_HTML_UTF8
    ) {
      return false;
    }
  }

  // Encode bounded source blocks so a hostile all-escape run cannot make the
  // JavaScript engine retain millions of replacement records or array slots.
  let blockStart = 0;
  while (blockStart < text.length) {
    let blockEnd = Math.min(
      blockStart + HTML_ESCAPE_SOURCE_BLOCK_UTF16,
      text.length,
    );
    if (
      blockEnd < text.length &&
      isHighSurrogate(text.charCodeAt(blockEnd - 1)) &&
      isLowSurrogate(text.charCodeAt(blockEnd))
    ) {
      blockEnd -= 1;
    }
    if (chunks.length >= MAX_SERIALIZATION_CHUNKS) return false;
    chunks.push(escapeHtmlBlock(text, blockStart, blockEnd));
    blockStart = blockEnd;
  }

  // The preflight makes these budget updates exact even though encoding is
  // deliberately split across allocation-sized blocks.
  budget.htmlUtf16 += escapedUtf16;
  budget.htmlUtf8 += escapedUtf8;
  return true;
}

function escapeHtmlBlock(text: string, start: number, end: number): string {
  const pieces: string[] = [];
  let plainStart = start;
  for (let index = start; index < end; index += 1) {
    const replacement = HTML_ESCAPE[text[index] as string];
    if (replacement === undefined) continue;
    if (plainStart < index) pieces.push(text.slice(plainStart, index));
    pieces.push(replacement);
    plainStart = index + 1;
  }
  if (plainStart < end) pieces.push(text.slice(plainStart, end));
  return pieces.length === 0 ? text.slice(start, end) : pieces.join("");
}

/** Whether strict parse5 tokenization can reproduce every source scalar. */
function htmlTextIsRepresentable(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    let codePoint = first;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = text.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return false;
      codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return false;
    }

    if (
      codePoint === 0 ||
      (codePoint >= 0x01 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      (codePoint >= 0x0e && codePoint <= 0x1f) ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
      (codePoint & 0xffff) === 0xfffe ||
      (codePoint & 0xffff) === 0xffff
    ) {
      return false;
    }
  }
  return true;
}

function unicodeScalarUtf8Length(text: string): number | null {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    if (first <= 0x7f) {
      bytes += 1;
    } else if (first <= 0x7ff) {
      bytes += 2;
    } else if (first >= 0xd800 && first <= 0xdbff) {
      const second = text.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function failure(
  code: ClipboardFragmentErrorCode,
): ClipboardFragmentSerializationResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
  });
}
