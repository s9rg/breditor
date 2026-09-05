import type { RenderedProjection } from "./dom_renderer.js";
import {
  type BaseSelectionPoint,
  isUnicodeScalarBoundary,
} from "./selection.js";
import type { BrowserSelectionErrorCode } from "./selection_result.js";

/** @internal Result of normalizing one exact DOM boundary. */
export type DomPointMappingResult =
  | Readonly<{ ok: true; value: BaseSelectionPoint }>
  | Readonly<{ ok: false; code: BrowserSelectionErrorCode }>;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Applies the single DOM-boundary normalization policy shared by selections
 * and `beforeinput` target ranges.
 *
 * The caller must prove renderer ownership, canonical DOM, host containment,
 * endpoint order, and offset shape around this helper. This function owns only
 * the canonical base-schema point mapping and retains no DOM value.
 *
 * @internal
 */
export function mapDomPointToBaseSelectionPoint(
  rendered: RenderedProjection,
  node: Node,
  offset: number,
): DomPointMappingResult {
  if (node === rendered.host) {
    const paragraphCount = rendered.projection.paragraphs.length;
    if (offset === 0) {
      return {
        ok: true,
        value: Object.freeze({
          kind: "children",
          parentPath: Object.freeze([0]),
          childIndex: 0,
          affinity: "after",
        }),
      };
    }
    if (offset === paragraphCount) {
      const paragraphIndex = paragraphCount - 1;
      const paragraph = rendered.projection.paragraphs[paragraphIndex];
      if (paragraph === undefined) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      return {
        ok: true,
        value: Object.freeze({
          kind: "children",
          parentPath: Object.freeze([paragraphIndex]),
          childIndex: paragraph.runs.length,
          affinity: paragraph.runs.length === 0 ? "after" : "before",
        }),
      };
    }
    return { ok: false, code: "selection.ambiguous_dom_point" };
  }

  const exactPath = rendered.astPathForDomNode(node);
  if (exactPath !== null) {
    if (exactPath.length === 2) {
      const paragraphIndex = exactPath[0];
      const runIndex = exactPath[1];
      const run =
        paragraphIndex === undefined || runIndex === undefined
          ? undefined
          : rendered.projection.paragraphs[paragraphIndex]?.runs[runIndex];
      if (run === undefined || node.nodeType !== 3 || offset > run.text.length) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      if (!isUnicodeScalarBoundary(run.text, offset)) {
        return { ok: false, code: "selection.invalid_utf16_boundary" };
      }
      return {
        ok: true,
        value: Object.freeze({
          kind: "text",
          textPath: exactPath,
          utf16Offset: offset,
          affinity: boundaryAffinity(offset, run.text.length),
        }),
      };
    }
    if (exactPath.length === 1) {
      const paragraphIndex = exactPath[0];
      const paragraph =
        paragraphIndex === undefined
          ? undefined
          : rendered.projection.paragraphs[paragraphIndex];
      if (paragraph === undefined) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      const childIndex =
        paragraph.runs.length === 0 && (offset === 0 || offset === 1) ? 0 : offset;
      if (
        childIndex > paragraph.runs.length ||
        (paragraph.runs.length === 0 && offset > 1)
      ) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      return {
        ok: true,
        value: Object.freeze({
          kind: "children",
          parentPath: exactPath,
          childIndex,
          affinity: boundaryAffinity(childIndex, paragraph.runs.length),
        }),
      };
    }
    return { ok: false, code: "selection.ambiguous_dom_point" };
  }

  if (isHtmlElementNamed(node, "STRONG")) {
    const paragraph = node.parentNode;
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    if (
      paragraph === null ||
      paragraphPath === null ||
      paragraphPath.length !== 1 ||
      (offset !== 0 && offset !== 1)
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    const runIndex = indexOfChild(paragraph, node);
    const paragraphIndex = paragraphPath[0];
    const run =
      paragraphIndex === undefined || runIndex < 0
        ? undefined
        : rendered.projection.paragraphs[paragraphIndex]?.runs[runIndex];
    const text = node.childNodes[0];
    if (
      paragraphIndex === undefined ||
      runIndex < 0 ||
      run === undefined ||
      !run.strong ||
      text === undefined ||
      text.nodeType !== 3
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    const utf16Offset = offset === 0 ? 0 : run.text.length;
    return {
      ok: true,
      value: Object.freeze({
        kind: "text",
        textPath: Object.freeze([paragraphIndex, runIndex]),
        utf16Offset,
        affinity: boundaryAffinity(utf16Offset, run.text.length),
      }),
    };
  }

  if (isHtmlElementNamed(node, "BR") && offset === 0) {
    const paragraph = node.parentNode;
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    const paragraphIndex = paragraphPath?.[0];
    if (
      paragraphPath === null ||
      paragraphPath.length !== 1 ||
      paragraphIndex === undefined ||
      rendered.projection.paragraphs[paragraphIndex]?.runs.length !== 0
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    return {
      ok: true,
      value: Object.freeze({
        kind: "children",
        parentPath: paragraphPath,
        childIndex: 0,
        affinity: "after",
      }),
    };
  }

  return { ok: false, code: "selection.ambiguous_dom_point" };
}

function indexOfChild(parent: Node, child: Node): number {
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    if (parent.childNodes[index] === child) {
      return index;
    }
  }
  return -1;
}

function isHtmlElementNamed(node: Node, localName: "STRONG" | "BR"): node is HTMLElement {
  return (
    node.nodeType === 1 &&
    (node as Element).namespaceURI === HTML_NAMESPACE &&
    (node as Element).localName === localName.toLowerCase()
  );
}

function boundaryAffinity(offset: number, length: number): "before" | "after" {
  return length > 0 && offset === length ? "before" : "after";
}
