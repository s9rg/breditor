import {
  type RenderedProjection,
  isOwnedRenderedProjection,
  isOwnedFlatListRenderedProjection,
  isOwnedNestedListRenderedProjection,
} from "./dom_renderer.js";
import { mapDomPointToBaseSelectionPoint } from "./dom_point_mapping.js";
import {
  nativeAbstractRangeFacts,
  nativeContainsNode,
  nativeDocumentCreateRange,
  nativeHtmlHostFacts,
  nativeIsConnected,
  nativeOwnerDocument,
  nativeRangeFacts,
  nativeRangeIntersectsNode,
  nativeRangeSetEnd,
  nativeRangeSetStart,
} from "./html_host.js";
import type {
  BrowserSelectionErrorCode,
  BrowserSelectionResult,
} from "./selection_result.js";
import { selectionFailure } from "./selection_result.js";
import { BaseTargetRange } from "./target_range.js";
import { FlatListTargetRange } from "./flat_list_target_range.js";
import type { FlatListDocumentProjection } from "./flat_list_projection.js";
import { mapDomPointToFlatListSelectionPoint } from "./flat_list_dom_point_mapping.js";
import { NestedListTargetRange } from "./nested_list_target_range.js";
import type { NestedListDocumentProjection } from "./nested_list_projection.js";
import { mapDomPointToNestedListSelectionPoint } from "./nested_list_dom_point_mapping.js";

type TargetRender = RenderedProjection | RenderedProjection<FlatListDocumentProjection> | RenderedProjection<NestedListDocumentProjection>;

interface DomRangeSnapshot {
  readonly startContainer: Node;
  readonly startOffset: number;
  readonly endContainer: Node;
  readonly endOffset: number;
}

type DomRangeSnapshotResult =
  | { readonly ok: true; readonly value: DomRangeSnapshot }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

type DomRangePreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

/**
 * Normalizes one native directionless range into snapshot-local semantic points.
 *
 * The four DOM boundary fields are read once and immediately reduced to scalar
 * AST coordinates. Neither the supplied `StaticRange`/`Range` nor its endpoint
 * nodes are retained. Native ordering and host ownership are proved rather than
 * inferred from the eventual semantic aliases.
 */
export function mapDomTargetRange(
  rendered: RenderedProjection,
  range: AbstractRange,
): BrowserSelectionResult<BaseTargetRange> {
  return mapTargetRange(rendered, range, false) as BrowserSelectionResult<BaseTargetRange>;
}

/** Same native ordering/host checks, retaining full list-item AST paths. @internal */
export function mapDomFlatListTargetRange(rendered: RenderedProjection<FlatListDocumentProjection>,
  range: AbstractRange): BrowserSelectionResult<FlatListTargetRange> {
  return mapTargetRange(rendered, range, true) as BrowserSelectionResult<FlatListTargetRange>;
}

/** Native target range with exact recursive AST coordinates and render ownership. @internal */
export function mapDomNestedListTargetRange(rendered: RenderedProjection<NestedListDocumentProjection>,
  range: AbstractRange): BrowserSelectionResult<NestedListTargetRange> {
  return mapTargetRange(rendered, range, "nested") as BrowserSelectionResult<NestedListTargetRange>;
}

function mapTargetRange(rendered: TargetRender, range: AbstractRange, flatLists: boolean | "nested"): BrowserSelectionResult<BaseTargetRange | FlatListTargetRange | NestedListTargetRange> {
  const preflight = validateRenderedForTargetRange(rendered, flatLists);
  if (!preflight.ok) {
    return selectionFailure(preflight.code);
  }

  try {
    const captured = captureDomRange(range);
    if (!captured.ok) {
      return selectionFailure(captured.code);
    }
    if (!rendered.validateCanonicalDom()) {
      return selectionFailure("selection.dom_drift");
    }
    const snapshot = captured.value;
    const ownership = validateDomRangeOwnershipAndOrder(rendered.host, snapshot);
    if (!ownership.ok) {
      return selectionFailure(ownership.code);
    }
    if (!rendered.validateCanonicalDom()) {
      return selectionFailure("selection.dom_drift");
    }

    const start = mapPoint(
      rendered,
      snapshot.startContainer,
      snapshot.startOffset,
    );
    if (!start.ok) {
      return selectionFailure(start.code);
    }
    const end = mapPoint(
      rendered,
      snapshot.endContainer,
      snapshot.endOffset,
    );
    if (!end.ok) {
      return selectionFailure(end.code);
    }
    if (!rendered.validateCanonicalDom()) {
      return selectionFailure("selection.dom_drift");
    }
    const input = {
      kind: "range",
      start: start.value,
      end: end.value,
    };
    return isOwnedNestedListRenderedProjection(rendered) ? NestedListTargetRange.create(rendered, input) : isOwnedFlatListRenderedProjection(rendered) ? FlatListTargetRange.create(rendered, input)
      : BaseTargetRange.create(rendered as RenderedProjection, input);
  } catch {
    return selectionFailure("selection.dom_read_failed");
  }
}

