import { isOwnedNestedListRenderedProjection, type RenderedProjection } from "./dom_renderer.js";
import type { NestedListDocumentProjection } from "./nested_list_projection.js";
import { nestedListBlockAtPath, validateNestedListSelectionPoint } from "./nested_list_selection.js";
import { nativeChildNodes, nativeContainsNode, nativeElementLocalName, nativeNodeType, nativeParentNode } from "./html_host.js";
import type { BaseSelectionPoint } from "./selection.js";
import { selectionFailure, selectionSuccess, type BrowserSelectionResult } from "./selection_result.js";

type NestedRender = RenderedProjection<NestedListDocumentProjection>;

/**
 * Maps one canonical DOM boundary to actual list AST coordinates. Interior
 * root/list boundaries remain ambiguous; only their outer edges normalize to
 * the first/last descendant text block. Item ends include their child sections.
 * Native selection direction/echo handling belongs to the selection bridge.
 * @internal
 */
export function mapDomPointToNestedListSelectionPoint(rendered: NestedRender, node: Node, offset: number): BrowserSelectionResult<BaseSelectionPoint> {
  try {
    if (!isOwnedNestedListRenderedProjection(rendered) || !rendered.current) return selectionFailure("selection.foreign_or_stale_render");
    if (!rendered.validateCanonicalDom()) return selectionFailure("selection.dom_drift");
    if (!Number.isSafeInteger(offset) || offset < 0 || !nativeContainsNode(rendered.host, node)) return selectionFailure("selection.ambiguous_dom_point");
    const projection = rendered.projection;
    const boundary = (path: readonly number[], end: boolean): BrowserSelectionResult<BaseSelectionPoint> => {
      const block = nestedListBlockAtPath(projection, path);
      return block === undefined ? selectionFailure("selection.ambiguous_dom_point") : validateNestedListSelectionPoint(projection,
        {kind: "children", parentPath: path, childIndex: end ? block.runs.length : 0, affinity: end && block.runs.length > 0 ? "before" : "after"});
    };
    const path = rendered.astPathForDomNode(node);
    if (path !== null) {
      if (nativeNodeType(node) === 3) {
        const block = nestedListBlockAtPath(projection, path.slice(0, -1));
        const run = block?.runs[path[path.length - 1]!];
        return validateNestedListSelectionPoint(projection, {kind: "text", textPath: path, utf16Offset: offset,
          affinity: run !== undefined && offset === run.text.length ? "before" : "after"});
      }
      const block = nestedListBlockAtPath(projection, path);
      if (block !== undefined) {
        if (offset > nativeChildNodes(node).length) return selectionFailure("selection.ambiguous_dom_point");
        const childIndex = block.runs.length === 0 ? 0 : offset;
        return validateNestedListSelectionPoint(projection, {kind: "children", parentPath: path, childIndex,
          affinity: block.runs.length > 0 && childIndex === block.runs.length ? "before" : "after"});
      }
      const count = nativeChildNodes(node).length;
      if (offset !== 0 && offset !== count) return selectionFailure("selection.ambiguous_dom_point");
      const end = offset === count;
      // A wrapper edge means the first/last block in that whole subtree,
      // including descendants of its final item. Interior edges stay ambiguous.
      const entries = projection.textBlocks;
      for (let index = end ? entries.length - 1 : 0; end ? index >= 0 : index < entries.length; index += end ? -1 : 1) {
        const entry = entries[index]!;
        if (path.every((part, depth) => entry.path[depth] === part)) return boundary(entry.path, end);
      }
      return selectionFailure("selection.ambiguous_dom_point");
    }
    if (nativeNodeType(node) !== 1) return selectionFailure("selection.ambiguous_dom_point");
    if (nativeElementLocalName(node as Element) === "br") {
      const parent = nativeParentNode(node);
      const parentPath = parent === null ? null : rendered.astPathForDomNode(parent);
      return offset === 0 && parentPath !== null && nestedListBlockAtPath(projection, parentPath)?.runs.length === 0
        ? boundary(parentPath, false) : selectionFailure("selection.ambiguous_dom_point");
    }
    if (offset > 1) return selectionFailure("selection.ambiguous_dom_point");
    let current = node;
    for (let depth = 0; depth < 32; depth += 1) {
      const children = nativeChildNodes(current);
      const child = children[0];
      if (children.length !== 1 || child === undefined || nativeParentNode(child) !== current) break;
      current = child;
      const textPath = rendered.astPathForDomNode(current);
      if (textPath !== null) {
        if (nativeNodeType(current) !== 3) break;
        const run = nestedListBlockAtPath(projection, textPath.slice(0, -1))?.runs[textPath[textPath.length - 1]!];
        if (run === undefined) break;
        return validateNestedListSelectionPoint(projection, {kind: "text", textPath, utf16Offset: offset === 0 ? 0 : run.text.length,
          affinity: offset === 0 ? "after" : "before"});
      }
    }
    return selectionFailure("selection.ambiguous_dom_point");
  } catch { return selectionFailure("selection.ambiguous_dom_point"); }
}

/** Validates one semantic endpoint before locating its canonical DOM boundary. @internal */
export function mapNestedListSelectionPointToDomPoint(rendered: NestedRender, input: unknown): BrowserSelectionResult<Readonly<{node: Node; offset: number}>> {
  if (!isOwnedNestedListRenderedProjection(rendered) || !rendered.current) return selectionFailure("selection.foreign_or_stale_render");
  if (!rendered.validateCanonicalDom()) return selectionFailure("selection.dom_drift");
  const point = validateNestedListSelectionPoint(rendered.projection, input);
  if (!point.ok) return point;
  const value = point.value;
  const node = rendered.nodeForAstPath(value.kind === "text" ? value.textPath : value.parentPath);
  return node === null ? selectionFailure("selection.invalid_point") : selectionSuccess(Object.freeze({node,
    offset: value.kind === "text" ? value.utf16Offset : value.childIndex}));
}

