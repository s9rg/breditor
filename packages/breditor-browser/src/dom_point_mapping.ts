import type { RenderedProjection } from "./dom_renderer.js";
import {
  nativeChildNodes,
  nativeElementLocalName,
  nativeHtmlHostFacts,
  nativeNodeType,
  nativeNodeValue,
  nativeParentNode,
} from "./html_host.js";
import {
  type BaseSelectionPoint,
  isUnicodeScalarBoundary,
} from "./selection.js";
import type { BrowserSelectionErrorCode } from "./selection_result.js";

/** @internal Result of normalizing one exact DOM boundary. */
export type DomPointMappingResult =
  | Readonly<{ ok: true; value: BaseSelectionPoint }>
  | Readonly<{ ok: false; code: BrowserSelectionErrorCode }>;

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
      if (run === undefined || nativeNodeType(node) !== 3 || offset > run.text.length) {
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

  if (
    nativeNodeType(node) === 1 &&
    !isHtmlElementNamed(node, "BR") &&
    offset >= 0 &&
    offset <= 1
  ) {
    const mappedText = soleMappedTextDescendant(rendered, node);
    if (mappedText === null) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    const { path, text } = mappedText;
    const paragraphIndex = path[0];
    const runIndex = path[1];
    const run = paragraphIndex === undefined || runIndex === undefined
      ? undefined
      : rendered.projection.paragraphs[paragraphIndex]?.runs[runIndex];
    if (run === undefined || nativeNodeValue(text) !== run.text) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    const utf16Offset = offset === 0 ? 0 : run.text.length;
    return {
      ok: true,
      value: Object.freeze({
        kind: "text",
        textPath: path,
        utf16Offset,
        affinity: boundaryAffinity(utf16Offset, run.text.length),
      }),
    };
  }

  if (isHtmlElementNamed(node, "BR") && offset === 0) {
    const paragraph = nativeParentNode(node);
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

/** @internal Canonical one-child wrapper chain terminating in a mapped text. */
export function soleMappedTextDescendant(
  rendered: RenderedProjection,
  wrapper: Node,
): Readonly<{
  path: readonly [number, number];
  text: Text;
  wrapperDepth: number;
}> | null {
  let current = wrapper;
  for (let depth = 0; depth <= 32; depth += 1) {
    const children = nativeChildNodes(current);
    const child = children[0];
    if (children.length !== 1 || child === undefined) {
      return null;
    }
    if (nativeParentNode(child) !== current) return null;
    current = child;
    const path = rendered.astPathForDomNode(current);
    if (path !== null) {
      return nativeNodeType(current) === 3 && path.length === 2
        ? {
            path: path as readonly [number, number],
            text: current as Text,
            wrapperDepth: depth + 1,
          }
        : null;
    }
    if (nativeNodeType(current) !== 1) return null;
  }
  return null;
}

function isHtmlElementNamed(node: Node, localName: "BR"): node is HTMLElement {
  const facts = nativeHtmlHostFacts(node);
  return (
    facts !== undefined &&
    nativeElementLocalName(facts.element) === localName.toLowerCase()
  );
}

function boundaryAffinity(offset: number, length: number): "before" | "after" {
  return length > 0 && offset === length ? "before" : "after";
}