function mapPoint(rendered: TargetRender, node: Node, offset: number) {
  if (isOwnedNestedListRenderedProjection(rendered)) {
    const result = mapDomPointToNestedListSelectionPoint(rendered, node, offset);
    return result.ok ? result : {ok: false as const, code: result.error.code};
  }
  if (isOwnedFlatListRenderedProjection(rendered)) {
    const result = mapDomPointToFlatListSelectionPoint(rendered, node, offset);
    return result.ok ? result : {ok: false as const, code: result.error.code};
  }
  return mapDomPointToBaseSelectionPoint(rendered as RenderedProjection, node, offset);
}

function validateRenderedForTargetRange(rendered: TargetRender, flatLists: boolean | "nested"): DomRangePreflight {
  if (!(flatLists === "nested" ? isOwnedNestedListRenderedProjection(rendered) : flatLists ? isOwnedFlatListRenderedProjection(rendered) : isOwnedRenderedProjection(rendered)) || !rendered.current) {
    return { ok: false, code: "selection.foreign_or_stale_render" };
  }
  return rendered.validateCanonicalDom()
    ? { ok: true }
    : { ok: false, code: "selection.dom_drift" };
}

function captureDomRange(range: AbstractRange): DomRangeSnapshotResult {
  if (typeof range !== "object" || range === null) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  try {
    const { startContainer, startOffset, endContainer, endOffset } =
      nativeAbstractRangeFacts(range);
    if (
      !isNodeLike(startContainer) ||
      !isNodeLike(endContainer) ||
      !isDomOffset(startOffset) ||
      !isDomOffset(endOffset)
    ) {
      return { ok: false, code: "selection.dom_read_failed" };
    }
    return {
      ok: true,
      value: { startContainer, startOffset, endContainer, endOffset },
    };
  } catch {
    return { ok: false, code: "selection.dom_read_failed" };
  }
}

function validateDomRangeOwnershipAndOrder(
  host: HTMLElement,
  snapshot: DomRangeSnapshot,
): DomRangePreflight {
  try {
    const hostFacts = nativeHtmlHostFacts(host);
    if (hostFacts === undefined) {
      return { ok: false, code: "selection.dom_read_failed" };
    }
    const document = hostFacts.ownerDocument;
    if (
      nativeOwnerDocument(snapshot.startContainer) !== document ||
      nativeOwnerDocument(snapshot.endContainer) !== document
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }

    const startInside = nodeIsInsideHost(host, snapshot.startContainer);
    const endInside = nodeIsInsideHost(host, snapshot.endContainer);
    if (startInside !== endInside) {
      return { ok: false, code: "selection.crosses_host" };
    }
    if (
      !hostFacts.isConnected ||
      !nativeIsConnected(snapshot.startContainer) ||
      !nativeIsConnected(snapshot.endContainer)
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }

    const normalized = nativeDocumentCreateRange(document);
    nativeRangeSetStart(normalized, snapshot.startContainer, snapshot.startOffset);
    nativeRangeSetEnd(normalized, snapshot.endContainer, snapshot.endOffset);
    if (!rangeMatchesSnapshot(normalized, snapshot)) {
      // Setting an end before a start collapses a native Range. Requiring all
      // four fields to survive also rejects malformed node-specific offsets.
      return { ok: false, code: "selection.dom_read_failed" };
    }
    if (!startInside) {
      return nativeRangeIntersectsNode(normalized, host)
        ? { ok: false, code: "selection.crosses_host" }
        : { ok: false, code: "selection.ambiguous_dom_point" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "selection.dom_read_failed" };
  }
}

function rangeMatchesSnapshot(range: Range, snapshot: DomRangeSnapshot): boolean {
  const facts = nativeRangeFacts(range);
  return (
    facts.startContainer === snapshot.startContainer &&
    facts.startOffset === snapshot.startOffset &&
    facts.endContainer === snapshot.endContainer &&
    facts.endOffset === snapshot.endOffset
  );
}

function nodeIsInsideHost(host: HTMLElement, node: Node): boolean {
  return nativeContainsNode(host, node);
}

function isNodeLike(value: unknown): value is Node {
  return typeof value === "object" && value !== null;
}

function isDomOffset(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 4_294_967_295
  );
}
