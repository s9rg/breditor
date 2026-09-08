import {
  type RenderedProjection,
  isOwnedRenderedProjection,
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
  const preflight = validateRenderedForTargetRange(rendered);
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

    const start = mapDomPointToBaseSelectionPoint(
      rendered,
      snapshot.startContainer,
      snapshot.startOffset,
    );
    if (!start.ok) {
      return selectionFailure(start.code);
    }
    const end = mapDomPointToBaseSelectionPoint(
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
    return BaseTargetRange.create(rendered, {
      kind: "range",
      start: start.value,
      end: end.value,
    });
  } catch {
    return selectionFailure("selection.dom_read_failed");
  }
}

function validateRenderedForTargetRange(rendered: RenderedProjection): DomRangePreflight {
  if (!isOwnedRenderedProjection(rendered) || !rendered.current) {
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
